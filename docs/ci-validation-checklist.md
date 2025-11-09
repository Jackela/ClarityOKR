# Pre-Push CI Validation Checklist

This checklist helps you validate changes locally before pushing to GitHub, catching failures early and reducing CI iteration cycles.

## Why Validate Locally?

- **Faster feedback**: Get results in minutes instead of waiting for GitHub Actions queue
- **Reduce CI costs**: Fewer failed runs = fewer GitHub Actions minutes consumed
- **Better debugging**: Access to container shell, verbose logs, and local file system
- **Offline development**: Work without network access to GitHub

## Quick Decision Tree

```
What did you change?
│
├─ Documentation only (.md files)
│  └─> No validation needed (or just run markdownlint)
│
├─ TypeScript code only
│  └─> Standard Validation (lint + typecheck + build + unit tests)
│
├─ Angular components/services
│  └─> Standard Validation + Component Tests
│
├─ E2E test files or Electron main process
│  └─> Full Validation (including E2E)
│
└─ CI workflow files (.github/workflows/*.yml)
   └─> Full Validation + manual GitHub Actions trigger
```

## Validation Levels

### Level 1: Quick Validation (~2-5 minutes)

**When to use**: TypeScript changes, quick iterations, refactoring

**Checklist:**

- [ ] Run lint: `pnpm run lint`
- [ ] Run typecheck: `pnpm run typecheck`

**Local act command:**

```bash
# Run with lint skip for speed
act -j build-and-test -W .github/workflows/ci.yml \
  --env ALLOW_LINT=false
```

### Level 2: Standard Validation (~5-10 minutes)

**When to use**: Most code changes, new features, bug fixes

**Checklist:**

- [ ] Run lint: `pnpm run lint`
- [ ] Run typecheck: `pnpm run typecheck`
- [ ] Run build: `pnpm run build`
- [ ] Run unit tests: `pnpm run test:unit`
- [ ] Run integration tests: `pnpm run test:integration`

**Local act command:**

```bash
# Run full build-and-test job
act -j build-and-test -W .github/workflows/ci.yml
```

**PowerShell wrapper:**

```powershell
pwsh scripts/act-run-ci.ps1 -Job build-and-test
```

### Level 3: Full Validation (~15-20 minutes)

**When to use**: E2E changes, Electron main process changes, pre-release validation

**Checklist:**

- [ ] Run lint: `pnpm run lint`
- [ ] Run typecheck: `pnpm run typecheck`
- [ ] Run build: `pnpm run build`
- [ ] Run unit tests: `pnpm run test:unit`
- [ ] Run integration tests: `pnpm run test:integration`
- [ ] Run component tests: `pnpm run test:component`
- [ ] Run E2E tests: `pnpm run test:e2e`
- [ ] Clean `data/` directory before E2E: `rm -rf data/*.json`

**Local act command:**

```bash
# Run Clarify OKR workflow with E2E
pwsh scripts/act-run-clarify-okr-e2e.ps1
```

**PowerShell wrapper:**

```powershell
# Run all jobs
pwsh scripts/act-run-ci.ps1 -Job all -RunE2E
```

## Interpreting act Output

### Success Indicators

```
[Lint/Lint] ✅  Success - Main Run pnpm run lint
[Typecheck/Typecheck] ✅  Success - Main Run pnpm run typecheck
[Build/Build] ✅  Success - Main Run pnpm run build
[Unit tests/Unit tests] ✅  Success - Main Run pnpm run test:unit
```

**Exit code**: `0`

### Failure Indicators

```
[Lint/Lint] ❌  Failure - Main Run pnpm run lint
Error: Process completed with exit code 1
```

**Exit code**: `1` (or other non-zero)

**Next steps:**

