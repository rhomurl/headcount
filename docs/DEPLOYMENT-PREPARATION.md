# Deployment preparation

7 October 2026. Continue the locally verified MVP toward the deployment gates in [04-deploy.md](04-deploy.md).

## Scope and ownership

- Preserve the MVP, Base Sepolia, mock hUSDC, and one Node process.
- Coordinator owns environment preflight, shared scripts/docs, publication discovery, and integration.
- Deployment worker owns `deploy/ecosystem.config.cjs`, `deploy/Caddyfile.example`, and isolated Nginx configuration examples only. No remote writes, transactions, infrastructure changes or child agents.
- Selected target: `rhm-server-eu` (91.99.141.229), hostname `https://headcount.zymo.qzz.io`. Fresh dedicated local operator selected by default after no existing environment was supplied. Public DNS currently returns NXDOMAIN.
- GitHub publication, contract transactions and VPS changes require a concrete target; inspect read-only state before any mutation. Never create a public repository from an assumed owner/name.

## Tasks

- [x] Inspect Git remotes and authenticated GitHub identity without exposing credentials.
- [x] Identify selected SSH alias/domain and inspect VPS prerequisites read-only.
- [x] Create a dedicated unused local testnet operator by default after the optional existing-environment question remained unanswered. Verify private file permissions/ignore rules and inspect chain ID/funding read-only.
- [x] Write failing environment-preflight tests for missing settings, key/address format, public/server escrow mismatch, RPC protocols and HTTPS app URL.
- [x] Implement preflight with fixed error messages; never print keys or the RPC URL path/query. Verify existing application checks remain valid.
- [x] Prepare PM2 configuration with exactly one fork-mode process, persistent database location and localhost port 3100. Prepare isolated Nginx examples and alternative-host Caddy example without modifying a shared server config.
- [x] Update deployment/chain task packs to use checked-in tool wrappers and preflight commands; distinguish preparation from deployment.
- [x] Run tests, lint, typecheck, configuration/link checks and inspect staged contents before a local commit.
- [x] Stage committed source `6ff5d64` and dependencies in the new `/root/headcount` directory. VPS tests, types and lint pass; app not built or started.
- [ ] After wallet/funding and DNS gates pass, perform the authorized testnet and HTTPS integration and record receipts. Public repository publication and phone verification remain separate.

## Gates

Contract deployment needs a funded dedicated operator and successful Base Sepolia receipts. App deployment needs the chosen VPS/domain and verified HTTPS routing. A live demo still needs two real phones and explorer evidence; local preparation cannot satisfy these gates.

## Discovery

- Authenticated GitHub account: `rhomurl`; no Git remote and no `rhomurl/headcount` repository exists. No publication performed.
- VPS: ARM64, Node 24.18.0 and PM2 installed, port 3100 free, no existing `/root/headcount` directory.
- Existing Nginx serves ports 80/443 and n8n. Use a separate Headcount Nginx site. Caddy remains an alternative-host example and will not be installed on this server.
- Public DNS queried through the local resolver and Cloudflare DoH: NXDOMAIN for `headcount.zymo.qzz.io`.
- Dedicated local operator `0x7E61f0f43e264151353779213be73421Df0E99c8`: public RPC reports chain ID 84532 and zero testnet ETH. Funding is required. Key exists only in ignored mode-600 `.env.local`; no existing environment was provided and this unused wallet can be replaced before deployment.

## Verification

- Node 24: 57 app/preflight tests passed; lint and typecheck exit 0. Missing environment produces expected preflight exit 1 with field names only.
- PM2 config: one fork and absolute loopback/runtime paths verified; Node 23 rejected as expected.
- Both Nginx examples passed isolated `nginx -t` on the selected VPS. The HTTPS syntax check used a disposable self-signed certificate; all temporary files were removed. No sites enabled or services reloaded. Existing full Nginx config passed with unrelated existing protocol-option warnings.
- Deployment reviewer checked preflight and PM2. Queued-response timeout risk addressed with explicit 300-second proxy timeouts; indefinite backlog and an unreceived create result remain documented limitations.
- Local Markdown links and `git diff --check` passed. No private environment, operator key or attendee database was added to Git or the server.
- VPS source archive SHA-256 verified before extraction; 57 tests, typecheck/lint and PM2 structure check passed on Node 24.18.0. Existing PM2 apps remain online, port 3100 free, no production build/environment/server process activated.
