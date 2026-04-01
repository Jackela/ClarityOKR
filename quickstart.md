# Quick Start Guide

Get up and running with ClarityOKR in 5 minutes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [First Run](#first-run)
- [Development Workflow](#development-workflow)
- [Common Issues](#common-issues)
- [Next Steps](#next-steps)

## Prerequisites

Before starting, ensure you have:

| Requirement | Version                 | Check Command    |
| ----------- | ----------------------- | ---------------- |
| Node.js     | ≥ 20.19.x LTS           | `node --version` |
| pnpm        | 9.x                     | `pnpm --version` |
| Git         | Latest                  | `git --version`  |
| OS          | macOS / Linux / Windows | -                |

### Install Node.js 20

**Using nvm (recommended):**

```bash
nvm install 20
nvm use 20
```

**Using Homebrew (macOS):**

```bash
brew install node@20
```

**Download directly:**
https://nodejs.org/en/download/

### Install pnpm

**Via Corepack (included with Node.js):**

```bash
# Enable Corepack once
corepack enable

# Verify installation
pnpm --version  # Should show 9.x.x
```

**Alternative: Direct install**

```bash
npm install -g pnpm@9
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Jackela/ClarityOKR.git
cd ClarityOKR
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

This will install dependencies for:

- `@clarityokr/contracts` - Shared types and schemas
- `@clarityokr/main` - Electron main process
- `@clarityokr/renderer` - Angular UI
- `@clarityokr/tests-*` - All test packages

### 3. Build the Project

```bash
# Build all packages in the correct order
pnpm run build
```

Build order: contracts → main → renderer

### 4. Verify Installation

```bash
# Run quality checks
pnpm run lint
pnpm run typecheck

# Run unit tests
pnpm run test:unit
```

All checks should pass before proceeding.

## First Run

### Start the Application

```bash
# Launch in development mode
pnpm run dev
```

This command:

1. Starts the Electron main process
2. Serves the Angular renderer
3. Enables hot reload for both processes
4. Opens the Clarification Wizard window

### Configure LLM Access

On first run, the app will prompt for LLM configuration:

1. Enter your API key (stored securely in OS keychain)
2. Set the base URL (e.g., `https://api.openai.com/v1`)
3. Select your model (e.g., `gpt-4`)

Configuration is encrypted and stored locally.

### Test the Clarification Flow

1. Enter a goal like "Improve team productivity"
2. Click "Start Clarification"
3. Answer the AI-generated questions
4. Generate OKRs
5. View them in the sticky window

## Development Workflow

### Daily Development Commands

```bash
# Terminal 1: Start the app
pnpm run dev

# Terminal 2: Run tests in watch mode
pnpm run test:unit --watch

# Terminal 3: Type checking
pnpm run typecheck --watch
```

### Making Changes

**Frontend (Renderer):**

```bash
# Edit files in app/renderer/src/
# Changes are hot-reloaded automatically
```

**Backend (Main Process):**

```bash
# Edit files in app/main/src/
# Electron will restart automatically
```

**Shared Contracts:**

```bash
# Edit files in packages/contracts/src/
# Must rebuild after changes:
pnpm run build:contracts
```

### Running Tests

```bash
# Unit tests
pnpm run test:unit

# Component tests
pnpm run test:component

# Integration tests
pnpm run test:integration

# E2E tests
pnpm run test:e2e

# All tests
pnpm run test
```

### Before Committing

Always run the full quality check:

```bash
# Format, lint, typecheck, and test
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test:unit
```

Or use the CI simulation script:

```bash
# Requires act and Docker
pwsh scripts/act-run-ci.ps1
```

## Common Issues

### Issue: `pnpm: command not found`

**Solution:**

```bash
# Enable Corepack
corepack enable

# Or install pnpm directly
npm install -g pnpm@9
```

### Issue: Build fails with "Cannot find module"

**Solution:**

```bash
# Clean and rebuild
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm run build:contracts
pnpm run build
```

### Issue: Type errors after git pull

**Solution:**

```bash
# Update dependencies
pnpm install

# Rebuild contracts (they may have changed)
pnpm run build:contracts
pnpm run build
```

### Issue: Electron window does not appear

**Solution:**

```bash
# Clear stale session data
rm -rf data/

# Kill any existing Electron processes
pkill -f electron

# Restart
pnpm run dev
```

### Issue: Port already in use

**Solution:**

```bash
# Find process using port 4200 (Angular dev server)
lsof -i :4200
kill -9 <PID>

# Or use a different port
pnpm run dev --port 4201
```

### Issue: E2E tests fail with timeout

**Solution:**

```bash
# Ensure clean state
rm -rf data/

# Run with increased timeout
pnpm run test:e2e --timeout 120000
```

### Issue: SQLite errors on Linux

**Solution:**

```bash
# Install SQLite dependencies (Ubuntu/Debian)
sudo apt-get install libsqlite3-dev

# For other distros, see: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md
```

### Issue: macOS Gatekeeper blocks the app

**Solution:**

```bash
# Remove quarantine attribute
xattr -dr com.apple.quarantine node_modules/electron/dist/Electron.app
```

### Issue: Windows build fails with native modules

**Solution:**

```bash
# Install Windows build tools (PowerShell as Admin)
npm install --global windows-build-tools

# Or use Visual Studio Build Tools
```

## Next Steps

### Explore the Codebase

| Path                                  | Description                    |
| ------------------------------------- | ------------------------------ |
| `app/main/src/bootstrap/`             | IPC channel registration       |
| `app/main/src/clarification/`         | Domain logic, state machine    |
| `app/main/src/services/`              | LLM agent, encryption, storage |
| `app/renderer/src/app/clarification/` | Wizard UI component            |
| `app/renderer/src/app/okr-sticky/`    | Sticky window UI               |
| `packages/contracts/src/`             | Shared Zod schemas             |

### Read the Documentation

- **[README.md](README.md)** - Project overview and architecture
- **[docs/architecture.md](docs/architecture.md)** - Detailed architecture documentation
- **[docs/ci-simulation.md](docs/ci-simulation.md)** - Local CI testing
- **[docs/troubleshooting.md](docs/troubleshooting.md)** - Extended troubleshooting guide

### Join the Community

- Review open tasks in `openspec/changes/`
- Check existing issues and PRs
- Follow the contributing guidelines in [README.md](README.md)

### Development Tips

1. **Use strict TypeScript**: The project enforces `strict: true`. No `any` types without justification.

2. **ESM imports only**: All imports must use `.js` extensions for NodeNext resolution.

3. **Test-first development**: Write failing tests before implementing features.

4. **DDD boundaries**: Respect domain boundaries between clarification, OKR generation, and persistence.

5. **Fail-fast**: Validate at boundaries and handle errors explicitly.

### Environment Variables

Create a `.env` file in `app/main/` for local development:

```bash
# LLM Configuration
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4

# Debug mode
DEBUG=true
LOG_LEVEL=debug
```

### Useful Aliases

Add to your shell profile:

```bash
# ClarityOKR aliases
alias cokr='cd /path/to/ClarityOKR'
alias cokr-dev='pnpm run dev'
alias cokr-test='pnpm run test:unit --watch'
alias cokr-build='pnpm run build'
alias cokr-lint='pnpm run lint && pnpm run typecheck'
alias cokr-clean='rm -rf data/ node_modules/.cache'
```

---

**You're ready to develop!** Start with `pnpm run dev` and explore the clarification flow.
