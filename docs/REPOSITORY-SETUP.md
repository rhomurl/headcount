# Repository setup plan

Requested on 7 October 2026. This task establishes the repository and documentation baseline; application implementation remains in [PLAN.md](PLAN.md).

1. Initialize a local Git repository on `main`.
2. Promote the supplied shared specification to root `CONTRACT.md`. Keep the original documentation path as a pointer so there is only one specification to maintain.
3. Add `AGENTS.md` with repository workflow, ownership boundaries, verification expectations, and secret handling. Have `CLAUDE.md` load that guidance.
4. Add a project README, contribution and security guidance, changelog, documentation index, and implementation status tracker.
5. Add `.gitignore` and a placeholder-only `.env.example` for the planned stack.
6. Verify local documentation links, ignored secrets/runtime files, whitespace, and Git state. Create an initial local commit containing the supplied plans and new baseline.

## Scope

No app scaffolding, dependency installation, chain transactions, deployment, GitHub publication, or license selection is part of this setup. Existing product decisions and task requirements remain in the supplied plans.

## Completion evidence

Record the completed setup and verification in [STATUS.md](STATUS.md). Code, contract deployment, and phone-camera verification require their own evidence before being marked complete.
