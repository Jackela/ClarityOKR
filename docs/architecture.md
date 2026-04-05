# ClarityOKR Architecture

## System Overview

ClarityOKR is an Electron desktop application that transforms fuzzy intent into structured OKRs through an AI-guided clarification flow.

```mermaid
graph TB
    subgraph "Main Process (Node.js)"
        MC[Main Entry<br/>main.ts]
        CC[ClarificationController]
        SWM[StickyWindowManager]
        OAS[OkrAgentService]
        SR[SessionRepository]
        OR[OkrRepository]
        ALW[ActionLogWriter]
    end

    subgraph "Renderer Process (Angular)"
        CW[ClarificationWizard]
        CS[ClarificationStore]
        OSN[OkrStickyNote]
        LG[LLMGatewayService]
        CO[ClarificationOrchestrator]
    end

    subgraph "Shared Contracts"
        ZS[Zod Schemas<br/>@clarityokr/contracts]
    end

    subgraph "External Services"
        LLM[LLM API<br/>OpenAI/Compatible]
    end

    subgraph "Persistence Layer"
        FS[(File System<br/>data/)]
    end

    MC --> CC
    MC --> SWM
    CC --> OAS
    CC --> SR
    CC --> OR
    CC --> ALW
    OAS --> LLM

    CW --> CS
    CW --> LG
    CS --> CO
    OSN --> OAS

    CC <-->|IPC| CW
    SWM <-->|IPC| OSN

    SR --> FS
    OR --> FS
    ALW --> FS

    ZS -.->|validates| CC
    ZS -.->|validates| CW
```

## Process Architecture

Electron follows a multi-process model with distinct responsibilities:

### Main Process (Node.js)

- **Entry Point**: `app/main/src/main.ts`
- **Responsibilities**:
  - Window lifecycle management
  - IPC handler registration
  - File system operations
  - LLM API communication
  - Native OS integration

### Renderer Process (Angular)

- **Entry Point**: `app/renderer/src/main.ts`
- **Responsibilities**:
  - UI rendering
  - User interaction handling
  - State management (ComponentStore)
  - IPC communication to main process

### Communication Pattern

```mermaid
sequenceDiagram
    participant U as User
    participant R as Renderer (Angular)
    participant M as Main Process
    participant L as LLM API
    participant F as File System

    U->>R: Enter intent
    R->>M: IPC: CLARIFICATION_PROMPT
    M->>L: Generate question
    L-->>M: Question + options
    M->>F: Save session
    M-->>R: IPC: Prompt response
    R->>U: Display options
    U->>R: Select option
    R->>M: IPC: CLARIFICATION_RESPOND
    M->>F: Update session
```

## Data Flow

### Clarification Flow

```mermaid
stateDiagram-v2
    [*] --> IntentInput: User starts
    IntentInput --> Collecting: Submit intent
    Collecting --> Collecting: Select option
    Collecting --> Generating: Request OKR
    Generating --> Completed: OKR created
    Completed --> [*]: Close/Sticky
```

### Persistence Flow

```mermaid
flowchart LR
    subgraph Write Path
        A[Session/Okr Data] --> B[Zod Validation]
        B --> C[JSON Serialization]
        C --> D[File Write]
    end

    subgraph Read Path
        E[File Read] --> F[JSON Parse]
        F --> G[Zod Validation]
        G --> H[Typed Object]
    end

    D --> I[(data/*.json)]
    I --> E
```

## Technology Stack

| Layer           | Technology                | Purpose                       |
| --------------- | ------------------------- | ----------------------------- |
| Runtime         | Node.js 20.x, Electron 30 | Desktop app runtime           |
| Frontend        | Angular 17, RxJS 7        | UI framework                  |
| State           | @ngrx/component-store     | Lightweight state management  |
| Validation      | Zod                       | Runtime type validation       |
| Testing         | Jest, Playwright          | Unit + E2E testing            |
| Build           | esbuild, Angular CLI      | Bundling and compilation      |
| Package Manager | pnpm 9                    | Monorepo workspace management |

## File Structure

```
app/
├── main/                     # Electron main process
│   src/
│   ├── main.ts              # Entry point
│   ├── bootstrap/           # IPC channel definitions
│   ├── persistence/         # Data storage layer
│   │   ├── session-repository.ts
│   │   ├── okr-repository.ts
│   │   ├── action-log-writer.ts
│   │   └── utils.ts         # Shared persistence utilities
│   ├── services/            # Business logic
│   │   └── okr-agent.service.ts
│   └── windows/             # Window controllers
│       ├── clarification-controller.ts
│       └── sticky-window-manager.ts
│
├── renderer/                # Angular renderer
│   src/
│   ├── app/
│   │   ├── clarification/   # Clarification flow
│   │   │   ├── components/
│   │   │   └── services/
│   │   └── okr-sticky/      # Sticky note window
│   └── main.ts
│
packages/
└── contracts/               # Shared TypeScript + Zod
    └── src/
        └── index.ts

tests/
├── unit/                    # Unit tests
├── component/               # Angular component tests
├── integration/             # Integration tests
├── e2e/                     # Playwright E2E
└── performance/             # Performance benchmarks

data/                        # Runtime storage (gitignored)
├── session.json
├── okr/
└── action-log.ndjson
```

## Key Design Decisions

### 1. Monorepo with Shared Contracts

**Decision**: Use a single `@clarityokr/contracts` package for all type definitions.

**Rationale**:

- Single source of truth for IPC contracts
- Zod schemas provide runtime validation
- Eliminates type drift between processes

### 2. File-Based Persistence

**Decision**: Use JSON files for session and OKR storage instead of a database.

**Rationale**:

- Simple deployment (no database setup)
- Human-readable for debugging
- Sufficient for single-user desktop app

