# Testing Guide

## Quick Start

### For WSL/Windows Users (Recommended)

**Daily Development Workflow:**
```bash
# Run fast local tests (completes in seconds)
pnpm run test:local
```

**Before Committing:**
```bash
# Quick CI validation via Docker (~2 minutes)
pnpm run ci:quick
```

**Before Creating PR/Pushing:**
```bash
# Full validation with all tests (~9 minutes)
pnpm run ci:full
```

---

## Why Docker for Component/E2E Tests?

**Problem:**
- WSL accessing Windows NTFS filesystem (`/mnt/d`) has severe I/O performance issues
- Angular component tests generate 600MB+ of small cache files
- This triggers the v9fs protocol bottleneck, causing tests to hang indefinitely

**Solution:**
- Use Docker-based CI workflows via `act`
- Docker uses native Linux filesystem (no cross-OS overhead)
- Matches GitHub Actions environment exactly (same Node, pnpm, Ubuntu version)

---

## Available Test Commands

### Local Tests (Fast, WSL-friendly)
```bash
# Unit tests only (Vitest)
pnpm run test:unit

# Integration tests only
pnpm run test:integration

# Both unit + integration (recommended for daily dev)
pnpm run test:local
```

### Docker CI Tests (Recommended for full validation)
```bash
# Quick: typecheck + build + unit + integration (~2 min)
pnpm run ci:quick

# Full: includes component + E2E tests (~9 min)
pnpm run ci:full
```

### Direct Tests (May hang on WSL+NTFS)
```bash
# Angular component tests via Karma
pnpm run test:component  # ⚠️ Will hang on WSL

# Playwright E2E tests
pnpm run test:e2e

# Run all tests sequentially
pnpm run test  # ⚠️ Will hang on WSL
```

---

## First-Time Setup

### Prerequisites
1. **Docker**: Required for `ci:quick` and `ci:full` commands
   - macOS/Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop)
   - Linux: [Docker Engine](https://docs.docker.com/engine/install/)

2. **act CLI**: GitHub Actions runner for local simulation
   ```bash
   # macOS
   brew install act

   # Linux
   curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

   # Windows (Chocolatey)
   choco install act-cli
   ```

3. **Pull Docker Image** (first-time only, ~1.5GB):
   ```bash
   docker pull ghcr.io/catthehacker/ubuntu:act-24.04
   ```

---

## Troubleshooting

### "Docker image not found"
```bash
# Pull the image manually
docker pull ghcr.io/catthehacker/ubuntu:act-24.04
```

### "act: command not found"
```bash
# Install act (see Prerequisites above)
brew install act  # macOS
```

### "Tests still hanging"
If using WSL, ensure you're using Docker commands (`ci:quick` or `ci:full`), not direct test commands.

### "Docker daemon not running"
```bash
# Check Docker status
docker ps

# Start Docker Desktop (Windows/macOS) or Docker service (Linux)
sudo systemctl start docker  # Linux
```

---

## Performance Comparison

| Environment | Component Tests | E2E Tests |
|-------------|----------------|-----------|
| **WSL + NTFS** | ❌ Hangs after 5+ min | ❌ May hang |
| **Docker (native fs)** | ✅ Passes in ~1 min | ✅ Passes in ~3 min |
| **Linux native** | ✅ Fast | ✅ Fast |

---

## Advanced Usage

### Run specific test suites in Docker
```bash
# Just component tests
act -j build-and-test -W .github/workflows/ci.yml --env RUN_COMPONENT_TESTS=true

# With verbose output
pnpm run ci:full -- -v
```

### Skip expensive operations
```bash
# Skip system dependency installation (faster, but may fail)
act workflow_dispatch -W .github/workflows/clarify-okr.yml --input skip_sys_deps=true
```

### Debug failed tests
```bash
# Run with verbose logging
act -j build-and-test -W .github/workflows/ci.yml -v
```

---

## CI/CD Integration

### Local Validation Before Push
```bash
# Recommended workflow
pnpm run typecheck      # Check types
pnpm run lint           # Check code style
pnpm run build          # Verify build
pnpm run test:local     # Fast tests
pnpm run ci:quick       # Full CI simulation
```

### Pre-PR Checklist
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds
- [ ] `pnpm run test:local` passes
- [ ] `pnpm run ci:full` passes (includes component + E2E)

---

## References

- **Full CI Setup**: [docs/ci-simulation.md](docs/ci-simulation.md)
- **PowerShell Scripts**: `scripts/act-run-ci.ps1`, `scripts/act-run-clarify-okr-e2e.ps1`
- **GitHub Actions Workflows**: `.github/workflows/ci.yml`, `.github/workflows/clarify-okr.yml`
