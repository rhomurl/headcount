# CONTRACT.md: shared source of truth for all agents

Read this before writing code. Do NOT change names, routes, or shapes here without updating this file and telling the human.

## Product
Headcount: a sponsor funds a campaign inside the `HeadcountEscrow` contract on **Base Sepolia** (chain id 84532), using a mock 6-decimal USDC ("hUSDC"). Guests RSVP for free and get a rotating QR. The host scans at the door. Each valid check-in makes the platform **operator** call `checkIn()`, and the contract pays `perHead` to the campaign's registered host. The sponsor (or the operator on the sponsor's behalf) closes the campaign, and the contract refunds the remainder **to the sponsor address only**.

Trust model: the operator can trigger payouts, but the contract only lets money go to (a) the host registered at creation or (b) the sponsor. The operator can never redirect funds. Each ticket can be paid once at most, enforced on-chain.

## Stack (fixed)
- Next.js App Router, TypeScript, Tailwind, `next start` on a Node server (NOT serverless)
- `better-sqlite3` (sync API), DB file at `process.env.DB_PATH` (default `./data/headcount.db`)
- **`viem` v2** (`baseSepolia` from `viem/chains`). No ethers, no wagmi.
- Contracts: **Foundry**, OpenZeppelin (`SafeERC20`, `ERC20`, `Ownable`)
- `nanoid` for ids, `qrcode.react` for QR, `html5-qrcode` for scanning, Node `crypto` for HMAC

## Env (.env.local)
```
RPC_URL=https://base-sepolia.g.alchemy.com/v2/<key>   # fallback: https://sepolia.base.org
OPERATOR_PRIVATE_KEY=0x...
TOKEN_ADDRESS=0x...
ESCROW_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_ADDRESS=0x...   # same value, used for the explorer link in the UI
APP_URL=https://headcount.example.com
DB_PATH=./data/headcount.db
```

## File layout
```
contracts/                       # Foundry project (forge init --no-git)
  src/MockUSDC.sol
  src/HeadcountEscrow.sol
  test/HeadcountEscrow.t.sol
  script/Deploy.s.sol
lib/db.ts          # opens DB, runs schema, exports `db`
lib/chain.ts       # ONLY file importing viem; exports below
lib/qr.ts          # makeCode / verifyCode
lib/money.ts       # toBase / toUi, 6 decimals, bigint
lib/payout.ts      # runPayout(checkinId)
app/api/...        # routes below
app/page.tsx  app/c/[id]/page.tsx  app/c/[id]/scan/page.tsx  app/c/[id]/dashboard/page.tsx  app/t/[ticketId]/page.tsx
scripts/smoke.ts   # end-to-end chain test (npx tsx)
```

## Solidity: HeadcountEscrow (exact interface)
```solidity
constructor(IERC20 token, address operator)
struct Campaign { address sponsor; address host; uint128 perHead; uint128 balance; uint32 cap; uint32 verified; bool exists; bool closed; }
mapping(bytes32 => Campaign) public campaigns;
mapping(bytes32 => bool) public paid;          // checkinKey => paid

function createCampaign(bytes32 id, address sponsor, address host, uint128 perHead, uint32 cap) external;  // anyone; reverts if exists
function fund(bytes32 id, uint128 amount) external;     // anyone; SafeERC20 transferFrom msg.sender; reverts if closed
function checkIn(bytes32 id, bytes32 checkinKey) external;  // onlyOperator; reverts: Closed, AlreadyPaid, CapReached, Insufficient
function close(bytes32 id) external;                    // sponsor OR operator; refunds balance to sponsor; sets closed

event CampaignCreated(bytes32 indexed id, address sponsor, address host, uint128 perHead, uint32 cap);
event Funded(bytes32 indexed id, address from, uint128 amount);
event CheckedIn(bytes32 indexed id, bytes32 indexed checkinKey, address indexed host, uint128 amount);
event Closed(bytes32 indexed id, uint128 refunded);
```
Use custom errors. Effects before interactions.

## ID mapping (on-chain keys)
- `campaignKey = keccak256(toHex(campaignId))`
- `checkinKey  = keccak256(toHex(campaignId + ":" + ticketId))`. Derived from the TICKET, so the same guest can never be paid twice, even if the DB is wrong.

