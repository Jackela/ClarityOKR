# Clarify-to-OKR Desktop Flow – Research

## Decision Log

### Decision: Local persistence via JSON repository in appData
- **Rationale**: Meets offline requirement, keeps implementation lightweight, and honors pure TypeScript stack without introducing native binaries. Electron provides reliable `app.getPath('userData')` for per-user storage.
- **Alternatives considered**:
  - SQLite via better-sqlite3 (rejected: extra native dependency, exceeds current scope).
  - In-memory only (rejected: violates persistence requirement across relaunches).

### Decision: State management with `@ngrx/component-store`
- **Rationale**: Provides SOLID-friendly observable stores scoped to view models, keeps Angular ecosystem alignment, and simplifies TDD of state transitions.
- **Alternatives considered**:
  - Global NgRx Store (rejected: overkill for single-window experience).
  - Custom RxJS subjects (rejected: higher maintenance, less structured testing).

### Decision: Electron IPC contract guarded by `zod` schemas
- **Rationale**: Enforces fail-fast validation between renderer and main processes, supplies typed runtime checks, and integrates cleanly with TypeScript interfaces in shared package.
- **Alternatives considered**:
  - Manual type guards (rejected: more boilerplate, easier to drift).
  - Relying solely on TypeScript types (rejected: no runtime safety, violates fail-fast principle).

### Decision: Playwright Electron runner for end-to-end tests
- **Rationale**: Supports BDD-style scenarios, automates clarification interview flows, and verifies always-on-top behavior through window assertions.
- **Alternatives considered**:
  - Spectron (deprecated, no longer maintained).
  - WebdriverIO (heavier setup, less TypeScript-first tooling).

### Decision: Sticky window rendering with Angular CDK Overlay in frameless BrowserWindow
- **Rationale**: Overlay provides declarative positioning, supports accessibility focus trapping, and integrates with Angular component structure while BrowserWindow flag ensures always-on-top.
- **Alternatives considered**:
  - Raw HTML/CSS in standalone window (rejected: more manual state synchronization).
  - Third-party sticky-note libraries (rejected: potential license/maintenance risk).

## Unresolved Follow-ups
- None – all technical context clarifications addressed.
