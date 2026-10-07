# Headcount

Sponsor-funded attendance payouts on Base Sepolia. A sponsor funds an escrow campaign with test hUSDC, guests RSVP without a wallet, and a host scans rotating QR tickets. The operator submits accepted check-ins to the escrow contract, which pays the registered host once per ticket. Closing a campaign refunds the remaining balance to its sponsor.

**Status:** repository and build specifications only. The application, contracts, and deployment have not been implemented or verified. See [implementation status](docs/STATUS.md).

## Start here

- [Build plan](docs/PLAN.md): scope, timeline, demo, and pitch.
- [Shared contract](CONTRACT.md): agreed interfaces, routes, schema, and invariants.
- [Agent guidance](AGENTS.md): workflow for Codex, Claude, and other coding agents.
- [Documentation index](docs/README.md): task packs and project records.
- [Contributing](CONTRIBUTING.md): local workflow and handoff checks.

## Planned stack

Next.js App Router, TypeScript, Tailwind, better-sqlite3, viem v2, and Solidity contracts built with Foundry and OpenZeppelin. The app runs as one Node server on a VPS behind Caddy, using one operator wallet and one serial transaction queue.

The MVP targets **Base Sepolia, chain ID 84532**, with a **6-decimal mock token, hUSDC**. It is a testnet demo. The operator decides whether a check-in occurred; the planned escrow limits payout destinations and prevents duplicate ticket payments. Rotating codes limit old screenshot reuse, but do not prove physical attendance or prevent collusion. QR verification accepts the current or previous 30-second window.

## Local development

There is no `package.json`, app scaffold, or Foundry project yet. Start with the [build plan](docs/PLAN.md) and the task packs. Add runnable install, development, test, and build commands here when those projects exist.

An environment template is provided:

```sh
cp .env.example .env.local
```

Fill in local testnet values after obtaining an operator wallet and deploying the contracts. Never commit the populated file. Keep the public escrow address equal to the server-side escrow address; Next.js embeds `NEXT_PUBLIC_` values at build time.

## Project layout

| Path | Purpose |
| --- | --- |
| `CONTRACT.md` | Canonical shared specification |
| `AGENTS.md`, `CLAUDE.md` | Coding-agent guidance |
| `docs/` | Build plan, task packs, status, and setup record |
| `.env.example` | Placeholder-only environment configuration |
| `contracts/`, `app/`, `lib/`, `scripts/` | Planned implementation directories; not created yet |

See [security guidance](SECURITY.md) before working with keys, attendee data, or chain transactions. Deployment instructions are in [the VPS task pack](docs/04-deploy.md); they are a plan, not evidence of a live deployment.

## License

No license has been selected. Add an owner-approved license before representing this project as open source.
