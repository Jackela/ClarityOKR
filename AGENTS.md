# ClarityOKR Development Guidelines

**Generated:** 2026-03-27  
**Commit:** 495b99d  
**Branch:** main

## Overview

Desktop AI assistant (Electron 30 + Angular 17) that turns fuzzy intent into actionable OKRs. pnpm monorepo, strict TypeScript ESM, Domain-Driven Design.

## Active Technologies

- TypeScript 5.x (`strict: true`, ESM-only)
- Node.js 20.x runtime
- Angular 17 renderer with standalone components
- Electron 30 main process (NodeNext)
- Electron IPC + contextBridge for secure communication
- Angular Signals (migrating from RxJS)
- `@ngrx/component-store` for state management
- `zod` for runtime validation
- Jest for unit/component/integration tests
- Playwright for Electron E2E tests

## Project Structure

```text
app/
├── main/              # Electron main process (ESM, NodeNext) → see app/main/AGENTS.md
│   ├── bootstrap/     # IPC channels, preload scripts
│   ├── clarification/ # Domain module (handlers, state machine, interfaces)
│   ├── config/        # Constants and configuration
│   ├── core/          # Logger, base services
│   ├── persistence/   # SQLite repositories, database service
│   ├── services/      # Business services (LLM, encryption, storage)
│   └── windows/       # Window management (clarification, sticky)
├── renderer/          # Angular 17 application → see app/renderer/AGENTS.md
│   ├── clarification/ # Feature: wizard, state services
│   ├── core/          # Error handling, logging
│   ├── okr-sticky/    # Feature: sticky note component
│   ├── services/      # App-level services (telemetry)
│   └── shared/        # Reusable components (button, card, input, skeleton)
packages/
└── contracts/         # Shared Zod schemas & TS interfaces → see packages/contracts/AGENTS.md
tests/                 # Test pyramid → see tests/AGENTS.md
├── unit/              # Jest unit tests (Node + mocks)
├── integration/       # Jest integration tests (SQLite :memory:)
├── e2e/               # Playwright E2E tests (real Electron)
└── performance/       # Benchmarks
docs/                  # Architecture documentation
scripts/               # Build & utility scripts
openspec/              # OpenSpec change tracking
specs/                 # Feature specifications (Speckit)
data/                  # Runtime storage (sessions, OKR snapshots, logs)
```

## Workspace Packages

| Package | Path | Purpose |
|---------|------|---------|
| @clarityokr/main | `app/main` | Electron main process |
| @clarityokr/renderer | `app/renderer` | Angular renderer |
| @clarityokr/contracts | `packages/contracts` | Shared types & Zod schemas |
| @clarityokr/tests-unit | `tests/unit` | Unit tests |
| @clarityokr/tests-integration | `tests/integration` | Integration tests |
| @clarityokr/tests-e2e | `tests/e2e` | E2E tests |
| @clarityokr/tests-performance | `tests/performance` | Benchmarks |

## WHERE TO LOOK

| Task | Location | Key File |
|------|----------|----------|
| Add IPC handler | `app/main/src/clarification/` | `clarification-controller.ts` |
| Change session state | `app/main/src/clarification/` | `clarification-state-machine.ts` |
| Modify database schema | `app/main/src/persistence/` | `migration.service.ts` |
| Add LLM integration | `app/main/src/services/` | `okr-agent.service.ts` |
| Modify wizard UI | `app/renderer/src/app/clarification/` | `clarification-wizard.component.ts` |
| Add shared component | `app/renderer/src/app/shared/` | `components/index.ts` |
| Modify sticky note | `app/renderer/src/app/okr-sticky/` | `okr-sticky-note.component.ts` |
| Add IPC channel | `packages/contracts/src/` | `ipc-channels.ts` |
| Add domain types | `packages/contracts/src/` | `clarify-to-okr.contract.ts` |
| Add Zod schema | `packages/contracts/src/validators/` | `*.ts` |

## Bootstrap Flow

```
Electron launches → app/main/dist/main.js
  ├── Creates BrowserWindow with preload.js (context isolation)
  ├── Registers 7 IPC handlers via ClarificationController (facade)
  └── Loads app/renderer/dist/index.html
      └── Angular bootstrapApplication() → AppComponent
          └── Dual view: ClarificationWizard OR OkrStickyNote (?view=sticky)
```

## Module Boundaries

