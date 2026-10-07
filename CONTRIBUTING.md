# Contributing

Read [AGENTS.md](AGENTS.md), [CONTRACT.md](CONTRACT.md), and the relevant [task pack](docs/README.md) first. The MVP is implemented and locally verified; live deployment gates remain in `docs/STATUS.md`.

## Workflow

1. Check the working tree and identify the requested scope. Write or update a Markdown implementation plan in `docs/` before substantive coding.
2. Use a focused branch such as `feat/chain`, `feat/api`, or `feat/ui` for implementation. Preserve existing work and coordinate shared files when working in parallel.
3. Implement against the shared specification. Update it and affected task packs if an agreed interface changes.
4. Run the relevant checks described in `AGENTS.md` and the task pack. Add regression coverage for meaningful bug fixes and tests for payout, authorization, and replay invariants.
5. Update [STATUS.md](docs/STATUS.md), README commands, and [CHANGELOG.md](CHANGELOG.md) as appropriate. Record limitations and unfinished integration honestly.
6. Review `git diff --check`, the diff, and staged files before committing. Keep dependency lockfiles committed once a package manager is chosen.

## Handoff

Describe what changed, why, exact verification results, and remaining work. For chain changes, distinguish unit tests from testnet receipts and deployment. For UI changes, include mobile behavior and camera/HTTPS verification where relevant.

Never commit `.env.local`, wallet keys, runtime databases, attendee data, private PINs, or logs. Use `.env.example` for placeholders. Document new required environment names there without adding real credentials.

Publishing, deployment, and transactions are separate operations from local coding. Follow the user's authorized task scope and the [deployment task pack](docs/04-deploy.md).
