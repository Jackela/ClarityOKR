# ClarityOKR Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-03-27

## Active Technologies

- TypeScript 5.x (`strict: true`)
- Node.js 20.x runtime
- Angular 17 renderer with standalone components
- Electron 30 main process
- Electron IPC + contextBridge for secure communication
- Angular Signals (migrating from RxJS)
- `@ngrx/component-store` for state management
- `zod` for runtime validation
- Jest for unit and component tests
- Playwright for Electron E2E tests

## Project Structure

```text
app/
├── main/              # Electron main process (ES modules, NodeNext)
│   ├── bootstrap/     # IPC channels, preload scripts
│   ├── clarification/ # Domain module (handlers, state machine, interfaces)
│   ├── config/        # Constants and configuration
│   ├── core/          # Logger, base services
│   ├── handlers/      # ⚠️ DEPRECATED: IPC handlers (use clarification/ instead)
│   ├── persistence/   # SQLite repositories, database service
│   ├── services/      # Business services (LLM, encryption, storage)
│   ├── types/         # TypeScript declarations
│   └── windows/       # Window management (clarification, sticky)
├── renderer/          # Angular 17 application
│   ├── clarification/ # Feature module: wizard, state services
│   ├── core/          # Error handling, logging
│   ├── okr-sticky/    # Feature module: sticky note component
│   ├── services/      # App-level services
│   ├── shared/        # Reusable components, directives, pipes
│   └── validators/    # Zod validators
packages/
└── contracts/         # Shared Zod schemas & TypeScript interfaces
    ├── src/
    │   ├── ipc-channels.ts      # IPC contract definitions
    │   ├── clarify-to-okr.contract.ts  # Domain contracts
    │   ├── llm-gateway.contract.ts     # LLM API contracts
    │   └── validators/          # Shared validation schemas
    └── dist/            # Compiled output
tests/
├── unit/              # Jest unit tests (main process, services)
├── integration/       # Jest integration tests (with SQLite :memory:)
├── e2e/               # Playwright E2E tests (full Electron app)
└── performance/       # Benchmarks (not in pnpm workspace)
docs/                  # Architecture documentation, diagrams
scripts/               # Build and utility scripts
```

## Module Boundaries

### Main Process Architecture
- **bootstrap/**: IPC channel registration, preload script initialization
- **clarification/**: Domain-driven module with clean interfaces
  - Use `clarification-prompt-handler.ts` (NOT `handlers/clarification-prompt.handler.ts`)
  - State machine for session management
  - Clean separation between handlers, services, and repositories
- **persistence/**: Repository pattern for SQLite
- **services/**: Business logic (LLM integration, encryption, storage)
- **windows/**: Window lifecycle management

### Renderer Architecture
- **clarification/**: Wizard component with state machine
- **okr-sticky/**: Sticky note always-on-top window
- **shared/**: Cross-cutting components and utilities

### Contracts Package
- Single source of truth for IPC types
- Zod schemas for runtime validation
- NEVER import from `packages/contracts` internals - use public exports only

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm run dev                    # Start Electron app in dev mode
pnpm run build                  # Build all packages
pnpm run build:contracts        # Build contracts only
pnpm run build:main             # Build main process
pnpm run build:renderer         # Build renderer

# Quality checks
pnpm run lint                   # ESLint across all packages
pnpm run lint:fix               # Auto-fix ESLint issues
pnpm run typecheck              # TypeScript type checking
pnpm run test                   # Run all tests
pnpm run test:unit              # Unit tests only
pnpm run test:component         # Angular component tests (Jest)
pnpm run test:integration       # Integration tests
pnpm run test:e2e               # E2E tests (Playwright)

# CI (run locally before pushing)
pnpm run build:ci
pnpm run test
```

## Code Style

### TypeScript
- `strict: true` is **REQUIRED** - no exceptions
- Use `NodeNext` module resolution for ESM compliance
- Import paths must include `.js` extension for NodeNext (e.g., `import { X } from './file.js'`)
- Prefer `interface` over `type` for object shapes
- Explicit return types on public functions
- Use `import type` for type-only imports

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
- **NEVER** use `waitForTimeout` in E2E tests - use deterministic waits

### State Management
- Main process: Use state machine pattern (see `clarification-state-machine.ts`)
- Renderer: Use Angular Signals or `@ngrx/component-store`
- **DEPRECATED**: `SyncClarificationState` adapter - use `ClarificationStateMachine` directly

### Security
- Never log sensitive data (API keys, encryption keys)
- Use `secure-storage.service.ts` for secrets
- IPC channels must be typed through contracts package
- All external input validated with Zod

## Important Notes for AI Assistants

### Common Pitfalls
1. **Handler Duplication**: There are TWO `ClarificationPromptHandler` classes:
   - ❌ `app/main/src/handlers/clarification-prompt.handler.ts` (DEPRECATED)
   - ✅ `app/main/src/clarification/clarification-prompt-handler.ts` (USE THIS)

2. **ESLint Version**: Root uses ESLint 8.x (flat config not supported), renderer uses 9.x
   - Use `.eslintrc.cjs` syntax (not `eslint.config.js`)
   - Be aware of version differences when adding rules

3. **Test Environment**: 
   - Unit tests: Node environment with mocks
   - Component tests: Jest with jsdom, Angular preset
   - Integration tests: SQLite :memory: database
   - E2E: Real Electron app

4. **TypeScript Config Inconsistency**:
   - Main process: `module: NodeNext`
   - Renderer app: `module: ES2020` (legacy, being migrated)
   - Test configs: Various (see individual tsconfig files)

### File Size Guidelines
- Keep files under 300 lines
- Split large services into focused units
- Example: `secure-storage.service.ts` (335 lines) should be refactored

### Documentation Requirements
- Public APIs must have JSDoc
- Complex business logic needs inline comments
- Architecture decisions documented in `docs/architecture.md`

## Recent Changes

- **2025-03-27**: Migrated component tests from Vitest to Jest
- **2025-03-27**: Fixed ESLint version mismatch between root and renderer
- **2025-03-27**: Removed duplicate handler files (consolidated into clarification/)
- **2025-03-27**: Updated AGENTS.md with accurate project structure
- **001-clarify-okr-flow**: Implemented clarification wizard with state machine
- **001-clarify-okr-flow**: Added SQLite persistence layer
- **001-clarify-okr-flow**: Implemented OKR generation with LLM integration

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