## lib/chain.ts (exact exports)
```ts
export function isValidAddress(s: string): boolean;                  // viem isAddress
export async function createCampaignOnchain(campaignId: string, sponsor: `0x${string}`, host: `0x${string}`, perHead: bigint, cap: number): Promise<`0x${string}`>;
export async function fundCampaign(campaignId: string, amount: bigint): Promise<`0x${string}`>;  // operator mints MockUSDC to self, then fund()
export async function getCampaignBalance(campaignId: string): Promise<bigint>;
export async function isPaid(campaignId: string, ticketId: string): Promise<boolean>;
export async function payCheckin(campaignId: string, ticketId: string): Promise<`0x${string}`>;
export async function closeCampaignOnchain(campaignId: string): Promise<`0x${string}`>;
export function explorerTx(hash: string): string;    // https://sepolia.basescan.org/tx/<hash>
export function explorerAddr(a: string): string;     // https://sepolia.basescan.org/address/<a>
```
**All write functions go through one in-process serial queue** (one operator EOA means nonces must not collide). Each write waits for `waitForTransactionReceipt` and throws if `status !== "success"`.

## Schema (lib/db.ts runs this on startup)
```sql
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sponsor_wallet TEXT NOT NULL,
  host_wallet TEXT NOT NULL,
  per_head INTEGER NOT NULL,        -- base units (6 decimals)
  cap INTEGER NOT NULL,
  host_pin TEXT NOT NULL,
  sponsor_pin TEXT NOT NULL,
  create_tx TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open | closed
  close_tx TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  secret TEXT NOT NULL,             -- hex, never returned by any API
  created_at INTEGER NOT NULL,
  UNIQUE(campaign_id, contact)
);
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id),
  scanned_at INTEGER NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | failed
  payout_tx TEXT,
  error TEXT
);
```

## lib/qr.ts (rotating code)
- `STEP_MS = 30_000`, `step = Math.floor(Date.now() / STEP_MS)`
- `makeCode(ticketId, secret, step?)` returns `HC1.<ticketId>.<step>.<mac>`, where `mac = HMAC_SHA256(secret, ticketId + "." + step)` hex, first 16 chars
- `verifyCode(code, lookupSecret)` returns `{ ok: true, ticketId } | { ok: false, reason: "malformed" | "unknown" | "expired" | "bad_mac" }`. Accept step == current or current-1 only. Use `crypto.timingSafeEqual`.

## API (all JSON; errors are `{ error: string }` with a proper status)
| Method / route | Body | Returns |
|---|---|---|
| POST `/api/campaigns` | `{ name, sponsorWallet, hostWallet, perHead: number (UI units), cap: number }` | `{ id, hostPin, sponsorPin, createTx }` (pins are 6 digits, shown once) |
| POST `/api/campaigns/[id]/fund` | `{ sponsorPin }` | `{ tx, amount }` funds `perHead*cap` (demo funding by operator) |
| GET `/api/campaigns/[id]` | none | `{ id, name, perHead, cap, status, hostWallet, sponsorWallet, createTx }` (UI units) |
| GET `/api/campaigns/[id]/stats` | none | `{ verified, cap, paidUi, escrowUi, pendingCount, failedCount, status, closeTx, feed: [{ checkinId, name, scannedAt, payoutStatus, payoutTx }] }` latest 20 first |
| POST `/api/campaigns/[id]/rsvp` | `{ name, contact }` | `{ ticketId }`. Duplicate contact returns the existing ticketId (200). 409 if closed. |
| GET `/api/tickets/[ticketId]/qr` | none | `{ code, expiresInMs, checkedIn, campaignName, guestName }` |
| POST `/api/campaigns/[id]/checkin` | `{ code, hostPin }` | 200 `{ guestName, checkinId }`; 401 bad pin; 400 `{error: reason}`; 403 wrong campaign; 409 `already_checked_in` / `cap_reached` / `closed` |
| POST `/api/checkins/[checkinId]/retry` | `{ hostPin }` | `{ ok: true }` |
| POST `/api/campaigns/[id]/close` | `{ sponsorPin }` | `{ tx }` |

## Check-in rules (order matters)
1. Verify the host pin, then `verifyCode`, then that the ticket belongs to this campaign.
2. In ONE better-sqlite3 transaction: confirm status open, confirm count(checkins) < cap, then insert the checkin (a UNIQUE violation means `already_checked_in`).
3. Respond 200 immediately, then call `runPayout(checkinId)` without awaiting. `runPayout` calls `payCheckin`. On success it sets confirmed plus tx. On error it first checks `isPaid()`. If that's true, mark confirmed (the earlier tx landed). Otherwise mark failed plus error.

## Non-negotiables
- Never return `OPERATOR_PRIVATE_KEY` or ticket `secret` from any route.
- Money is `bigint` in base units internally. Convert at the API edge only.
- Mobile-first UI.
