# ClarityOKR

ClarityOKR is a desktop AI assistant that turns fuzzy intent into actionable Objectives and Key Results (OKRs).  
The app runs on an Electron + Angular stack written in strict TypeScript (ESM-only) and follows SOLID, Domain-Driven Design, and Fail-Fast principles across the main process, renderer, and shared contracts.

## Capabilities

- **Clarification flow** – guided Q&A that converts vague statements (e.g. “提高效率”) into structured intent using mutually exclusive button choices.
- **Sticky OKR note** – a lightweight always-on-top window that visualises generated OKRs in list/tree form, supports manual editing, regeneration, and clipboard export.
- **Session persistence** – clarification sessions, generated OKRs, and action logs are stored locally for fail-fast recovery and telemetry analysis.
- **Shared contracts** – front-end, main process, and automated agents rely on a single source of truth (`@clarityokr/contracts`) to keep types aligned.

## Project Layout

```
app/
  main/        # Electron main process (ES modules, NodeNext)
  renderer/    # Angular renderer application
packages/
  contracts/   # Shared Zod schemas & TypeScript interfaces
tests/
  unit/        # Vitest/Jest style unit specs
  component/   # Angular component tests (Karma)
  e2e/         # Playwright end-to-end scenarios
specs/001-clarify-okr-flow/  # Speckit specification, tasks, research, design docs
data/          # Runtime storage (sessions, OKR snapshots, logs)
```

## Prerequisites

- Node.js ≥ 20.19.x (LTS recommended)
- pnpm 9 (managed via Corepack)
- macOS, Linux, or Windows with a working Electron runtime

```bash
# Enable Corepack once
corepack enable

# (Optional) pin the workspace version explicitly
corepack prepare pnpm@9.0.0 --activate
```

> **Fail-fast tip:** Delete the `data/` folder between manual E2E runs to avoid stale session collisions that can block OKR generation.

## Getting Started

```bash
# Install dependencies
pnpm install

# Launch the desktop app in development mode (renderer + Electron)
pnpm --filter @clarityokr/desktop run dev
```

The workspace uses strict TypeScript (`strict: true`) and ESM imports everywhere—keep new code compliant.

## Quality Gates & Scripts

| Command | Purpose |
| --- | --- |
| `pnpm run lint` | ESLint across all packages (imports resolved via TS paths) |
| `pnpm run typecheck` | `tsc --noEmit` validate for all composites |
| `pnpm run build` | Build contracts, renderer, and main process in sequence |
| `pnpm run test:unit` | Unit tests (`tests-unit` workspace) |
| `pnpm run test:component` | Angular component specs (headless Chrome via Playwright binary) |
| `pnpm run test:e2e` | Playwright Electron E2E suite (runs serially in CI) |

### CI and local runners (act)

- CI runs on GitHub Actions (`.github/workflows/ci.yml`):
  - Node 20 + pnpm via Corepack
  - Lint → Typecheck → Unit → Integration
  - E2E job runs with xvfb and Playwright. It is skipped when `ACT=true` (to keep `act` runs fast), and can be opted-in on `workflow_dispatch` with `run_e2e: true`.

- Run CI locally with `act`:
  - Unit + Integration: `act -j build-and-test -W .github/workflows/ci.yml -P ubuntu-latest=catthehacker/ubuntu:act-latest`
  - (Optional) E2E: `act -j e2e -W .github/workflows/ci.yml -P ubuntu-latest=catthehacker/ubuntu:act-latest -s LLM_API_KEY=test` (requires Playwright deps in the container)

### E2E LLM mocking

- E2E tests start a local HTTP server and set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` for Electron.
- No external network calls are made; tests are deterministic and self-contained.

Follow a TDD/BDD loop—author specs before implementation, especially for sticky window functionality, edit mode flows, regenerate/copy actions, and telemetry.

## CI Notes

GitHub Actions workflow (`.github/workflows/ci.yml`) uses Node 20 + pnpm (Corepack) and runs Lint → Typecheck → Unit → Integration; a separate E2E job runs Playwright Electron with xvfb. The E2E job uploads traces on failure.

### Running CI locally with `act`

1) Use the same runner image as GitHub:

   - Copy `.actrc.sample` to `$HOME/.actrc` or run with `-P ubuntu-latest=catthehacker/ubuntu:act-22.04`.

2) Run unit + integration only (fast path):

   - `act -j build-and-test -W .github/workflows/ci.yml -P ubuntu-latest=catthehacker/ubuntu:act-22.04`

3) Run E2E as well (slower):

   - `act workflow_dispatch -W .github/workflows/ci.yml -e .github/act-e2e-event.json -P ubuntu-latest=catthehacker/ubuntu:act-22.04 -s ACT=false -s LLM_API_KEY=test`

   Notes:
   - The `-s ACT=false` forces the E2E job to run (workflow uses `if: env.ACT != 'true'`).
   - The dispatch event passes `inputs.run_e2e=true` to opt into E2E.
   - The workflow installs Playwright browsers and deps in the container (`npx playwright install --with-deps`).


## Coding Guidelines

- Reference the Speckit constitution: SOLID, DDD, Fail-Fast, strict typing, and shared contracts are non-negotiable.
- Use ESM imports; no CommonJS modules or default exports from new files.
- Provide complete JSDoc on public services, IPC contracts, and shared interfaces.
- Keep renderer and main process communication typed through `@clarityokr/contracts`.
- Favour smaller, purposeful commits—include related tests and docs in the same change set.

## Troubleshooting

- **pnpm not found**: ensure `corepack enable` has been run, or install pnpm manually via `npm install -g pnpm@9`.
- **Electron window never appears in E2E**: delete `data/*.json` and rerun `pnpm run test:e2e`; the tests expect a clean session store.
- **GPU errors on headless Linux**: hardware acceleration is disabled (`app.disableHardwareAcceleration()`); if you re-enable GPU, ensure CI containers have Mesa libraries.

## Contributing

1. Review open tasks in `specs/001-clarify-okr-flow/tasks.md`.
2. Write failing tests first (unit/component/E2E).
3. Implement code using strict TypeScript and DDD boundaries.
4. Update documentation (specs, README, quickstart) and logs.
5. Run `pnpm run lint`, `pnpm run typecheck`, and full test suite before opening a PR.

Staying disciplined with these practices keeps ClarityOKR reliable and friendly to both end users and LLM-based collaborators.
