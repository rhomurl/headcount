# Security and data handling

Headcount is a testnet demo MVP with local tests and real loopback-chain integration. No independent security audit or live deployment has been completed.

## Reporting a vulnerability

Do not put private keys, attendee records, exploit credentials, or live PINs in a public issue. A private reporting channel has not been configured yet; the repository owner must establish one before public launch. Once available, send the affected component, a minimal reproduction using test data, impact, and suggested mitigation privately.

## Keys and environment

- Keep `.env.local` and deployment credentials outside version control. `.env.example` contains placeholders only.
- Use a dedicated Base Sepolia operator wallet for the demo. Never reuse a mainnet wallet with valuable assets.
- Keep `OPERATOR_PRIVATE_KEY` server-only and out of logs, screenshots, frontend bundles, fixtures, and error responses.
- If a key leaks, stop using it, rotate it, and assess deployed contract ownership/operator configuration. Removing the file from the latest commit does not remove it from history.

## Trust and privacy

The operator attests attendance. The planned escrow restricts destinations and duplicate payouts; rotating QR codes do not eliminate host/guest collusion or live forwarding. The current and previous 30-second steps are accepted, so screenshot expiry is not always exactly 30 seconds.

Tickets contain names, contacts, and secret material. Store runtime databases and backups outside Git, restrict file access, and use synthetic attendee data in documentation and tests. A retention/deletion policy has not been defined and must be decided before collecting real attendee data beyond the demo.

The planned public dashboard exposes guest names in its feed, and possession of a ticket URL allows QR retrieval. Six-digit PINs are the planned demo authorization mechanism. These exposure and access choices need review before use with real funds or sensitive attendee information. See [CONTRACT.md](CONTRACT.md) for the exact current design.

## Operational boundaries

Deploy one Node process for the planned in-process operator queue. Multiple instances need shared nonce coordination. Keep SQLite database, WAL, and SHM files together; a live copy of the database file alone is not a verified backup. Stop all writers or use a supported SQLite backup procedure, and test restoration.

Use HTTPS for scanner camera access. Validate Caddy configuration before reloading shared infrastructure. Keep mainnet, real-USDC operation, and production hardening outside the demo completion claims.
