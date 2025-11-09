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

## Development principles
- Strict TypeScript (`strict: true`) and ESM-only modules.
- IPC and shared types come from `@clarityokr/contracts`.
- TDD/BDD: write failing tests first; include tests with changes.
- Keep changes focused and small; update docs when behavior changes.

## CI guidance
- Workflows live in `.github/workflows/`.
- Use `act` to exercise workflows locally; see README for details.

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
- **Authoritative project context**: See `openspec/project.md` for comprehensive ClarityOKR architecture, tech stack, and conventions

## Reporting issues
Please create an issue with steps to reproduce, expected vs actual behavior, logs, and environment details.

