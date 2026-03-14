# Testing CI Simulation Scripts

This guide walks through testing the act wrapper scripts and validating they work correctly.

## Prerequisites

Before testing, ensure you have:

- [ ] Docker installed and running: `docker --version`
- [ ] act installed: `act --version`
- [ ] PowerShell Core (pwsh): `pwsh --version`
- [ ] Repository cloned and dependencies installed: `pnpm install`

## Phase 1: Dry-Run Testing (No Execution)

Test scripts without actually running workflows.

### Test 1.1: act-run-ci.ps1 Dry-Run

```bash
# Test basic dry-run
pwsh scripts/act-run-ci.ps1 -DryRun

# Expected output:
# - "Dry-run mode: Command that would be executed:"
# - Full act command displayed
# - Exit code 0
```

**Verify:**

- [ ] Command shows: `act push -W .github/workflows/ci.yml -j build-and-test -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-24.04`
- [ ] Script exits with code 0: `echo $LASTEXITCODE` (Windows) or `echo $?` (Linux)
- [ ] No errors printed

### Test 1.2: act-run-ci.ps1 Verbose + Dry-Run

```bash
pwsh scripts/act-run-ci.ps1 -DryRun -Verbose

# Expected output:
# - [VERBOSE] messages showing configuration
# - Event type, job selection, platform
# - Full command
```

**Verify:**

- [ ] See `[VERBOSE] Job Selection: build-and-test`
- [ ] See `[VERBOSE] Event: push`
- [ ] See `[VERBOSE] Full Command: act push ...`

### Test 1.3: act-run-ci.ps1 Job Selection

```bash
# Test different job selections
pwsh scripts/act-run-ci.ps1 -Job build-and-test -DryRun
pwsh scripts/act-run-ci.ps1 -Job e2e -RunE2E -DryRun
pwsh scripts/act-run-ci.ps1 -Job all -DryRun

# Verify each shows correct job in output
```

**Verify:**

- [ ] `build-and-test`: Shows `-j build-and-test` in command
- [ ] `e2e`: Shows `workflow_dispatch` event and `--input run_e2e=true`
- [ ] `all`: No `-j` flag (runs all jobs)

### Test 1.4: act-run-ci.ps1 Lint Skip

```bash
pwsh scripts/act-run-ci.ps1 -SkipLint -DryRun

# Expected output:
# - Command includes: --env ALLOW_LINT=false
```

**Verify:**

- [ ] See `--env ALLOW_LINT=false` in command output

### Test 1.5: act-run-clarify-okr-e2e.ps1 Dry-Run

```bash
pwsh scripts/act-run-clarify-okr-e2e.ps1 -DryRun -Verbose

# Expected output:
# - [VERBOSE] Configuration details
# - Event: workflow_dispatch
# - Inputs: skip_sys_deps=true, skip_e2e=false
```

**Verify:**

- [ ] Shows `act workflow_dispatch -W .github/workflows/ci.yml`
- [ ] Shows `--input skip_e2e=false`
- [ ] Exit code 0

## Phase 2: Docker Image Validation

Test the Docker image checking logic.

### Test 2.1: Missing Image Handling

```bash
# Remove the image if it exists (CAREFUL: This deletes the image)
docker rmi ghcr.io/catthehacker/ubuntu:act-24.04 2>/dev/null || true

# Run script (should prompt to pull)
pwsh scripts/act-run-ci.ps1 -Verbose

# Expected behavior:
# - Detects missing image
# - Prompts: "Pull the image now? This will download ~1.5GB (Y/n)"
# - If you answer 'n', exits with code 1
```

**Verify:**

- [ ] Script detects missing image
- [ ] Prompt appears
- [ ] Choosing 'n' exits with error
- [ ] Exit code is 1: `echo $LASTEXITCODE`

### Test 2.2: Auto-Pull with -Pull Flag

```bash
# Ensure image is missing
docker rmi ghcr.io/catthehacker/ubuntu:act-24.04 2>/dev/null || true

# Run with -Pull flag
pwsh scripts/act-run-ci.ps1 -Pull -SkipValidation -DryRun

# Expected behavior:
# - Pulls image automatically
# - Shows progress
# - Completes successfully
```

**Verify:**

- [ ] Image pull starts automatically
- [ ] No prompt appears
- [ ] Image exists after: `docker images | grep act-24.04`

### Test 2.3: Image Already Exists

```bash
# Ensure image exists
docker pull ghcr.io/catthehacker/ubuntu:act-24.04

# Run script with verbose
pwsh scripts/act-run-ci.ps1 -DryRun -Verbose

# Expected output:
# - [VERBOSE] Docker image found: ghcr.io/catthehacker/ubuntu:act-24.04
# - No pull attempt
```

**Verify:**

- [ ] Script finds existing image
- [ ] No pull prompt or download
- [ ] Proceeds to dry-run

### Test 2.4: Skip Validation Flag

