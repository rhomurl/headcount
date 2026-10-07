# Headcount

Sponsor-funded attendance payouts on Base Sepolia. A sponsor funds an escrow campaign with test hUSDC, guests RSVP without a wallet, and a host scans rotating QR tickets. The operator submits accepted check-ins to the escrow contract, which pays the registered host once per ticket. Closing a campaign refunds the remaining balance to its sponsor.

**Live app:** [headcount.zymo.qzz.io](https://headcount.zymo.qzz.io/). Contracts are deployed on Base Sepolia; the HTTPS API payout/refund flow passes. 62 app/preflight tests and 15 contract tests pass. Real-phone camera checks remain pending. See [implementation status](docs/STATUS.md).

## Start here

- [Build plan](docs/PLAN.md): scope, timeline, demo, and pitch.
- [Shared contract](CONTRACT.md): agreed interfaces, routes, schema, and invariants.
- [Agent guidance](AGENTS.md): workflow for Codex, Claude, and other coding agents.
- [Documentation index](docs/README.md): task packs and project records.
- [Contributing](CONTRIBUTING.md): local workflow and handoff checks.
- [GitHub repository](https://github.com/rhomurl/headcount): public source; default branch `main`, ongoing work on `codex/headcount-mvp`.

## Stack

Next.js App Router, TypeScript, Tailwind, better-sqlite3, viem v2, and Solidity contracts built with Foundry and OpenZeppelin. The app runs as one Node server on a VPS behind its existing Nginx, using one operator wallet and one serial transaction queue.

The MVP targets **Base Sepolia, chain ID 84532**, with a **6-decimal mock token, hUSDC**. It is a testnet demo. The operator decides whether a check-in occurred; the planned escrow limits payout destinations and prevents duplicate ticket payments. Rotating codes limit old screenshot reuse, but do not prove physical attendance or prevent collusion. QR verification accepts the current or previous 30-second window.

## Local development

Use Node 24 LTS and npm. The lockfile pins dependencies.

```sh
nvm use
npm ci
npm run dev
```

The UI starts without a wallet. Creating/funding campaigns and payouts require the server environment below and deployed testnet contracts. Unconfigured chain operations fail safely; the application does not fabricate transactions.

```sh
npm test
npm run typecheck
npm run lint
npm run preflight                      # after deployment environment is configured
npm run build
npm run test:contracts
# After a successful build, run real loopback-chain integration:
npm run test:local
```

Contract tooling is a local pinned npm development dependency. Run Foundry from `contracts/` using `node tools/forge.cjs`. This wrapper correctly propagates test and deployment failures. The Solidity 0.8.24 compiler is pinned in the lockfile and runs through a local bridge. See [the implementation plan](docs/IMPLEMENTATION.md) for ownership and verification gates.

`npm run smoke` sends Base Sepolia transactions with the configured operator. Run it only for an authorized testnet integration task. `scripts/api-test.sh` also creates/funds/pays a test campaign; read its warning and use an explicitly selected target.

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
| `contracts/`, `app/`, `lib/`, `scripts/` | MVP contracts, application, server libraries and verification scripts |

See [security guidance](SECURITY.md) before working with keys, attendee data, or chain transactions. Deployment instructions are in [the VPS task pack](docs/04-deploy.md); they are a plan, not evidence of a live deployment.

## License

No license has been selected. Add an owner-approved license before representing this project as open source.

The local flow harness uses an ephemeral Anvil chain and temporary SQLite database, confirms host payout and sponsor refund, and removes the test database afterward. It does not contact Base Sepolia or prove deployment. Camera verification over HTTPS on two real phones remains a separate gate.
