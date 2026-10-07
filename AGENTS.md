# Agent guidance

## Read before working

1. Read [README.md](README.md) and [docs/STATUS.md](docs/STATUS.md) for the current implementation state.
2. Read [CONTRACT.md](CONTRACT.md), the canonical shared specification, and [docs/PLAN.md](docs/PLAN.md).
3. Read the task pack for the area being changed: [chain](docs/01-chain.md), [API](docs/02-api.md), [UI](docs/03-ui.md), or [deployment](docs/04-deploy.md).

`CLAUDE.md` loads this file. Keep shared instructions here rather than copying them into multiple agent files. `docs/00-CONTRACT.md` points to the root specification.

## Scope and workflow

- Follow the user's current request. The build plan is context, not authorization to begin every task, send transactions, or deploy.
- Inspect the actual files and Git state before editing. Preserve unrelated work.
- Before substantive implementation, write or update a reviewable Markdown plan under `docs/`. Use the existing task packs when they already describe the requested work.
- Keep the agreed MVP scope and stack. Explain any necessary change to interfaces or invariants and update `CONTRACT.md` plus affected callers and task packs together.
- Document unresolved decisions and handoff limitations in `docs/STATUS.md`. Mark work complete only after recording verification evidence.
- Keep changes focused. Coordinate file ownership if parallel work is requested; dependency manifests, lockfiles, `lib/chain.ts`, and shared specs need a single owner during integration.
- Never overwrite a real chain implementation with a temporary stub. Label mock behavior clearly and remove it before claiming chain integration.
- Keep README commands accurate as tooling is added. Do not claim planned directories, commands, routes, or deployments already exist.

## Implementation boundaries

- Chain: `contracts/**`, `lib/chain.ts`, `lib/money.ts`, `scripts/smoke.ts`.
- API: `lib/db.ts`, `lib/qr.ts`, `lib/payout.ts`, `app/api/**`, `scripts/api-test.sh`.
- UI: page components, `app/layout.tsx`, `app/globals.css`, `components/**`, `lib/api.ts`.
- Integration owns shared package scripts, environment configuration, docs, and deployment wiring.

These boundaries coordinate work; they do not override a user-authorized change that spans layers. Foundry must be initialized inside `contracts/` without a nested Git repository.

## Invariants to preserve

- Base Sepolia and mock hUSDC are the agreed demo target. Never silently switch to mainnet or real funds.
- The escrow pays only the registered host and refunds only the sponsor. A ticket-derived key can be paid at most once; cap and closure rules must hold on-chain.
- Keep chain integration behind `lib/chain.ts`. All operator writes use one serial queue and check receipt success. The planned runtime is one Node process; separate processes sharing the operator wallet do not share that queue.
- Money uses `bigint` base units internally, with six decimals. Convert at API boundaries and validate input bounds.
- Check-ins verify the host PIN, rotating code, and campaign membership before the transactional capacity check and insertion.
- Never return private keys, ticket secrets, or unrelated PINs through APIs. Never log secrets or include them in fixtures, screenshots, or commits.
- Keep private environment variables server-only. Only the escrow address is intentionally public in the environment template.
- Treat attendee names and contacts as personal data. Do not commit databases, exports, or backups.

## Verification and handoff

Run checks appropriate to the change and record the exact commands and outcomes. At this baseline no application test/build commands exist.

- Docs/config: verify local links, placeholders, ignore rules, and `git diff --check`.
- Contracts: `forge test` in `contracts/` after the Foundry project exists.
- App: use the checked-in package scripts for tests, lint/type checks, and build once implemented.
- API: verify the flow and rejection cases in `docs/02-api.md` once its script exists.
- Chain smoke: `scripts/smoke.ts` sends testnet transactions. Run only within an authorized integration task with configured testnet credentials; passing unit tests does not prove deployment.
- Release/demo: verify the full flow over HTTPS with two real phones, successful receipts, and explorer evidence as described in `docs/04-deploy.md`.

Report local verification, committed state, publication, contract deployment, and app deployment separately. Never call a stub, skipped check, or local-only flow a verified live demo.