```bash
# Remove image
docker rmi ghcr.io/catthehacker/ubuntu:act-24.04 2>/dev/null || true

# Run with -SkipValidation
pwsh scripts/act-run-ci.ps1 -SkipValidation -DryRun

# Expected behavior:
# - Skips image check entirely
# - Shows dry-run command
# - Exit code 0
```

**Verify:**

- [ ] No image check performed
- [ ] No prompt
- [ ] Dry-run completes successfully

## Phase 3: Actual Execution (Quick Jobs)

Test with real act execution (short-running jobs).

### Test 3.1: Typecheck Only (Fastest)

```bash
# Run just typecheck (modify workflow or use existing)
pwsh scripts/act-run-ci.ps1 -Job build-and-test -SkipLint

# This will actually run act
# Expected duration: 5-10 minutes first run, 2-3 minutes cached
```

**Monitor output for:**

- [ ] Container starts: `[build-and-test/...] 🚀 Start image=...`
- [ ] Steps execute: `[build-and-test/Checkout] ✅ Success`
- [ ] pnpm install runs
- [ ] Typecheck runs: `pnpm run typecheck`
- [ ] Exit code 0 if successful

**If it fails:**

- Scroll up to find the actual error
- Check if it's a script issue or legitimate failure
- Compare with GitHub Actions output

### Test 3.2: Exit Code Propagation

```bash
# Run and capture exit code
pwsh scripts/act-run-ci.ps1 -Job build-and-test -SkipLint
$exitCode = $LASTEXITCODE

# Check exit code
if ($exitCode -eq 0) {
  Write-Host "✅ SUCCESS: Script propagated success exit code" -ForegroundColor Green
} else {
  Write-Host "❌ FAILURE: Expected 0, got $exitCode" -ForegroundColor Red
}
```

**Verify:**

- [ ] `$LASTEXITCODE` is 0 on success
- [ ] `$LASTEXITCODE` is non-zero on failure

### Test 3.3: Verbose Output During Execution

```bash
pwsh scripts/act-run-ci.ps1 -Job build-and-test -SkipLint -Verbose

# Should show:
# - [VERBOSE] messages before execution
# - Full act output during run
# - Success/failure message after
```

**Verify:**

- [ ] Verbose logs appear before act runs
- [ ] Act output is not suppressed
- [ ] Final status message appears

## Phase 4: Compare with GitHub Actions

Validate that local results match remote CI.

### Test 4.1: Create Test Branch

```bash
# Create a test branch
git checkout -b test/ci-scripts-validation

# Make a trivial change
echo "# Test" >> test-file.md
git add test-file.md
git commit -m "test: validate CI scripts match remote"
```

### Test 4.2: Run Local Validation

```bash
# Run full local validation (without E2E for speed)
pwsh scripts/act-run-ci.ps1 -Job build-and-test > local-ci-output.log 2>&1

# Check exit code
echo "Local exit code: $LASTEXITCODE"

# Save exit code
$localExit = $LASTEXITCODE
```

### Test 4.3: Push and Compare with GitHub

```bash
# Push to trigger GitHub Actions
git push -u origin test/ci-scripts-validation

# Wait for GitHub Actions to complete
# Then download logs or compare in browser
```

**Compare these aspects:**

1. **Exit Code:**
   - [ ] Local exit code matches remote (0 = success, non-zero = failure)

2. **Build Output:**
   - [ ] Same TypeScript compilation output
   - [ ] Same test pass/fail counts
   - [ ] Similar timing (allow for variance)

3. **Dependency Installation:**
   - [ ] Same pnpm install output (package count)
   - [ ] Same resolved versions (check pnpm-lock.yaml)

4. **Known Differences (Expected):**
   - [ ] Lint skipped locally (unless you used `--env ALLOW_LINT=true`)
   - [ ] Timing differences (local may be slower/faster)
   - [ ] Log formatting (GitHub has prettier logs)

### Test 4.4: Divergence Investigation

If local and remote differ:

```bash
# Compare step-by-step

# 1. Check Node version
# Local:
docker run --rm ghcr.io/catthehacker/ubuntu:act-24.04 node --version
# Remote: Look at GitHub Actions "Setup Node.js" step

# 2. Check pnpm version
# Local (from act output)
# Remote (from GitHub Actions logs)

# 3. Check environment variables
# Local: Look for --env flags in dry-run output
# Remote: Look at workflow env section

# 4. Check for timing issues
# If tests pass locally but timeout remotely, increase timeouts
```

**Document findings:**

- Add to `docs/ci-simulation.md` under "Known Divergence"
- Update scripts if configuration mismatch found

## Phase 5: PowerShell Compatibility

Test across different PowerShell versions.

### Test 5.1: Windows PowerShell 5.1

```powershell
# Windows only
powershell -NoProfile -Command "& 'scripts/act-run-ci.ps1' -DryRun -Verbose"

# Check for errors
$LASTEXITCODE
```

**Verify:**

- [ ] Script runs without syntax errors
- [ ] Output matches pwsh version
- [ ] Exit code 0

