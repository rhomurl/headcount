# Deploy: rhm-server-eu + PM2 + existing Nginx

Selected origin: `https://headcount.zymo.qzz.io`. Selected SSH alias: `rhm-server-eu`, public IPv4 `91.99.141.229`. This ARM64 VPS already runs Node 24, PM2 and Nginx for other sites. Preserve those sites and services. The original Caddy plan is replaced by an isolated Nginx site on this host; [the Caddy example](../deploy/Caddyfile.example) is for an alternative host only.

The deployed application must use Base Sepolia (84532), mock hUSDC and exactly one Node process. These instructions are a deployment procedure; current evidence is in [STATUS.md](STATUS.md).

## Prerequisites

1. Point the DNS A record `headcount.zymo.qzz.io` to `91.99.141.229`. Do not add an AAAA record unless the selected server's IPv6 routing is verified. DNS was NXDOMAIN during preparation.
2. Select a dedicated operator wallet, fund it with Base Sepolia ETH, deploy the mock token/escrow, and record successful receipts. Never pass a private key in CLI arguments or paste it in chat. The existing deployment script reads `OPERATOR_PRIVATE_KEY` from the environment; run the pinned `contracts/tools/forge.cjs` wrapper from `contracts/` with the environment securely loaded.
3. Prepare a private `.env.local` (mode 600) containing the RPC, operator, token and escrow values from that deployment. Set `APP_URL=https://headcount.zymo.qzz.io` and `DB_PATH=./data/headcount.db`. `NEXT_PUBLIC_ESCROW_ADDRESS` must equal `ESCROW_ADDRESS` and must be set before the production build. Do not build with a placeholder escrow address and call it configured.
4. Deliver the verified source to `/root/headcount` using a private source archive or an explicitly published repository. Never include local databases, populated environment files, node_modules or build output in a source archive. A public GitHub repository is still a separate publication step.

## Build and process

Run on the VPS in `/root/headcount` after securely transferring the environment:

```bash
node --version                         # must be 24.x
npm ci
npm run preflight                      # shape validation; no transactions
npm test
npm run typecheck
npm run lint
npm run build                          # embeds the public escrow address
mkdir -p data
pm2 start deploy/ecosystem.config.cjs --only headcount
pm2 save
curl --fail http://127.0.0.1:3100/
```

Inspect port 3100 before starting. The checked-in PM2 file binds Next to `127.0.0.1:3100`, pins Node 24, and runs one fork. Next loads `.env.local` from its working directory. Keep the database and its sidecars across builds and restarts. Do not run another app instance or wallet-writing script while the server uses the same operator: separate processes do not share the transaction queue.

`npm run preflight` checks configuration formats without printing credentials. It does not prove the RPC chain, contract code, operator funding, receipts or HTTPS routing. `--local` allows HTTP only on loopback for local tests.

## Isolated Nginx site and certificate

Nginx and Certbot are already installed. Use the new site name `headcount`; check that its files do not already exist before creating them. Enable only one of the two Headcount examples at a time.

After DNS resolves to this server, copy [the HTTP bootstrap](../deploy/nginx-http.conf.example) to `/etc/nginx/sites-available/headcount`, create `/var/www/headcount-acme`, and symlink that site into `sites-enabled`. All non-challenge requests return 503 until setup is complete. Validate the full configuration before reloading:

```bash
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/headcount-acme -d headcount.zymo.qzz.io
```

Complete Certbot's account/email/terms prompts using the owner's choices if no existing account is usable. Do not disable or rewrite other sites. Confirm the issued certificate's SAN covers the hostname. Replace this one bootstrap file with [the HTTPS configuration](../deploy/nginx.conf.example) only after app preflight/build and loopback health checks pass:

```bash
nginx -t
systemctl reload nginx
curl --fail https://headcount.zymo.qzz.io/
certbot renew --dry-run --cert-name headcount.zymo.qzz.io
```

The examples keep the HTTP webroot challenge route for renewal and forward the original host/protocol to the loopback app. A temporary test certificate can validate syntax, but is not evidence of publicly trusted HTTPS. The proxy explicitly allows five minutes for queued receipt-backed responses. A longer queue can still time out; a timeout is an uncertain result, so inspect campaign/receipt state before repeating a mutation. An unreceived create response currently has no client recovery identifier and may require operator reconciliation.

## Chain and API verification

With the app stopped, run the configured operator smoke test from a single process:

```bash
npm run smoke -- --send-testnet-transactions
```

Record successful Base Sepolia receipts, then start the app. `scripts/api-test.sh` creates/funds/pays a test campaign through the selected API; read its opt-in warning first. Do not run a separate wallet writer alongside PM2. Both checks send testnet transactions and require an authorized integration task.

## Smoke test with two real phones

1. Phone A opens the HTTPS origin, creates a campaign, and funds it.
2. Laptop opens the dashboard and checks the funded escrow amount.
3. Phone B scans the dashboard RSVP QR, RSVPs, and gets a ticket.
4. Phone A opens `/c/<id>/scan`, enters the PIN, and scans Phone B. Check the successful result and confirmed dashboard payout with a working Basescan link and `CheckedIn` event.
5. Wait 61 seconds before scanning a saved ticket screenshot; verify expiration.
6. Rescan the live ticket; verify the duplicate rejection.
7. Close the campaign and verify the sponsor refund receipt. Record explorer evidence without exposing ticket secrets, PINs or attendee contacts.

Camera permission and this two-phone flow are release/demo gates. Desktop rendering, unit tests and local Anvil receipts do not satisfy them.

## Redeploy

Stage source and dependencies first. Stop Headcount before replacing its production build, retain `.env.local` and `data/`, run preflight/build, then use `pm2 restart headcount` and verify loopback plus HTTPS health. Never use PM2 cluster/scale or zero-downtime reload: the old writer must exit before the new writer starts. Check the other PM2 apps and Nginx sites remain healthy after changes.

Report source commit, publication, contract deployment, app deployment and phone verification separately.
