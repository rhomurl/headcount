# Deploy: VPS (ARM64) + PM2 + Caddy

Do this by T+2:45. The contracts are already deployed from your laptop in task 01. The VPS only runs the Next app. The live URL plus a working camera over HTTPS is a hard requirement for both submission and demo.

## On the VPS
```bash
# Node 20+ and build tools for better-sqlite3 (arm64 usually has prebuilds; these are a fallback)
sudo apt-get install -y build-essential python3

git clone https://github.com/<you>/headcount.git ~/headcount && cd ~/headcount
cp /path/to/.env.local .env.local      # same OPERATOR_PRIVATE_KEY + TOKEN/ESCROW addresses as local; set APP_URL to the public URL
# NEXT_PUBLIC_ESCROW_ADDRESS is baked in at build time, so it must be in .env.local BEFORE npm run build
mkdir -p data
npm ci
npm run build                           # takes a few minutes on 2 vCPU; don't panic
pm2 start npm --name headcount -- start -- -p 3100
pm2 save
```
Port 3100 avoids clashing with n8n or anything already on 3000. Check with `ss -ltnp | grep 3100` first.

## Caddy (add a block; don't touch the existing ones)
```
headcount.rhomuel.com {
    reverse_proxy localhost:3100
}
```
No DNS yet? Use `headcount.<VPS-IP-with-dashes>.sslip.io` as the site address instead. For example, for 1.2.3.4 use `headcount.1-2-3-4.sslip.io`. Caddy still gets a real certificate.

`sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`

Validate before reloading. A broken Caddyfile takes down every site on the box, including n8n.

## Smoke test with two real phones
1. Phone A opens `/`, creates a campaign, and funds it.
2. Laptop opens the dashboard and checks that "In escrow" shows the funded amount.
3. Phone B scans the dashboard RSVP QR, RSVPs, and gets a ticket.
4. Phone A opens `/c/<id>/scan`, enters the PIN, and scans Phone B. The result should be green.
5. Dashboard: the count ticks up, then shows confirmed (about 2-4s on Base) with a working Basescan link showing the `CheckedIn` event.
6. Phone B takes a screenshot of the ticket and waits 61 seconds. Phone A scans the screenshot and should see red "Expired".
7. Rescan Phone B's live ticket. It should show amber "Already checked in".

## Before the demo
- Create the stage campaign fresh. Pre-RSVP 5 to 10 teammates and pre-check-in 3 so the feed isn't empty.
- Check the operator still has at least 0.02 Base Sepolia ETH: `cast balance <operator> --rpc-url $RPC_URL --ether`. Claim the faucet again early in the day so you have headroom.
- `pm2 logs headcount` open in a terminal behind the demo, in case something breaks.
- Record the 90-second backup video of exactly steps 3 to 7.

## Redeploy loop
`git pull && npm ci && npm run build && pm2 restart headcount`
