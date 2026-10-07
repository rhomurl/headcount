# Agent B: DB + API (lib/db.ts, lib/qr.ts, lib/payout.ts, app/api/**)

Paste this whole file to your coding agent. Read `CONTRACT.md` first.

## Goal
Implement `lib/db.ts`, `lib/qr.ts`, `lib/payout.ts`, and every route in the CONTRACT API table. Import chain functions from `@/lib/chain`. Do not create or replace `lib/chain.ts` with a stub. Tests may mock chain calls inside the test runner while Agent A implements the real adapter. Only touch `lib/db.ts`, `lib/qr.ts`, `lib/payout.ts`, `app/api/**`.

## lib/db.ts
- `new Database(process.env.DB_PATH ?? "./data/headcount.db")`. Create `data/` if missing.
- `db.pragma("journal_mode = WAL")`, then run the CONTRACT schema.
- Cache it on `globalThis` (Next dev hot reload).

## lib/qr.ts
Exactly as CONTRACT. Also export `newTicketSecret()` returning 32 random bytes as hex.

## Route notes
- Every route file: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`
- Validate by hand (no zod). Name and contact: trimmed, 1 to 80 chars. Wallets: `isValidAddress`; store them lowercased. perHead must be > 0 and ≤ 1000. Cap must be an integer from 1 to 1000.
- Pins: `String(crypto.randomInt(0, 1e6)).padStart(6, "0")`.
- **POST /campaigns**: insert the row first, then `await createCampaignOnchain(...)` (about 2-4s on Base Sepolia, which is fine) and store `create_tx`. If the chain call fails, delete the row and return 502 with the error. Return pins once.
- **POST /fund**: check the sponsor pin, then `fundCampaign(id, per_head * BigInt(cap))`.
- **GET /stats**: `verified` is the count of checkins. `paidUi` is `toUi(confirmedCount * per_head)`. `escrowUi` is `toUi(await getCampaignBalance(id))`. Wrap the chain read in try/catch and return `escrowUi: null` on failure; never 500 the dashboard. Feed: join tickets for the name, order by scanned_at desc, limit 20.
- **POST /rsvp**: if the contact exists for this campaign, return the existing ticketId. Otherwise insert with `newTicketSecret()`.
- **GET /tickets/[id]/qr**: `makeCode(id, secret)`. `expiresInMs = STEP_MS - (Date.now() % STEP_MS)`. Set `checkedIn` from the checkins table.
- **POST /checkin**: follow CONTRACT "Check-in rules" in order. Use `db.transaction(() => {...})()` for the cap check plus insert. Map `SQLITE_CONSTRAINT_UNIQUE` to 409 `already_checked_in`. After responding, call `runPayout(checkinId)` without awaiting it.
- **lib/payout.ts** `runPayout(checkinId)`: load the checkin, then `payCheckin(campaignId, ticketId)`. On success set confirmed plus tx. On error check `isPaid()`. If it's true, mark confirmed. Otherwise mark failed with `error`. Never throw.
- **POST /retry**: check the host pin. Only allow it when the status is failed. Set it to pending, then run `runPayout` without awaiting.
- **POST /close**: check the sponsor pin. If already closed, return the existing `close_tx`. If any checkins are pending, return 409 `payouts_pending`. Otherwise `closeCampaignOnchain(id)` and set closed plus close_tx.

## Test before handing off
Write `scripts/api-test.sh` (curl + jq against `localhost:3000`):
```
create → fund → rsvp → GET qr → checkin with that code → poll stats until confirmed
checkin same code again → 409 already_checked_in
new rsvp → GET qr → sleep 61 → checkin with that stale code → 400 expired
close → escrowUi 0, status closed
```
Commit.

## Integration clarification

Persist `closing` before awaiting close, block new scans/funding/RSVP/retries, and permit sponsor close retry after uncertain receipt failure. Use the shared campaign mutation guard and idempotent chain close helper. Rows without `create_tx` are not ready for RSVP/check-in/funding. See the implementation clarifications in `CONTRACT.md`.

Close also rejects failed/unreconciled check-ins (`payouts_unsettled`), not just pending. Stats supplies a separate cap-bounded `failedFeed`. Reconcile directly observed on-chain closure with `isCampaignClosed` before mutations; record the residual direct-close race described in CONTRACT.md.
