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
| Deployment preparation | Prerequisites verified; activation in progress | Funded operator, DNS A record, successful chain smoke and issued Let's Encrypt certificate |
| GitHub publication | Not performed | No push, public repository or remote verified during implementation |
| Contract deployment | Deployed and receipt-verified on Base Sepolia | Token/escrow plus mint/approval receipts; owner/operator and decimals checked; live smoke passed |
| VPS deployment | Source staged; app not activated | Source `6ff5d64` in `/root/headcount`; configured build, HTTPS and two-phone flow remain required |
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

Finish the corrected VPS build, start one loopback PM2 process, activate its isolated HTTPS proxy, and verify the live API/receipt flow. Real-phone camera verification, publication and submission artifacts remain separate gates. The old local preview has chain credentials disabled.

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
- Staged source commit `6ff5d64` in the newly created `/root/headcount`, verifying archive SHA-256 before extraction. `npm ci` completed on ARM64 Node 24.18.0. All 57 tests, typecheck and lint passed on the VPS, including actual SQLite tests. PM2 configuration passed its structure check. No `.env.local` or `.next` installed there, port 3100 remains free, and all five existing PM2 apps remain online. No app started or Nginx reloaded.
- No existing operator environment was provided, so preparation defaulted to a fresh dedicated testnet wallet after the preference question remained unanswered. Created local ignored `.env.local` with mode 600; no key printed or transferred. Public operator: `0x7E61f0f43e264151353779213be73421Df0E99c8`. Read-only RPC check verified chain ID 84532 and **0 testnet ETH**. No transaction sent. This unused wallet can be replaced if the user supplies an existing environment before deployment.
- Local `npm run preflight` now reports only the three missing contract-address fields (expected exit 1). Operator funding, DNS and deployed contracts remain required before activation.

## Live chain / activation evidence

- User completed DNS/funding, then explicitly authorized private operator environment transfer to `rhm-server-eu` after automatic approval review rejected the initial transfer. The rejected attempt transferred nothing; the subsequently authorized SSH transfer succeeded. Private environment remains mode 600 and ignored.
- DNS A resolves to `91.99.141.229`, no AAAA. RPC chain ID 84532 and operator funding 0.0005 testnet ETH verified before deployment. Simulation estimated 0.0000224323 ETH.
- `Deploy.s.sol --broadcast` succeeded. Verified all four receipts independently, bytecode presence, token owner/operator equal the dedicated address, six decimals, initial 1,000,000 hUSDC mint and max allowance to escrow.
- Mock hUSDC: [0xa5c8abb9c233016f0ee2010c17bb287bfa7d5257](https://sepolia.basescan.org/address/0xa5c8abb9c233016f0ee2010c17bb287bfa7d5257), deployment [receipt](https://sepolia.basescan.org/tx/0x74f3e2583fdad41422cd96c688f10f6f67661f12c026595ae3e8ea7259b6e3a0).
- Escrow: [0xb2027a52ca63875a81adde0676231028bf993336](https://sepolia.basescan.org/address/0xb2027a52ca63875a81adde0676231028bf993336), deployment [receipt](https://sepolia.basescan.org/tx/0xbe0a03fbf8d4b733cf57679e89ae3504df832f366477be69a2b5b6319b58b43b). Explorer source verification was not performed.
- Initial smoke failed `NoCampaign` after successful create. Diagnostic proved stale `latest` reads and a separate -32001 block-unavailable condition. Adapter now uses a global receipt floor plus uncached numeric head, with six fixed-height read attempts and five one-second waits for block/resource-not-found errors only. Writes are never retried. Independent review passed; 21 chain tests include regressions. Full suite: **62 passed**, lint/typecheck exit 0.
- Corrected `npm run smoke -- --send-testnet-transactions`: exit 0. Funded 50 hUSDC, paid host 5, duplicate rejected, remaining 45 refunded and escrow campaign balance zero. [Payout receipt](https://sepolia.basescan.org/tx/0x1fd26cacfb3773d86f146b99619b2633174ecfd1375da695b38a9a45c07ee21c), [close/refund receipt](https://sepolia.basescan.org/tx/0x1842ff7b355cafe65d274a506ee2100f47e9c7bb44d1c12016f70fcd97c5e7f8).
- Isolated HTTP bootstrap enabled and validated; ACME challenge probe passed. Certificate issued by Let's Encrypt using the existing account, SAN/hostname/expiry checks passed. Expires 5 January 2027 at 15:51:13 Asia/Manila. Public HTTP intentionally returns 503 until app activation; HTTPS proxy not yet enabled.
- Initial VPS production build with real public escrow succeeded. Corrected adapter rebuild/activation is in progress. No app wallet writer runs while the chain smoke/reconciliation script uses the operator.
