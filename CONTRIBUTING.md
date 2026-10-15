# Contributing to ClarityOKR

Thank you for your interest in improving ClarityOKR!

## Prerequisites

- Node.js 20.x (LTS). See `.nvmrc` for the exact version.
- pnpm 9 managed by Corepack:
  - `corepack enable && corepack prepare pnpm@9.0.0 --activate`

## Getting started

1. Install deps: `pnpm install`
2. Lint + types: `pnpm run lint && pnpm run typecheck`
3. Build: `pnpm run build`
4. Tests:
   - Unit: `pnpm run test:unit`
   - Integration: `pnpm run test:integration`
   - Component: `pnpm run test:component`
   - E2E (Electron/Playwright): `pnpm run test:e2e`
   - **Everything, one command:** `pnpm test` (unit → integration → component → e2e)

   Notes:
   - `better-sqlite3` is a native module built for one runtime at a time. `test:unit` /
     `test:integration` and `test:e2e` check it first (`scripts/ensure-native.mjs`) and rebuild
     it for Node or Electron only when needed, so you can switch freely.
   - `test:e2e` builds the app first, then runs the CI Playwright config (Electron only, one
     worker, no browser download needed). On Linux without a display, wrap it in
     `xvfb-run -a`. Set `IMPL_SHOTS_DIR=<dir>` to save the design screenshots.
   - The mock LLM server listens on a port picked by the OS, so parallel runs do not collide.

## Development principles

- Strict TypeScript (`strict: true`) and ESM-only modules.
- IPC and shared types come from `@clarityokr/contracts`.
- TDD/BDD: write failing tests first; include tests with changes.
- Keep changes focused and small; update docs when behavior changes.

## Local CI Validation

Before pushing changes, validate them locally using `act` to catch failures early and reduce CI iteration cycles.

**Quick Commands:**

```bash
# Standard validation (lint + typecheck + build + tests)
pwsh scripts/act-run-ci.ps1

# Full validation with E2E tests
pwsh scripts/act-run-clarify-okr-e2e.ps1
```

**Resources:**

- **[Pre-Push Validation Checklist](docs/ci-validation-checklist.md)** - Step-by-step validation workflow
- **[CI Simulation Guide](docs/ci-simulation.md)** - Complete setup, troubleshooting, and advanced usage

Local validation provides faster feedback than GitHub Actions and helps ensure your changes will pass CI before pushing.

## CI guidance

- Workflows live in `.github/workflows/`.
- See [docs/ci-simulation.md](docs/ci-simulation.md) for local testing with `act`.

## AI Coding Tool Directories

This repository uses AI-assisted development tools that create local working directories:

- **`.claude/`**: Claude Code workspace settings and context
- **`.specify/`**: Speckit templates and memory
- **`openspec/`**: OpenSpec change proposals and specifications
- **`AGENTS.md`**: OpenSpec agent instructions (auto-generated)
- **`CLAUDE.md`**: Claude Code project instructions

**Important Notes:**

- These directories are gitignored and will not appear in version control
- They contain valuable context for AI assistants working in the codebase
- If you need to preserve this context, back it up separately (e.g., Dropbox, personal git repo)
- **Authoritative project context**: See [docs/architecture.md](docs/architecture.md) and [README.md](README.md) for ClarityOKR architecture, tech stack, and conventions

## Reporting issues

Please create an issue with steps to reproduce, expected vs actual behavior, logs, and environment details.
