# ClarityOKR

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](./package.json)
[![CI](https://github.com/Jackela/ClarityOKR/actions/workflows/ci.yml/badge.svg)](https://github.com/Jackela/ClarityOKR/actions/workflows/ci.yml)
[![Clarify OKR CI](https://github.com/Jackela/ClarityOKR/actions/workflows/clarify-okr.yml/badge.svg)](https://github.com/Jackela/ClarityOKR/actions/workflows/clarify-okr.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Angular](https://img.shields.io/badge/Angular-17-red)](https://angular.io/)
[![Electron](https://img.shields.io/badge/Electron-30-47848F)](https://www.electronjs.org/)

ClarityOKR is a desktop AI assistant that turns fuzzy intent into actionable Objectives and Key Results (OKRs).  
The app runs on an Electron + Angular stack written in strict TypeScript (ESM-only) and follows SOLID, Domain-Driven Design, and Fail-Fast principles across the main process, renderer, and shared contracts.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Project Layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Quality Gates & Scripts](#quality-gates--scripts)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

### US1: Clarification Flow

Guided Q&A that converts vague statements (e.g. "提高效率") into structured intent using mutually exclusive button choices.

- **Intent Input**: Enter your goal in natural language
- **Smart Prompting**: AI generates 2-5 clarifying questions
- **Option Selection**: Choose from mutually exclusive answers
- **Progress Tracking**: Visual progress through the clarification journey
- **Readiness Detection**: Automatic detection when enough context is gathered

### US2: Sticky OKR Window

A lightweight always-on-top window that visualizes generated OKRs in list/tree form.

- **Always-On-Top**: Sticky window stays visible above all other windows
- **Tree/List View**: Toggle between hierarchical and flat views
- **Window Controls**: Drag to reposition, close without losing data
- **Auto-Reopen**: Remembers your last OKR for quick access
- **Workspace Aware**: Visible across all virtual desktops

### US3: Edit, Regenerate & Copy

Full control over your generated OKRs with manual editing, regeneration, and clipboard export.

- **Inline Editing**: Click any objective or key result to edit directly
- **Regenerate**: Request fresh AI suggestions while keeping your context
- **Copy to Clipboard**: One-click export for sharing
- **Partial Regeneration**: Regenerate specific objectives while keeping others
- **Undo/Redo**: Track changes with full history

### Security & Performance

- **Encrypted Storage**: API keys stored in OS keychain with AES-256-GCM encryption
- **Secure IPC**: Type-safe channels with context isolation
- **LLM Caching**: LRU cache reduces API calls and improves response time
- **Circuit Breaker**: Automatic fallback when LLM service is unavailable
- **SQLite Persistence**: Fast, reliable local storage with migration support

## Screenshots

> **Note**: Screenshots will be added in a future update. Below are placeholders for the key views.

### Clarification Wizard

```
┌─────────────────────────────────────────┐
│  ClarityOKR                             │
│                                         │
│  What would you like to achieve?        │
│  ┌─────────────────────────────────┐    │
│  │ 提高效率                          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Start Clarification]                  │
└─────────────────────────────────────────┘
```

### Sticky OKR Window

```
┌─────────────────────┐
│ My OKRs         [_] │
├─────────────────────┤
│ Objective 1         │
│   KR 1.1            │
│   KR 1.2            │
│ Objective 2         │
│   KR 2.1            │
└─────────────────────┘
```

## Project Layout

```
app/
  main/        # Electron main process (ES modules, NodeNext)
    bootstrap/       # IPC channel registration, preload scripts
    clarification/   # Domain module (handlers, state machine)
    core/            # Logger, base services
    persistence/     # SQLite repositories, database service
    services/        # Business services (LLM, encryption, storage)
    windows/         # Window management (clarification, sticky)
  renderer/    # Angular renderer application
    clarification/   # Wizard component with state machine service
    okr-sticky/      # Sticky note always-on-top window
    shared/          # Reusable components (button, card, input)
packages/
  contracts/   # Shared Zod schemas & TypeScript interfaces
tests/
  unit/        # Jest unit tests (Node + mocks)
  integration/ # Jest integration tests (SQLite :memory:)
  e2e/         # Playwright Electron E2E tests
  performance/ # Benchmarks
openspec/            # OpenSpec change tracking
specs/               # Feature specifications (Speckit)
data/                # Runtime storage (sessions, OKR snapshots, logs)
```

## Prerequisites

- Node.js ≥ 20.19.x (LTS recommended) - see `.nvmrc` for exact version
- pnpm 9 (managed via Corepack)
- macOS, Linux, or Windows with a working Electron runtime

```bash
# Enable Corepack once
corepack enable

# (Optional) pin the workspace version explicitly
corepack prepare pnpm@9.0.0 --activate

# Verify versions
node --version  # Should be v20.x.x
pnpm --version  # Should be 9.x.x
```

> **Fail-fast tip:** Delete the `data/` folder between manual E2E runs to avoid stale session collisions that can block OKR generation.

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Jackela/ClarityOKR.git
cd ClarityOKR

# 2. Enable Corepack for pnpm
corepack enable

# 3. Install dependencies
pnpm install

# 4. Build all packages (contracts → main → renderer)
pnpm run build

# 5. Run quality checks
pnpm run lint
pnpm run typecheck
```

## Getting Started

```bash
# Launch the desktop app in development mode
pnpm run dev

# Or run specific packages
pnpm run build:contracts   # Build shared contracts
pnpm run build:main        # Build main process
pnpm run build:renderer    # Build renderer

# The app will open in development mode with hot reload
```

The workspace uses strict TypeScript (`strict: true`) and ESM imports everywhere. Keep new code compliant.

## Development Workflow

### Daily Development

```bash
# Start development server
pnpm run dev

# In another terminal - run tests in watch mode
pnpm run test:unit --watch

# Before committing - full quality check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
```

### Creating a New Feature

1. Review open tasks in `openspec/changes/`
2. Write failing tests first (unit/component/E2E)
3. Implement code using strict TypeScript and DDD boundaries
4. Update documentation (README, quickstart, specs)
5. Run quality gates before opening a PR

### Environment Configuration

Create a `.env` file in `app/main/` for LLM configuration:

```bash
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
```

API keys are automatically encrypted and stored in the OS keychain on first run.

## Architecture Overview

### Technology Stack

| Layer             | Technology     | Purpose                                |
| ----------------- | -------------- | -------------------------------------- |
| Desktop Framework | Electron 30    | Cross-platform main + renderer process |
| UI Framework      | Angular 17     | Standalone components with Signals     |
| Language          | TypeScript 5.4 | Strict mode, ESM-only                  |
| Package Manager   | pnpm 9         | Workspace monorepo                     |
| Runtime           | Node.js 20.x   | LTS with native ESM support            |

### State Management

| Layer        | Technology                       | Responsibility                   |
| ------------ | -------------------------------- | -------------------------------- |
| Renderer     | Angular Signals + ComponentStore | UI state, form handling          |
| Main Process | State Machine                    | Domain logic, session management |
| Persistence  | SQLite                           | Data durability, queries         |

### Key Architectural Patterns

1. **Domain-Driven Design**: Clear boundaries between Clarification, OKR Generation, Sticky Window, and Persistence domains
2. **Type-Safe IPC**: Zod schemas validate all IPC messages between main and renderer
3. **Fail-Fast Philosophy**: Defensive validation at boundaries with explicit error handling
4. **Repository Pattern**: Data access abstracted through repository interfaces

### IPC Communication

| Channel                 | Pattern             | Purpose                     |
| ----------------------- | ------------------- | --------------------------- |
| `CLARIFICATION_PROMPT`  | RPC (invoke/handle) | Initial/next questions      |
| `CLARIFICATION_RESPOND` | Fire-and-forget     | User selections             |
| `OKR_GENERATE`          | RPC                 | Final OKR document creation |
| `OKR_REGENERATE`        | RPC                 | Regenerate existing OKR     |
| `STICKY_WINDOW_OPEN`    | Fire-and-forget     | Open sticky window          |

## Quality Gates & Scripts

| Command                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `pnpm run lint`             | ESLint across all packages             |
| `pnpm run lint:fix`         | Auto-fix ESLint issues                 |
| `pnpm run typecheck`        | TypeScript validation for all packages |
| `pnpm run format`           | Check Prettier formatting              |
| `pnpm run format:write`     | Auto-format code                       |
| `pnpm run build`            | Full build sequence                    |
| `pnpm run dev`              | Start development mode                 |
| `pnpm run test`             | Run all tests                          |
| `pnpm run test:unit`        | Unit tests (Jest)                      |
| `pnpm run test:component`   | Angular component tests                |
| `pnpm run test:integration` | Integration tests (SQLite)             |
| `pnpm run test:e2e`         | Playwright E2E suite                   |

### CI and Local Runners

GitHub Actions workflows run on Node 20 + pnpm with Lint → Typecheck → Build → Tests. E2E tests run with Playwright + Xvfb for headless Electron testing.

**Run CI locally using `act`:**

```bash
# Quick validation (lint + typecheck + build + unit/component/integration tests)
pwsh scripts/act-run-ci.ps1

# Full validation including E2E
pwsh scripts/act-run-ci.ps1 -Job all
```

For complete setup instructions, see **[docs/ci-simulation.md](docs/ci-simulation.md)**.

### E2E Testing

E2E tests start a local HTTP server mocking LLM API endpoints. No external network calls are made. Tests are deterministic and self-contained.

Follow TDD/BDD loop: author specs before implementation, especially for sticky window functionality, edit mode flows, regenerate/copy actions, and telemetry.

## Troubleshooting

### Common Issues

| Issue                                    | Solution                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **pnpm not found**                       | Run `corepack enable` or install manually: `npm install -g pnpm@9`                               |
| **Build fails with module errors**       | Run `pnpm run build:contracts` first, then `pnpm run build`                                      |
| **Electron window never appears in E2E** | Delete `data/*.json` and rerun tests; tests expect clean session store                           |
| **Type errors after git pull**           | Run `pnpm install` to update dependencies, then `pnpm run build`                                 |
| **GPU errors on headless Linux**         | Hardware acceleration is disabled by default; if re-enabled, ensure Mesa libraries are installed |
| **Stale session data**                   | Delete the `data/` folder to reset all local storage                                             |
| **Port already in use**                  | Kill any existing Electron processes or change the port in config                                |

### Debug Mode

```bash
# Enable verbose logging
DEBUG=true pnpm run dev

# Run with DevTools open
pnpm run dev --devtools

# Inspect main process
pnpm run dev --inspect
```

## Contributing

We welcome contributions! Please follow these guidelines:

### Development Process

1. **Review Tasks**: Check `openspec/changes/` for open tasks or propose new features via issues
2. **Write Tests First**: Follow TDD/BDD approach with failing tests before implementation
3. **Follow Code Standards**:
   - Use ESM imports (no CommonJS modules)
   - Maintain strict TypeScript (`strict: true`)
   - Add JSDoc to all public APIs
   - Follow SOLID and Domain-Driven Design principles
4. **Quality Gates**: Run `pnpm run lint`, `pnpm run typecheck`, and full test suite before submitting
5. **Documentation**: Update README, quickstart, and relevant specs with your changes

### Commit Conventions

We follow Conventional Commits:

```
type(scope): description

feat(clarification): add new prompt handler
fix(sticky): resolve window positioning bug
docs(readme): update installation steps
test(e2e): add sticky window regression tests
```

### Code Review

- All changes require PR review before merging
- CI must pass (lint, typecheck, tests)
- Ensure new code follows architecture patterns
- Keep commits focused and small

### Questions?

- Check **[quickstart.md](quickstart.md)** for detailed setup instructions
- Review **[docs/troubleshooting.md](docs/troubleshooting.md)** for common issues
- Open an issue for bug reports or feature requests

Staying disciplined with these practices keeps ClarityOKR reliable and friendly to both end users and LLM-based collaborators.