### Main Process Architecture
- **bootstrap/**: IPC channel registration, preload script (security-critical)
- **clarification/**: Domain-driven module with clean interfaces
  - Use `clarification-prompt-handler.ts` (NOT `handlers/clarification-prompt.handler.ts`)
  - State machine for session management
  - Clean separation: handlers → services → repositories
- **persistence/**: Repository pattern for SQLite (database.service, migration.service)
- **services/**: Business logic (LLM, encryption, circuit breaker, caching)
- **windows/**: Window lifecycle management (ClarificationController facade)

### Renderer Architecture
- **clarification/**: Wizard component with state machine service
- **okr-sticky/**: Sticky note always-on-top window
- **shared/**: Cross-cutting components (button, card, input, spinner, progress, skeleton)

### Contracts Package
- Single source of truth for IPC types
- Zod schemas for runtime validation
- NEVER import from `packages/contracts` internals - use public exports only

## Commands

```bash
# Install
pnpm install

# Development
pnpm run dev                    # Start Electron app in dev mode
pnpm run build                  # Build all: contracts → main → renderer
pnpm run build:contracts        # Build contracts only
pnpm run build:main             # Build main process
pnpm run build:renderer         # Build renderer

# Quality
pnpm run lint                   # ESLint across all packages
pnpm run lint:fix               # Auto-fix ESLint issues
pnpm run typecheck              # TypeScript type checking
pnpm run format                 # Check Prettier formatting
pnpm run format:write           # Auto-format

# Testing
pnpm run test                   # All tests
pnpm run test:unit              # Unit tests (Jest)
pnpm run test:component         # Angular component tests (Jest)
pnpm run test:integration       # Integration tests (SQLite :memory:)
pnpm run test:e2e               # E2E tests (Playwright)
pnpm run test:performance       # Benchmarks

# CI
pnpm run build:ci               # CI-optimized build
pwsh scripts/act-run-ci.ps1     # Local CI simulation with act
```

## Code Style

### TypeScript
- `strict: true` is **REQUIRED** - no exceptions
- Use `NodeNext` module resolution for ESM compliance
- Import paths must include `.js` extension for NodeNext (e.g., `import { X } from './file.js'`)
- Prefer `interface` over `type` for object shapes
- Explicit return types on public functions
- Use `import type` for type-only imports
- `@typescript-eslint/no-explicit-any`: error (relaxed only in test files)

### Angular
- Standalone components only (no NgModules except for testing)
- Signals for state management (migrating from RxJS)
- OnPush change detection preferred
- Components should have JSDoc with @usage examples

### Testing
- Unit tests: `*.spec.ts` in `tests/unit/`
- Component tests: `*.test.ts` alongside component
- E2E tests: `*.spec.ts` in `tests/e2e/specs/`
- Mocks in `tests/unit/__mocks__/`
- **NEVER** use `waitForTimeout` in E2E tests - use deterministic waits from `helpers/native-dom.ts`
- Coverage threshold: 80% (branches, functions, lines, statements)
- E2E retries: 0 (fix root causes, don't mask with retries)

### State Management
- Main process: Use state machine pattern (see `clarification-state-machine.ts`)
- Renderer: Use Angular Signals or `@ngrx/component-store`
- **DEPRECATED**: `SyncClarificationState` adapter - use `ClarificationStateMachine` directly

### Security
- Never log sensitive data (API keys, encryption keys)
- Use `secure-storage.service.ts` for secrets
- IPC channels must be typed through contracts package
- All external input validated with Zod
- Preload script validates channels against whitelist

## Important Notes for AI Assistants

### Common Pitfalls

1. **Handler Duplication**: The deprecated handler was removed, but references may exist:
   - ❌ `app/main/src/handlers/clarification-prompt.handler.ts` (DEPRECATED, removed)
   - ✅ `app/main/src/clarification/clarification-prompt-handler.ts` (USE THIS)

2. **ESLint Version**: Root uses ESLint 8.x, renderer uses 9.x
   - Use `.eslintrc.cjs` syntax (not `eslint.config.js`)
   - Flat config NOT supported at root level

3. **Test Environment**: Different environments per layer
   - Unit: Node + mocks | Component: Jest + jsdom | Integration: SQLite :memory: | E2E: Real Electron

4. **TypeScript Config Inconsistency**:
   - Main process: `module: NodeNext`
   - Renderer app: `module: ES2020` (legacy, being migrated)
   - Test configs: Various (`bundler`, `Node`, `CommonJS`)

5. **Deprecated State Methods** (renderer state machine):
   - ❌ `selectOption()` → ✅ `recordSelection(promptId, optionId)`
   - ❌ `reportError()` → ✅ `setError(error)`
   - ❌ `setReady()` / `markReady()` → auto-calculated via `recordSelection`

6. **CSS Tokens**: `app/renderer/src/styles/tokens.css` has a "DEPRECATED TOKENS" section - DO NOT USE

### File Size Guidelines
- Keep files under 300 lines
- Split large services into focused units
- Known violations: `secure-storage.service.ts` (503 lines), `clarification-controller.ts` (500+ lines)

### Documentation Requirements
- Public APIs must have JSDoc
- Complex business logic needs inline comments
- Architecture decisions documented in `docs/architecture.md`

## Formatting

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true,
  "arrowParens": "always"
}
```

## Recent Changes

- **2025-03-27**: Migrated component tests from Vitest to Jest
- **2025-03-27**: Fixed ESLint version mismatch between root and renderer
- **2025-03-27**: Removed duplicate handler files (consolidated into clarification/)
- **2025-03-27**: Updated AGENTS.md with accurate project structure
- **001-clarify-okr-flow**: Implemented clarification wizard with state machine
- **001-clarify-okr-flow**: Added SQLite persistence layer
- **001-clarify-okr-flow**: Implemented OKR generation with LLM integration

## Child AGENTS.md Files

| Path | Scope |
|------|-------|
| `app/main/AGENTS.md` | Electron main process (DDD, state machines, persistence) |
| `app/renderer/AGENTS.md` | Angular renderer (standalone components, Signals) |
| `packages/contracts/AGENTS.md` | Shared Zod schemas & IPC contracts |
| `tests/AGENTS.md` | Test pyramid (Jest unit/integration, Playwright E2E) |

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