### 3. IPC Communication Pattern

**Decision**: Use typed IPC channels with Zod validation on both ends.

**Rationale**:

- Type safety across process boundary
- Fail-fast on invalid payloads
- Clear contract documentation

### 4. Component Store for State

**Decision**: Use `@ngrx/component-store` instead of full NgRx.

**Rationale**:

- Lighter weight for small state needs
- Local component state management
- RxJS-based, fits Angular patterns

### 5. E2E Testing with Mock LLM

**Decision**: Mock LLM responses via local HTTP server in E2E tests.

**Rationale**:

- Deterministic, repeatable tests
- No external API dependencies
- Fast test execution

## IPC Channels

| Channel                 | Direction       | Purpose                           |
| ----------------------- | --------------- | --------------------------------- |
| `CLARIFICATION_PROMPT`  | Renderer → Main | Request next clarification prompt |
| `CLARIFICATION_RESPOND` | Renderer → Main | Submit user's option selection    |
| `OKR_GENERATE`          | Renderer → Main | Generate final OKR document       |
| `LLM_NEXT_QUESTION`     | Renderer → Main | Get next LLM-generated question   |
| `LLM_GENERATE_DRAFT`    | Renderer → Main | Generate OKR draft from context   |
| `OKR_LATEST`            | Renderer → Main | Fetch most recent OKR             |
| `STICKY_REOPEN`         | Renderer → Main | Reopen sticky note window         |

## Error Handling Strategy

1. **Validation Layer**: Zod schemas reject malformed data at boundaries
2. **IPC Error Propagation**: Main process errors serialize to renderer
3. **User Feedback**: Error UI with retry options for recoverable failures
4. **Logging**: Action log records all significant events for debugging
## Architecture Decision Records (ADR)

This section documents significant architectural decisions and their rationale. Each record follows the format: Context, Decision, Consequences.

### ADR-001: Electron for Desktop Platform

**Status**: Accepted
**Date**: 2024-Q1

#### Context
We needed a cross-platform desktop application that could:

- Run on macOS, Windows, and Linux
- Access native OS features (keychain, always-on-top windows)
- Support offline operation with local data storage
- Integrate with modern web UI frameworks

#### Decision
Use Electron 30 as the desktop framework.

#### Consequences
**Positive**:

- Single codebase for all platforms
- Access to Node.js ecosystem
- Native OS integration via Electron APIs
- Well-documented, mature framework

**Negative**:

- Larger bundle size compared to native apps
- Higher memory usage
- Requires bundling Chromium

---

### ADR-002: Angular 17 with Standalone Components

**Status**: Accepted
**Date**: 2024-Q1

#### Context
We needed a modern, maintainable frontend framework with:
- Strong TypeScript support
- Component-based architecture
- Reactive state management
- Long-term support

#### Decision
Use Angular 17 with standalone components (no NgModules).

#### Consequences
**Positive**:

- Strict TypeScript enforcement
- Signals for fine-grained reactivity
- Simpler component structure without NgModules
- Excellent developer tooling

**Negative**:

- Learning curve for developers new to Angular
- Opinionated framework structure

---

### ADR-003: SQLite for Local Persistence

**Status**: Accepted
**Date**: 2024-Q1

#### Context
We needed local data persistence that:
- Works offline
- Supports structured queries
- Is reliable and well-tested
- Requires no external setup

#### Decision
Use SQLite with better-sqlite3 for synchronous, reliable database operations.

#### Consequences
**Positive**:

- Zero configuration required
- ACID compliance
- Fast, local queries
- File-based (easy backup/restore)

**Negative**:

- Single-user limitation (acceptable for desktop app)
- Requires native module compilation

---

### ADR-004: State Machine for Session Management

**Status**: Accepted
**Date**: 2024-Q2

#### Context
The clarification flow requires complex state management with:
- Multiple states (idle, collecting, generating, completed)
- Valid state transitions
- Error handling and recovery
- Persistence across app restarts

#### Decision
Implement a finite state machine for clarification session management.

#### Consequences
**Positive**:

- Explicit, verifiable state transitions
- Easy to test and debug
- Prevents invalid state changes
- Self-documenting code

**Negative**:

- Initial learning curve for state machine pattern
- More boilerplate than simple flags

---

### ADR-005: Zod for Runtime Validation

**Status**: Accepted
**Date**: 2024-Q1

#### Context
We needed runtime validation for:
- IPC message contracts
- Data persistence
- External API responses
- Configuration files

#### Decision
Use Zod for runtime type validation and schema definition.

#### Consequences
**Positive**:

- TypeScript inference from schemas
- Excellent error messages
- Composable schemas
- Works at all boundaries (IPC, persistence, API)

**Negative**:

- Additional runtime overhead (minimal)
- Schema definition maintenance

---

### ADR-006: Monorepo with pnpm Workspaces

**Status**: Accepted
**Date**: 2024-Q1

#### Context
We needed to organize code across:
- Main process (Node.js/Electron)
- Renderer process (Angular)
- Shared contracts (TypeScript/Zod)
- Multiple test suites

#### Decision
Use pnpm workspaces in a monorepo structure.

#### Consequences
**Positive**:

- Shared dependencies reduce duplication
- Atomic changes across packages
- Simplified CI/CD
- Clear package boundaries

**Negative**:

- Initial setup complexity
- Requires understanding of workspace protocols

---

## Related Documentation

| Document | Purpose |
| -------- | ------- |
| [README.md](../README.md) | Project overview and quick start |
| [quickstart.md](../quickstart.md) | Development setup guide |
| [ci-simulation.md](./ci-simulation.md) | Local CI testing |
| [troubleshooting.md](./troubleshooting.md) | Common issues and solutions |

