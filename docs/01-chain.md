# Agent A: contracts + chain layer (contracts/**, lib/chain.ts, lib/money.ts, scripts/smoke.ts)

Paste this whole file to your coding agent. Read `CONTRACT.md` first. Only touch the files listed in the title plus `package.json` scripts.

## 0. Current tooling and deployment prerequisites

The Foundry project already exists inside `contracts/` without a nested repository. Use Node 24 and `npm ci`; the lockfile provides Foundry, Solidity 0.8.24 and OpenZeppelin. Do not reinitialize the project or install a separate global toolchain for this repository.

Select a dedicated Base Sepolia operator and fund its public address with testnet ETH. Store its private key in ignored `.env.local` with mode 600; never print it or pass it as a CLI argument. Wallet selection and funding are separate deployment prerequisites recorded in `STATUS.md`.

## 1. Contracts (Foundry)

Run `npm run test:contracts` from the repository root, or `node tools/forge.cjs test` from `contracts/`. The native-binary wrapper propagates Foundry failures correctly. The existing remapping resolves `@openzeppelin/contracts/` from the pinned npm dependency.

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

From the repository root, once operator funding is verified and testnet deployment is authorized:

```bash
node --env-file=.env.local contracts/tools/forge.cjs script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast
```

This command uses the public Base Sepolia RPC. For a provisioned endpoint, load the RPC through a private environment/profile without copying credential-bearing URLs into shared logs. `Deploy.s.sol` rejects chain IDs other than 84532 and reads the signing key from its environment. Record each successful receipt and put `TOKEN_ADDRESS`, `ESCROW_ADDRESS` and matching `NEXT_PUBLIC_ESCROW_ADDRESS` into the private environment before an app build. Broadcast records are ignored.

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

## 4. scripts/smoke.ts (the gate; run with `npm run smoke -- --send-testnet-transactions`)
1. Load `.env.local` with dotenv. Create a campaign with a random id (cap 10, perHead 5). The sponsor and host are fresh random addresses (`privateKeyToAccount(generatePrivateKey()).address`).
2. `fundCampaign(id, toBase(50))`, then log the balance. It should be 50.
3. `payCheckin(id, "t1")`, then log the Basescan link. The balance should be 45 and `isPaid` should be true.
4. `payCheckin(id, "t1")` again must throw with AlreadyPaid.
5. `closeCampaignOnchain(id)`, then the balance should be 0.
6. Exit 0. Any unexpected error exits 1.

## Done when
`npm run test:contracts` is green and `smoke.ts` prints a Basescan link showing a `CheckedIn` event plus a 5 hUSDC transfer to the host. Commit.

## Fallback (only if contract deploy is still broken at T+1:30)
Keep the exact `lib/chain.ts` exports, but implement them as plain ERC20 `transfer` calls from the operator wallet, with campaign balances tracked in SQLite. The rest of the app doesn't change. Say "custodial v0" on the slide.

## Integration clarification

Use lazy server-only configuration and the global serial queue, including receipt recovery for close: if already closed, return the prior `Closed` event transaction. The `Closed` custom error must be library-namespaced because the event has the same name. Zero amounts/caps use `InvalidAmount`/`InvalidCap`. Validate money rather than silently rounding fractional base units. Tests and local builds need no private environment. No temporary chain adapter is permitted.

Also export `isCampaignClosed(campaignId): Promise<boolean>` for API reconciliation of direct sponsor closure. Authored contracts use SPDX UNLICENSED until the owner selects a license.

Live RPC consistency: retain the highest successful receipt block in the global queue state. Pin campaign/allowance/paid reads to the maximum of that floor and an uncached current head. A resource/block-not-found read retries at that fixed numeric block with at most six attempts and five one-second waits; unrelated failures and writes are not retried. This addresses the verified Base Sepolia public-RPC stale `latest` and temporarily unavailable head conditions without changing the interface.
