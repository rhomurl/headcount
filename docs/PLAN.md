# Headcount: build plan (TOKEN2049 Origins, main track, Base)

**One line:** sponsors fund a USDC escrow contract on Base, and the host gets paid per guest whose check-in can't be cheaply faked. Every payout is a `CheckedIn` event tied to a ticket, so the sponsor can audit it. The contract can only pay the registered host or refund the sponsor.

**Submit by 11:59pm, 7 Oct:** public GitHub repo, live URL, and a Google Drive link to a .pptx deck.

---

## Calls already made (don't reopen these)

| Decision | Choice | Why |
|---|---|---|
| Chain | **Base Sepolia** (chain id 84532) | EVM tooling is what AI agents write most reliably, and a real escrow contract fits the time box. |
| Escrow | **One `HeadcountEscrow` contract holds every campaign.** The operator can trigger payouts but can only pay the registered host or refund the sponsor. One payout per ticket, enforced on-chain. | Non-custodial enough to survive judge Q&A. Fallback at T+1:30: plain ERC20 transfers behind the same `lib/chain.ts` interface. |
| Token | **MockUSDC "hUSDC", 6 decimals**, operator-mintable | Testnet USDC faucets drip too little for a live demo. The escrow takes the token address as a parameter, so switching to real USDC is just a redeploy. |
| Gas | **One operator EOA** sends every transaction through a **serial queue** | Guests and hosts never need ETH. The queue prevents nonce collisions, which are the #1 way this breaks under a burst of scans. |
| Anti-screenshot | **Rotating HMAC QR** (30s window) | No wallet in the guest's browser. Simple and demoable. |
| Stack | Next.js (App Router) + better-sqlite3, one app, on your VPS behind Caddy | You already deploy this way. SQLite means zero setup. |
| Chain libs | **viem v2** + **Foundry** + OpenZeppelin | viem is the cleanest TS client. Foundry tests run in seconds and deploy with one command. |
| Cut | Offline scanner queue, Telegram audit, holdback, multi-event, wallet connect, upgradeable contracts | Each one is a stretch goal, only if the core gates pass. |

## Do these now (before any coding)

1. **DNS:** point an A record such as `headcount.rhomuel.com` at the VPS. Fallback: `headcount.<VPS-IP-with-dashes>.sslip.io` gets HTTPS from Caddy with no DNS setup.
2. **Base Sepolia RPC key** (Alchemy free tier). `https://sepolia.base.org` works but rate-limits.
3. **Foundry plus a funded operator:** `foundryup`, then `cast wallet new`, then 0.1 Base Sepolia ETH from the Coinbase Developer Platform faucet. At L2 gas prices that covers hundreds of check-ins. Claim from a second faucet (Alchemy, QuickNode) too, as a buffer.
4. **Publish the local repository to a public GitHub repo and commit often.** Local Git initialization is tracked in `docs/STATUS.md`; publication remains a separate task. Your commit history is your proof of no pre-work.
5. The shared specification is at root **`CONTRACT.md`**. `AGENTS.md` tells agents to read it, and `CLAUDE.md` loads that shared guidance. Keep interfaces in `CONTRACT.md` rather than duplicating them across agent files; `docs/00-CONTRACT.md` remains a pointer.

## Timeline (T = when coding starts)

| Time | Work | Gate (if you miss it, cut scope, don't push the time) |
|---|---|---|
| T+0:00 to 0:20 | `create-next-app`, add CONTRACT.md, install deps, `forge init` in `contracts/` | Operator funded with Base Sepolia ETH |
| T+0:20 to 1:30 | **In parallel:** Agent A `01-chain`, Agent B `02-api` (on the chain stub), Agent C `03-ui` | A: `forge test` passes, contract deployed, and `scripts/smoke.ts` shows a `CheckedIn` event on Basescan. Missed it? Switch to the ERC20 fallback in 01-chain. |
| T+1:30 to 2:00 | Integration: swap the stub for the real `lib/chain.ts` and wire the UI to the real APIs | Full flow works on localhost (scan from a phone through `next dev --experimental-https` or ngrok) |
| T+2:00 to 2:45 | `04-deploy` on the VPS, then test with **two real phones** | **Live URL works over HTTPS with the camera. Non-negotiable.** |
| T+2:45 to 3:30 | Polish the dashboard, write the README, verify the contract on Basescan, record a 90s backup video | Feature freeze |
| T+3:30 to 4:30 | Rehearse twice. Teammate has been building slides since T+1:00. | Submit **at least 1 hour before** the deadline |

Stretch goals, in order, only after the freeze criteria are met: a Telegram audit DM to a random 10% of checked-in guests, then a 20% holdback released on close.

## Who does what

- **You:** drive the agents, own integration and deploy.
- **Teammate 1:** slides and pitch script, starting now. No code needed.
- **Teammate 2:** QA on phones, the demo campaign data, the backup video, and the README "why on-chain / why Base" section.

## Demo script (3 min)

1. **0:00 Problem.** There are 1,000+ side events this week. Sponsors pay for headcount they can't verify, and a free RSVP is a guess.
2. **0:25 Sponsor.** The dashboard shows a campaign already funded with 100 heads at 5 hUSDC in escrow. Click "Escrow contract" and Basescan shows the verified source.
3. **0:50 Guest.** A judge scans the RSVP QR on the dashboard and gets a ticket on their phone in about 10 seconds, with no wallet.
4. **1:20 Door.** The teammate's scanner scans the judge's phone and it flashes green with their name. The dashboard ticks up and the payout turns confirmed in about 2 seconds. Open the Basescan link and point to the `CheckedIn` event and the hUSDC transfer to the host.
5. **2:00 Fraud.** Scan a screenshot older than 30 seconds and it shows "Expired". Scan the same ticket again and it shows "Already checked in", which is also enforced on-chain. Then say it plainly: host collusion is mitigated, not solved, and here's the audit layer.
6. **2:30 Roadmap.** Real USDC on Base mainnet with a Coinbase onramp for sponsors, audit sampling plus holdback, then the same primitive for **guild and DAO payouts per verified action**: attendance first, task completion next.

## Slide outline (8 slides max)

1. Headcount: pay for attendance you can prove
2. Problem: sponsor money vs unverifiable headcount (who pays, who's harmed)
3. How it works: sponsor funds escrow → guest RSVPs free → rotating QR at door → contract pays USDC per verified head → `CheckedIn` event trail
4. Live demo (just the URL and a QR)
5. Fraud model: what we stop (screenshots, duplicates, overspend past cap, operator redirecting funds) vs what we mitigate (collusion, through audit sampling and a public trail)
6. Why on-chain, and why Base: escrow neither the host nor we can redirect, real-time per-head settlement, a public event trail, near-zero L2 fees, native USDC with a Coinbase onramp for non-crypto sponsors
7. Business model and roadmap: a fee per verified head, mainnet USDC, holdback plus audit, payouts for guilds and DAOs
8. Team

## Judge questions to prep

- **"Can your operator steal the money?"** No. The contract only pays the host fixed at creation or refunds the sponsor, and it pays each ticket once at most. The operator's only power is deciding *that* a check-in happened, and that's exactly what the audit layer checks.
- **"Why not let the host call checkIn directly?"** Then the host would be grading their own homework. The operator verifies the rotating code on the server first. Next step: the guest's device co-signs the check-in.
- **"Host plus fake friends?"** The cap bounds the loss, check-in velocity is visible on the timeline, and random guest confirmation catches inflation. On the roadmap: a holdback released after the audit.
- **"Who pays you?"** A per-head fee on top of the sponsor's spend, charged only on verified heads.