1. Scroll up to find the actual error message
2. Fix the issue locally
3. Re-run validation
4. If error persists, see [Troubleshooting](#troubleshooting)

### Common Output Patterns

**Skipped lint (expected in act):**

```
[Lint/Lint] ⚠️  Skipped - if: ${{ github.actor != 'nektos/act' || env.ALLOW_LINT == 'true' }}
```

This is normal. To force lint, add `--env ALLOW_LINT=true`.

**Long-running steps:**

```
[Install dependencies/Install dependencies] 🚀  Running Main Install dependencies
```

These can take 2-5 minutes on first run (downloading packages). Subsequent runs are faster.

## When to Skip Local Validation

You can safely skip local validation for:

- **Documentation-only changes**: `.md` files, comments, README updates
- **Gitignore updates**: `.gitignore`, `.actrc`, `.nvmrc`
- **Dependency updates** (non-breaking): `pnpm-lock.yaml` only
- **GitHub Actions metadata**: Workflow names, badge URLs, schedule

**Note:** Even for these changes, running `pnpm run lint && pnpm run typecheck` is quick and recommended.

## Troubleshooting

### act Command Fails Immediately

**Symptom**: `act` exits with error before running any jobs

**Common causes:**

1. **Docker not running**: Start Docker Desktop/Engine
2. **Image not found**: Pull image with `pwsh scripts/act-run-clarify-okr-e2e.ps1 -Pull`
3. **Invalid workflow**: Check YAML syntax with `act -W .github/workflows/ci.yml --dryrun`

**Solution**: See [CI Simulation Guide - Troubleshooting](./ci-simulation.md#troubleshooting)

### Tests Pass Locally but Fail on GitHub

**Possible causes:**

1. **Environment differences**: Different Node version, OS, or system dependencies
2. **Timing issues**: Race conditions that don't reproduce locally
3. **Data pollution**: E2E tests need clean `data/` directory

**Solution:**

1. Check Node version matches: `.nvmrc` specifies `20.x`
2. Delete `data/` directory before E2E: `rm -rf data/*.json`
3. Compare GitHub Actions logs with local output line-by-line
4. Run with verbose flags: `pwsh scripts/act-run-ci.ps1 -Verbose`

### Tests Fail Locally but Pass on GitHub

**Possible causes:**

1. **Outdated dependencies**: `node_modules` out of sync with `pnpm-lock.yaml`
2. **Stale build artifacts**: Old `dist/` or `.angular/` files
3. **Docker image outdated**: Old runner image with different tools

**Solution:**

1. Clean install: `rm -rf node_modules && pnpm install`
2. Clean build: `rm -rf dist .angular && pnpm run build`
3. Pull latest image: `docker pull ghcr.io/catthehacker/ubuntu:act-24.04`

## Validation Workflow Example

**Scenario**: You've added a new feature with TypeScript code and unit tests.

1. **Run standard validation locally:**

   ```bash
   pwsh scripts/act-run-ci.ps1 -Job build-and-test
   ```

2. **Check exit code:**

   ```bash
   echo $?  # PowerShell: $LASTEXITCODE
   ```

3. **If successful (`0`):**

   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push
   ```

4. **If failed (non-zero):**

   - Review act output for errors
   - Fix issues
   - Re-run validation
   - Commit only after validation passes

5. **Monitor GitHub Actions:**

   - Check workflow run on GitHub
   - If failed despite local success, investigate environment differences
   - If passed, you're good to go!

## Best Practices

- [ ] **Always run typecheck**: Fastest way to catch type errors
- [ ] **Run full validation before PR**: Ensure all tests pass
- [ ] **Clean data directory for E2E**: Avoid stale session collisions
- [ ] **Use dry-run for debugging**: Inspect commands before execution
- [ ] **Pull images regularly**: Keep Docker images up-to-date
- [ ] **Compare with GitHub logs**: Verify local behavior matches CI

## Further Reading

- [Local CI Simulation Guide](./ci-simulation.md) - Complete act setup and troubleshooting
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development principles and guidelines
- [GitHub Actions Workflows](../.github/workflows/) - Actual CI configuration
