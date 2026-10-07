# Implementation status

Last updated: 7 October 2026 (Asia/Manila).

## Current state

| Area | Status | Evidence / completion gate |
| --- | --- | --- |
| Local Git/documentation baseline | Complete | Existing managed worktree, branch `codex/headcount-mvp` |
| Next.js scaffold/dependencies | Implemented and locally verified | Node 24, npm lockfile; tests, lint, types and default production build pass |
| Contracts/chain adapter | Implemented and locally verified | Solidity 0.8.24; 15 Foundry tests; real adapter in loopback Anvil flow |
| Database/API | Implemented and locally verified | 16 API/QR tests; real SQLite + real-chain API flow |
| UI | Implemented; automated local checks verified | 10 UI tests; desktop/mobile render and scanner PIN gate; screenshots in `screenshots/` |
| Integration | Locally verified | 57 app/preflight tests plus prior loopback real receipts, host payout and sponsor refund |
| Deployment preparation | Configurations verified; prerequisites pending | `rhm-server-eu` (91.99.141.229), isolated Nginx templates and Node 24 PM2 config; wallet choice and DNS pending |
| GitHub publication | Not performed | No push, public repository or remote verified during implementation |
| Contract deployment | Not performed on Base Sepolia | Ephemeral Anvil deployment is local test evidence only |
| VPS deployment | Not performed | HTTPS camera flow with two real phones remains required |
| Submission assets | Not completed | Live URL, public repository, deck and backup video remain separate |

## Decisions and review resolutions

- Reused the managed worktree and created `codex/headcount-mvp`. Chain, API and UI subagents had exclusive file ownership; coordinator integrated tooling/docs.
- Runtime: Node 24 LTS, verified with bundled Node 24.19.0. Homebrew's Node 22 alias unexpectedly points to Node 23; use `.nvmrc` rather than that alias.
- Production always uses the real server-only chain adapter. No application mock chain, fake receipts or temporary production adapter exists. Tests mock transports where appropriate.
- Every unresolved accepted payout fences closure. Interrupted pending jobs become retryable failed jobs on database reopen; close rejects them until confirmed.
- Separate `failedFeed` keeps every failed payout discoverable within the campaign maximum of 1,000, independently of the recent-20 activity feed.
- Observed direct sponsor closure synchronizes durable status and receipt evidence. A direct sponsor close racing after an open-state read may still cause a failed payout; contract authorization cannot prohibit that race.
- `closing` persists before awaiting close. Uncertain close is retryable; recent receipt recovery covers at most 20,000 blocks. Older missing receipts require manual operator reconciliation.
- One Node process is required for the campaign guards and operator queue. No cluster/multi-instance configuration was verified.
- Foundry uses a pinned npm compiler bridge. Its native-binary wrapper propagates failures; upstream npm launcher 1.7.1 incorrectly returned success for a failing suite.
- Database paths are runtime storage and excluded from build tracing. No attendee database, wallet key, PIN screenshot or populated environment file is committed.
- Authored Solidity is UNLICENSED until the owner selects a license. Private vulnerability reporting and attendee retention policies remain undecided.

## Verification evidence

All commands used Node 24.19.0 (bundled runtime added to PATH):

- `npm test`: 8 files, **51 passed**, zero failures. Includes API/QR 16, chain/money 25, UI 10.
- `npm run test:contracts`: **15 passed**, zero failed/skipped, Solidity 0.8.24. Foundry emitted harmless global signature-cache warnings in the restricted filesystem; compilation/tests completed.
- `npm run typecheck`: exit 0. Production build also completed its TypeScript check.
- `npm run lint`: exit 0, zero warnings after configuration cleanup.
- `npm run build`: default Turbopack exit 0 with local compiler-worker port access. Initial sandbox-only run failed because internal port binding was denied; `npm run build -- --webpack` also passed. Final Turbopack build is warning-free.
- `npm run test:local`: exit 0. Ephemeral chain ID 84532 on loopback Anvil, generated temporary wallet, production Next server and temporary SQLite database. Actual local transactions verified create/fund/RSVP/QR/check-in, successful host payout, PIN/malformed/duplicate/expired rejection, close and sponsor refund. Escrow token balance finished at zero; services and test DB cleaned up.
- Browser verification: bundled Playwright with installed Chrome via `/private/tmp/headcount-browser.mjs`, exit 0. Desktop 1400×1000 and mobile 390×844 create page, scanner PIN gate, no horizontal overflow and no page exceptions. Saved [desktop](screenshots/create-desktop.png) and [mobile](screenshots/create-mobile.png) screenshots contain no PINs. Camera permission and two-phone HTTPS scanning were not exercised.
- Independent scoped re-review: all three material findings addressed; reviewer separately ran 30 API/chain tests successfully. Full flow above uses real local contracts rather than transport mocks.
- `bash -n scripts/api-test.sh`, Solidity formatting and `git diff --check`: passed.
- `npm audit --omit=dev`: zero known runtime advisories. Full audit reports seven development-tool dependency entries (six high, one low), involving the pinned Solidity toolchain and ESLint glob dependencies. These remain recorded; no force downgrade/upgrade was applied.

## Remaining gates

Configure dedicated testnet operator credentials/funding, RPC provisioning and deployed mock-token/escrow addresses. Then authorize/run the explicit-opt-in Base Sepolia smoke test and record explorer receipts. Publication, DNS, VPS/HTTPS deployment, real-phone camera verification and submission artifacts require separate work. The local preview has chain credentials disabled and cannot create funded campaigns.

No Base Sepolia transactions, external deployment or publication occurred in this implementation run.

## Deployment preparation evidence

- Selected target: `rhm-server-eu`, public origin `https://headcount.zymo.qzz.io`. Read-only SSH verified ARM64, Node 24.18.0, PM2, existing Nginx/Certbot and free port 3100. `/root/headcount` did not exist at discovery. Other running apps were preserved.
- Existing ingress is Nginx, so deployment uses a separate vhost rather than adding Caddy on occupied ports 80/443. The shared specification and task packs reflect this infrastructure change.
- `npm test`: 9 files, **57 passed**, including six environment-preflight tests. `npm run typecheck` and `npm run lint`: exit 0. `npm run preflight` with no private environment: expected exit 1, fixed missing-field errors without credential values.
- PM2 configuration checked under Node 24: one fork, absolute interpreter/script paths, loopback port 3100. Node 23 rejects the configuration as intended. No process started.
- Both Nginx examples passed `nginx -t` in an isolated temporary VPS configuration. HTTPS syntax validation used a temporary self-signed certificate only. Files and key were removed; no sites enabled and no reload performed. Existing full VPS configuration also passed, with pre-existing protocol-option warnings for unrelated RSS/travel sites.
- Deployment review identified response timeout risk for queued transactions; the example now sets 300-second read/send timeouts. An arbitrarily long queue can still time out after a mutation succeeds. Unreceived create responses have no client recovery identifier and require operator reconciliation; this remains a limitation.
- DNS returned NXDOMAIN through the local resolver and Cloudflare DoH. Required A record: `headcount.zymo.qzz.io` → `91.99.141.229`. No certificate issued for this hostname.
- GitHub identity `rhomurl` verified; `rhomurl/headcount` did not exist and no remote was configured. No public repository created.
- Dedicated-wallet versus existing-environment choice remains unanswered. No operator key generated, private environment copied, testnet transaction sent or public app activated during preparation.