### Test 5.2: PowerShell Core 7+ (Windows)

```bash
pwsh -NoProfile -Command "& 'scripts/act-run-ci.ps1' -DryRun -Verbose"
```

**Verify:**

- [ ] Same behavior as PS 5.1
- [ ] No warnings about compatibility

### Test 5.3: PowerShell Core (Linux/macOS)

```bash
# Linux or macOS
pwsh scripts/act-run-ci.ps1 -DryRun -Verbose

# Check path handling
# Windows uses backslashes, Linux uses forward slashes
```

**Verify:**

- [ ] Script runs without errors
- [ ] Paths are handled correctly
- [ ] Docker commands work

## Phase 6: Documentation Accuracy

Validate the documentation matches reality.

### Test 6.1: Quick Start Commands

Follow docs/ci-simulation.md "Quick Start" section exactly:

```bash
# From docs/ci-simulation.md
act -j build-and-test -W .github/workflows/ci.yml
```

**Verify:**

- [ ] Command works as documented
- [ ] Timing estimate is accurate
- [ ] Output matches description

```bash
# From docs/ci-simulation.md
pwsh scripts/act-run-clarify-okr-e2e.ps1
```

**Verify:**

- [ ] Command works
- [ ] Runs E2E tests as stated

### Test 6.2: Troubleshooting Scenarios

Test each troubleshooting scenario in docs/ci-simulation.md:

**Scenario 1: Docker Not Running**

```bash
# Stop Docker Desktop
# Run: pwsh scripts/act-run-ci.ps1

# Expected: Error about Docker daemon
```

- [ ] Error matches documentation
- [ ] Solution is accurate

**Scenario 2: Electron Sandbox Error**

Check if .actrc flags prevent this error:

```bash
# Run E2E tests
# Check for sandbox errors in output
```

- [ ] No SUID sandbox errors appear
- [ ] If they do, documentation solution works

### Test 6.3: Workflow Mapping Table

Verify the table in docs/ci-simulation.md is accurate:

| Workflow                | Test Command                           | Expected Result |
| ----------------------- | -------------------------------------- | --------------- |
| ci.yml (build-and-test) | `pwsh scripts/act-run-ci.ps1`          | ✅ Works        |
| ci.yml (e2e)            | `pwsh scripts/act-run-ci.ps1 -Job e2e` | ✅ Works        |

- [ ] All commands execute as documented
- [ ] Limitations are accurate

## Phase 7: Edge Cases

Test unusual scenarios.

### Test 7.1: Concurrent Runs

```bash
# Start first run
pwsh scripts/act-run-ci.ps1 -Job build-and-test &

# Start second run (different terminal)
pwsh scripts/act-run-ci.ps1 -Job build-and-test &

# Check for conflicts
```

**Expected:**

- Each run gets a separate container
- No file conflicts
- Both can complete

### Test 7.2: Interrupted Run

```bash
# Start run
pwsh scripts/act-run-ci.ps1 -Job build-and-test

# Press Ctrl+C after 30 seconds

# Check exit code
echo $LASTEXITCODE
```

**Verify:**

- [ ] Script exits cleanly
- [ ] Exit code is non-zero
- [ ] No zombie containers: `docker ps -a`

### Test 7.3: Very Long Output

```bash
# Run verbose command with lots of output
pwsh scripts/act-run-ci.ps1 -Verbose > output.log 2>&1

# Check log file
cat output.log | wc -l
```

**Verify:**

- [ ] All output captured
- [ ] No buffer overflow errors
- [ ] File is readable

## Reporting Issues

When you find bugs or inaccuracies:

1. **Document the issue:**

   ```markdown
   ## Issue: [Brief description]

   **Steps to reproduce:**

   1. ...

   **Expected behavior:**
   ...

   **Actual behavior:**
   ...

   **Environment:**

   - OS: Windows 11 / Ubuntu 22.04 / macOS 13
   - PowerShell: 7.4.0
   - Docker: 24.0.6
   - act: 0.2.52
   ```

2. **Fix the issue:**
   - Update script
   - Update documentation
   - Add test case to this file

3. **Commit with reference:**

   ```bash
   git add scripts/ docs/
   git commit -m "fix: [description]

   Fixes issue found during testing (see docs/testing-ci-scripts.md)

   - [what was wrong]
   - [how it's fixed]
   - [test added]"
   ```

## Success Criteria

All tests pass when:

- ✅ All dry-run tests show expected output
- ✅ Docker image validation works (detect, prompt, pull)
- ✅ Exit codes propagate correctly
- ✅ Local validation runs successfully (even if different from remote)
- ✅ PowerShell compatibility confirmed across versions
- ✅ Documentation matches actual behavior
- ✅ Known divergence from GitHub Actions is documented

## Next Steps After Testing

1. **Update documentation** with any new findings
2. **Fix bugs** discovered during testing
3. **Add integration tests** if patterns emerge
4. **Share results** with team for validation
5. **Monitor GitHub Actions** to ensure local predictions are useful
