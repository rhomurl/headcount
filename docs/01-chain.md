# Agent A: contracts + chain layer (contracts/**, lib/chain.ts, lib/money.ts, scripts/smoke.ts)

Paste this whole file to your coding agent. Read `CONTRACT.md` first. Only touch the files listed in the title plus `package.json` scripts.

## 0. Prereqs (human does this, 5 min)
```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cast wallet new                     # copy the address + private key into .env.local as OPERATOR_PRIVATE_KEY
```
Fund the operator address with Base Sepolia ETH from the Coinbase Developer Platform faucet (0.1 ETH/day, which is plenty because L2 gas is tiny). Backups: Alchemy, QuickNode, thirdweb faucets.

## 1. Contracts (Foundry)
```bash
mkdir contracts && cd contracts && forge init --no-git --no-commit .
forge install OpenZeppelin/openzeppelin-contracts --no-git
```
Remapping: `@openzeppelin/=lib/openzeppelin-contracts/`. Solidity `^0.8.24`.

- `MockUSDC.sol`: `ERC20("Headcount Test USD","hUSDC")`, `Ownable`. Override `decimals()` to return 6. `mint(address,uint256) onlyOwner`.
- `HeadcountEscrow.sol`: exactly the CONTRACT interface. `token` and `operator` are `immutable`. Use `SafeERC20`. Update state before transfers. Use custom errors: `NotOperator, NotAuthorized, Exists, NoCampaign, Closed, AlreadyPaid, CapReached, Insufficient, ZeroAddress`.
- `test/HeadcountEscrow.t.sol` must cover these cases (keep it short; it's a gate, not a thesis):
  1. Create, fund 50, checkIn, so the host gets perHead and the balance drops.
  2. The same checkinKey twice reverts with AlreadyPaid.
  3. A non-operator calling checkIn reverts.
  4. Cap reached reverts.
  5. Close refunds the sponsor, even when the operator calls it. A random caller reverts.
  6. checkIn after close reverts.
- `script/Deploy.s.sol`: deploy MockUSDC with the deployer as owner. Deploy `HeadcountEscrow(token, deployer)`. Mint 1,000,000e6 to the deployer. `approve(escrow, type(uint256).max)`. Log both addresses.

```bash
forge test
forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $OPERATOR_PRIVATE_KEY --broadcast
```
Put `TOKEN_ADDRESS`, `ESCROW_ADDRESS` and `NEXT_PUBLIC_ESCROW_ADDRESS` into `.env.local`.

Optional (10 min, good for credibility with judges): add `--verify --etherscan-api-key $ETHERSCAN_KEY` (one Etherscan v2 key covers Basescan) so judges can read the source on the explorer.

## 2. lib/money.ts
`DECIMALS = 6`; `toBase(ui: number): bigint` uses `BigInt(Math.round(ui * 1e6))`; `toUi(base: bigint): number`.

## 3. lib/chain.ts
- `account = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as Hex)`
- `publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })`, plus a `walletClient` with the account.
- ABIs via `parseAbi([...])` human-readable strings, matching CONTRACT exactly. Don't import Foundry JSON.
- `campaignKey(id) = keccak256(toHex(id))`; `checkinKey(cid, tid) = keccak256(toHex(cid + ":" + tid))`
- **Serial queue** (required, because one EOA means shared nonces):
  ```ts
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  }
  ```
  Every write uses `enqueue(async () => { const hash = await walletClient.writeContract(...); const r = await publicClient.waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("reverted"); return hash; })`.
  Cache it on `globalThis` so Next hot reload doesn't create two queues.
- `fundCampaign`: inside ONE queued job, `mint(operator, amount)`, wait, then `fund(key, amount)`, wait. Return the fund hash. (Approve was done in Deploy.)
- `getCampaignBalance`: `readContract campaigns(key)` and return the `balance` field. Viem returns a tuple for public struct getters, so index it carefully.
- `isPaid`: `readContract paid(checkinKey)`.
- When a write reverts, surface the custom error name in the thrown message (`err.shortMessage` or the decoded error) so `checkins.error` is readable.

## 4. scripts/smoke.ts (the gate; run with `npx tsx scripts/smoke.ts`)
1. Load `.env.local` with dotenv. Create a campaign with a random id (cap 10, perHead 5). The sponsor and host are fresh random addresses (`privateKeyToAccount(generatePrivateKey()).address`).
2. `fundCampaign(id, toBase(50))`, then log the balance. It should be 50.
3. `payCheckin(id, "t1")`, then log the Basescan link. The balance should be 45 and `isPaid` should be true.
4. `payCheckin(id, "t1")` again must throw with AlreadyPaid.
5. `closeCampaignOnchain(id)`, then the balance should be 0.
6. Exit 0. Any unexpected error exits 1.

## Done when
`forge test` is green and `smoke.ts` prints a Basescan link showing a `CheckedIn` event plus a 5 hUSDC transfer to the host. Commit.

## Fallback (only if contract deploy is still broken at T+1:30)
Keep the exact `lib/chain.ts` exports, but implement them as plain ERC20 `transfer` calls from the operator wallet, with campaign balances tracked in SQLite. The rest of the app doesn't change. Say "custodial v0" on the slide.

## Integration clarification

Use lazy server-only configuration and the global serial queue, including receipt recovery for close: if already closed, return the prior `Closed` event transaction. The `Closed` custom error must be library-namespaced because the event has the same name. Zero amounts/caps use `InvalidAmount`/`InvalidCap`. Validate money rather than silently rounding fractional base units. Tests and local builds need no private environment. No temporary chain adapter is permitted.

Also export `isCampaignClosed(campaignId): Promise<boolean>` for API reconciliation of direct sponsor closure. Authored contracts use SPDX UNLICENSED until the owner selects a license.
