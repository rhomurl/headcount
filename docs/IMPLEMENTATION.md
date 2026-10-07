# Headcount MVP Implementation Plan

> Execute with parallel subagents for the three existing task packs; integration has one owner.

**Goal:** Build and verify the specified local testnet MVP: create and fund a campaign, RSVP, display a rotating ticket, check in, observe payout, and close/refund.

**Architecture:** Next.js App Router on one Node process, SQLite, a server-only viem chain boundary, and Foundry escrow contracts. The existing [shared specification](../CONTRACT.md) and [build plan](PLAN.md) are the approved design. No chain stub will be placed in application source.

**Stack:** Node 24 LTS, npm with a committed lockfile, Next.js, TypeScript, Tailwind, better-sqlite3, viem v2, Solidity and OpenZeppelin.

## Constraints and ownership

- Base Sepolia (84532), six-decimal mock hUSDC, bigint money, ticket-derived payout keys, one serial operator queue and successful receipts.
- User requested starting implementation with multiple subagents. Existing task packs supply the design; proceed within their scope.
- Chain agent owns `contracts/**`, `lib/chain.ts`, `lib/money.ts`, chain tests, `scripts/smoke.ts`.
- API agent owns `lib/db.ts`, `lib/qr.ts`, `lib/payout.ts`, API helpers, `app/api/**`, API tests, `scripts/api-test.sh`.
- UI agent owns page components, `app/layout.tsx`, `app/globals.css`, `components/**`, `lib/api.ts`, UI tests.
- Coordinator owns manifests, lockfiles, app/compiler/test configuration, shared specs, documentation and integration. Agents do not commit or edit shared files independently.
- Tests may mock chain transports only inside tests. Production always calls the real chain layer. Secrets, PINs, attendee records and runtime databases stay out of Git and screenshots.
- No external publication, funded testnet transaction, or VPS deployment is part of this implementation run.

## Review focus

1. Close racing with a new check-in must never leave an accepted ticket unpaid because closure won the race.
2. Duplicate scans and concurrent retry calls must consume at most one capacity slot and one on-chain payout.
3. Malformed/expired QR and wrong-campaign tickets must fail before the transactional capacity insertion; the host PIN is checked first.
4. Invalid decimal money, unsafe integer conversion, and unfunded payouts must produce bounded errors without leaking configuration or secrets.
5. Polling and camera cleanup must survive navigation, delayed responses, denied camera permission and PIN failures; closed campaigns disable sponsor actions.

## Tasks

### Task 1: Scaffold and tooling (coordinator)

- [x] Verify clean Git baseline and existing managed worktree; reuse it.
- [x] Create pinned npm manifest, Node version file, strict TypeScript alias `@/*`, Next/Tailwind/PostCSS configuration and Vitest configuration.
- [x] Install dependencies; use Node 24 consistently for native SQLite compilation and execution.
- [x] Provide `dev`, `start`, `build`, `typecheck`, `lint`, and `test` scripts. Next routes use asynchronous params.

### Task 2: Contracts and chain ([01-chain.md](01-chain.md))

- [x] Write and run failing escrow tests for registered host payouts, duplicate keys, operator authorization, cap, closure, sponsor refunds, nonexistent campaigns and zero addresses.
- [x] Implement mock token, escrow, deployment script and pinned Foundry dependencies without nested Git.
- [x] Implement exact `lib/chain.ts` exports with lazy server configuration, a global serial queue, chain ID validation and receipt checks. Funding mint+fund remains one queued job.
- [x] Test six-decimal money bounds, queue failure recovery and receipt failure handling; create smoke script but do not run against testnet.
- [x] Run `forge test` if tooling is available; report any unavailable compiler/tool separately.

### Task 3: Database and API ([02-api.md](02-api.md))

- [x] Write failing tests using temporary SQLite databases and test-only chain mocks for QR windows, PIN-first checks, membership, contact deduplication, cap, payout reconciliation, retry and close races.
- [x] Implement schema, secure secret generation, timing-safe HMAC verification, exact JSON routes, input bounds and sanitized failures.
- [x] Keep capacity check and insert transactional. Serialize close/check-in state changes so a pending payout prevents closing; release guards on failure.
- [x] Deduplicate in-flight payouts; reconcile uncertain receipts using `isPaid`. Retry only failed check-ins.
- [x] Create API flow script with explicit target URL and testnet transaction warning; include rejection cases from the task pack.
- [x] Run API/QR tests and report all failed or unverified cases.

### Task 4: Mobile UI ([03-ui.md](03-ui.md))

- [x] Build create/PIN handoff, RSVP, live ticket, scanner and dashboard pages against the real API contract via typed fetch helpers.
- [x] Use the specified dark/green visual language, responsive Tailwind layout, visible loading/error states and accessible forms.
- [x] Keep PINs only in state; stop ticket polling after check-in; avoid overlapping dashboard polls and stale updates after unmount.
- [x] Dynamically load the scanner, serialize submissions, ignore repeated codes, clean up camera on navigation and show HTTPS/camera failures.
- [x] Show public explorer evidence and sponsor actions, confirmed/failed/pending states, retry and close links; clearly label test hUSDC.
- [x] Verify render/navigation at desktop and phone widths. Camera operation on two real phones remains a separate live gate.

### Task 5: Integration, independent review and handoff (coordinator)

- [x] Review each agent's changes against `CONTRACT.md`; update callers/task packs together for necessary clarifications.
- [x] Run full tests, lint, typecheck, build, contract tests and `git diff --check`.
- [x] Obtain independent code review of integrated changes and fix material findings with regression coverage.
- [x] Exercise local browser forms and route errors. Use Anvil for real local-chain integration if available; never claim this proves Base Sepolia deployment.
- [x] Update README commands, CHANGELOG and STATUS with exact evidence and remaining setup gates.
- [x] Report source changes, local verification, committed state, publication, contract deployment and app deployment separately.

## Execution record

- Baseline: clean managed linked worktree, detached HEAD, documentation only. No application tests existed.
- Runtime decision: bundled Node 24.19.0 will be used; the Homebrew Node 22 alias resolves to Node 23.
- Parallelism decision: the user's requested parallel execution takes priority over sequential skill defaults; exclusive file ownership prevents conflicting writes.
- Deployment prerequisites remain unresolved: operator credentials/funding, contract addresses, RPC provisioning, DNS and VPS access.

## Review resolutions

Independent review identified and re-reviewed three fixes: every unresolved accepted payout fences close, older failures remain in a separate recovery feed, and observed sponsor closure synchronizes the database. Direct sponsor closure racing acceptance remains a contract trust limitation. Local phone camera/HTTPS and all external deployment gates remain unverified.
