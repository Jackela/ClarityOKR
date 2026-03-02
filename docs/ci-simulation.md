# Local CI Simulation with act

This guide explains how to run GitHub Actions workflows locally using [nektos/act](https://github.com/nektos/act), enabling you to validate changes before pushing and catch failures early.

## Prerequisites

### 1. Docker

`act` runs workflows inside Docker containers, so you need Docker installed and running:

- **macOS/Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Linux**: [Docker Engine](https://docs.docker.com/engine/install/)

Verify installation:

```bash
docker --version
# Expected: Docker version 20.x or higher
```

### 2. act CLI

Install `act` using one of these methods:

**macOS (Homebrew):**

```bash
brew install act
```

**Linux:**

```bash
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

**Windows (Chocolatey):**

```bash
choco install act-cli
```

**Manual Install:** See [act releases](https://github.com/nektos/act/releases)

Verify installation:

```bash
act --version
# Expected: act version 0.2.x or higher
```

### 3. Runner Image

ClarityOKR uses the Ubuntu 24.04 runner image for consistency with GitHub Actions:

```bash
docker pull ghcr.io/catthehacker/ubuntu:act-24.04
```

This image is ~1.5GB and includes Node.js, build tools, and common dependencies.

## Quick Start

### Run Lint + Typecheck + Build + Unit Tests

```bash
act -j build-and-test -W .github/workflows/ci.yml
```

This runs the main quality gates without E2E tests (~5-10 minutes).

### Run Full Clarify OKR Workflow with E2E

```bash
pwsh scripts/act-run-clarify-okr-e2e.ps1
```

This runs lint, typecheck, build, unit, component, and E2E tests (~15-20 minutes).

### Run Specific Job Only

```bash
# Just the build-and-test job from ci.yml
act -j build-and-test -W .github/workflows/ci.yml

# Just the E2E job (requires build-and-test to succeed first)
act -j e2e -W .github/workflows/ci.yml --input run_e2e=true
```

## Workflow Mapping

| Workflow                  | Local Support | Command                                             | Limitations                                  |
| ------------------------- | ------------- | --------------------------------------------------- | -------------------------------------------- |
| `ci.yml` (build-and-test) | ✅ Full       | `act -j build-and-test -W .github/workflows/ci.yml` | Lint skipped by default (slow in containers) |
| `ci.yml` (E2E)            | ✅ Full       | `act -j e2e -W .github/workflows/ci.yml`            | Requires Xvfb, system deps                   |

**GitHub-Only Features (Not Available Locally):**

- Artifact uploads (`actions/upload-artifact`) - artifacts aren't persisted
- Pull request comments/checks - no GitHub API integration
- Deployment workflows - require GitHub secrets and infrastructure
- Cache sharing across runs - each `act` run starts fresh

## Configuration Deep Dive

### .actrc File

The `.actrc` file configures default settings for all `act` commands:

```bash
# Use Ubuntu 24.04 image (matches GitHub's ubuntu-latest)
-P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-24.04
-P ubuntu-24.04=ghcr.io/catthehacker/ubuntu:act-24.04

# Electron flags to avoid SUID sandbox failures in containers
--env ELECTRON_EXTRA_LAUNCH_ARGS=--no-sandbox --disable-setuid-sandbox
```

**Platform Mapping (`-P`)**: Maps workflow `runs-on` to Docker images
**Environment Variables (`--env`)**: Sets env vars for all jobs

### Workflow-Specific Environment Variables

Workflows set additional env vars for local execution:

**`ci.yml`:**

- `CI=true` - Signals CI environment (affects test reporters, logging)
- `NODE_VERSION=20.x` - Node.js version for consistency
- `PNPM_VERSION=9` - pnpm version lock

**E2E Tests:**

- `ELECTRON_PATH=./node_modules/.bin/electron` - Path to Electron binary
- `ELECTRON_DISABLE_SANDBOX=true` - Disable sandbox for containers
- `ELECTRON_ENABLE_LOGGING=true` - Enable Electron debug logs

### Conditional Logic for act

Workflows detect `act` using `github.actor == 'nektos/act'`:

```yaml
# Skip lint in act by default (slow in containers)
- name: Lint
  run: pnpm run lint
  if: ${{ github.actor != 'nektos/act' || env.ALLOW_LINT == 'true' }}
```

To force lint to run locally:

```bash
act -j build-and-test -W .github/workflows/ci.yml --env ALLOW_LINT=true
```

## Troubleshooting

### 1. Docker Image Not Found

**Error:**

```
Error: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution:**

- Ensure Docker Desktop/Engine is running
- Check Docker status: `docker ps`
- On Linux, add user to docker group: `sudo usermod -aG docker $USER && newgrp docker`

### 2. Electron SUID Sandbox Error

**Error:**

```
[ERROR] The SUID sandbox helper binary was found, but is not configured correctly
```

**Solution:**

This is already handled by `.actrc` Electron flags. If you still see errors:

1. Verify `.actrc` exists in repository root
2. Check flags are applied: `act -j e2e -W .github/workflows/ci.yml --dryrun` (look for `ELECTRON_EXTRA_LAUNCH_ARGS`)
3. Manually add flags: `act --env ELECTRON_EXTRA_LAUNCH_ARGS="--no-sandbox --disable-setuid-sandbox"`

### 3. Xvfb Not Available

**Error:**

```
Error: xvfb-run: command not found
```

**Solution:**

The workflow installs Xvfb automatically:

```yaml
- name: Ensure Xvfb is available
  run: |
    if ! command -v xvfb-run >/dev/null 2>&1; then
      sudo apt-get update
      sudo apt-get install -y xvfb
    fi
```

If this fails, the Docker image may be outdated. Pull the latest:

```bash
docker pull ghcr.io/catthehacker/ubuntu:act-24.04 --no-cache
```

### 4. pnpm Not Found

**Error:**

```
pnpm: command not found
```

**Solution:**

Workflows include a fallback to install pnpm:

```yaml
- name: Ensure pnpm is available (act fallback)
  run: |
    if ! command -v pnpm >/dev/null 2>&1; then
      npm install -g pnpm@${PNPM_VERSION}
    fi
```

If this fails, manually install in container:

```bash
act -j build-and-test -W .github/workflows/ci.yml \
  --env PNPM_VERSION=9 \
  --env COREPACK_ENABLE_STRICT=0
```

### 5. Playwright Browser Not Installed

**Error:**

```
Error: Executable doesn't exist at /root/.cache/ms-playwright/chromium-<version>/chrome-linux/chrome
```

**Solution:**

Workflows install Playwright browsers explicitly:

```yaml
- name: Install Playwright browsers + deps
  run: npx playwright install --with-deps
```

If installation fails, increase Docker memory:

- **Docker Desktop**: Settings → Resources → Memory (increase to 4GB+)
- **Linux**: Check `/etc/docker/daemon.json` memory limits

### 6. Permission Denied Errors

**Error:**

```
EACCES: permission denied, mkdir '/github/workspace/node_modules'
```

**Solution:**

The Ubuntu image runs as `root` by default. If you encounter permission issues:

1. Check file ownership after `act` runs: `ls -la node_modules`
2. Fix ownership: `sudo chown -R $USER:$USER .`
3. Use `--userns` flag: `act -j build-and-test --userns host`

## Validation

**⚠️ IMPORTANT LIMITATION**: Local `act` validation is a **best-effort simulation**, not a guarantee. Even if all local checks pass, **you should still monitor the actual GitHub Actions run** for the following reasons:

### Known Divergence Between Local and Remote

| Aspect          | Local (act)                | Remote (GitHub Actions) | Impact                                   |
| --------------- | -------------------------- | ----------------------- | ---------------------------------------- |
| **Environment** | Docker container           | GitHub-hosted VM        | Different kernel, system libs            |
| **Timing**      | Single-threaded by default | Parallel runners        | Race conditions may only appear remotely |
| **Caching**     | No persistent cache        | Workflow-level cache    | Dependency resolution may differ         |
| **Secrets**     | Local dummy values         | Real GitHub secrets     | Auth-dependent code untested locally     |
| **Artifacts**   | Lost after run             | Uploaded to GitHub      | Can't validate artifact generation       |
| **GitHub API**  | Unavailable                | Available               | PR comments, checks won't work           |

**Best Practice**: Treat `act` as a **fast feedback tool to catch obvious failures**, not a replacement for actual CI validation.

### Comparing Local vs GitHub Outputs

1. **Run workflow locally:**

   ```bash
   act -j build-and-test -W .github/workflows/ci.yml > local-output.log 2>&1
   ```

2. **Trigger same workflow on GitHub:**

   Push to branch or use `workflow_dispatch`

3. **Compare key sections:**
   - Dependency installation (pnpm install)
   - Build outputs (tsc compilation, bundle sizes)
   - Test results (pass/fail counts, coverage)

4. **Check exit codes:**

   ```bash
   act -j build-and-test -W .github/workflows/ci.yml
   echo $?  # Should be 0 for success, non-zero for failure
   ```

### Testing Recommendations

**Before relying on these scripts for critical validation:**

1. **Test in dry-run mode first:**

   ```bash
   pwsh scripts/act-run-ci.ps1 -DryRun -Verbose
   ```

2. **Compare with a known-good GitHub Actions run:**
   - Push a simple change to a test branch
   - Let GitHub Actions run completely
   - Run the same workflow locally with `act`
   - Compare outputs line-by-line

3. **Verify exit codes:**

   ```bash
   pwsh scripts/act-run-ci.ps1
   echo $LASTEXITCODE  # Should be 0 for success
   ```

4. **Check for PowerShell compatibility:**
   - Test on Windows PowerShell 5.1: `powershell -File scripts/act-run-ci.ps1 -DryRun`
   - Test on PowerShell Core 7+: `pwsh scripts/act-run-ci.ps1 -DryRun`
   - Test on Linux with pwsh: `pwsh scripts/act-run-ci.ps1 -DryRun`

**Known Script Limitations:**

- Scripts have **not been tested in production environments**
- Docker image validation regex may need adjustment for different image formats
- PowerShell array handling in `$actCommand` may behave differently across versions
- Exit code propagation assumes `$LASTEXITCODE` is set correctly

### When Local Passes But Remote Fails

- **Timing issues**: E2E tests with race conditions
- **Environment variables**: Missing or different values
- **File permissions**: Container runs as root, GitHub runs as runner
- **Network conditions**: Dependency downloads may timeout on GitHub but not locally

## Advanced Usage

### Custom Workflow Inputs

Trigger `workflow_dispatch` events with custom inputs:

```bash
act workflow_dispatch \
  -W .github/workflows/ci.yml \
  --input skip_e2e=false
```

### Event Types

Simulate different GitHub events:

```bash
# Push event (default)
act push -W .github/workflows/ci.yml

# Pull request event
act pull_request -W .github/workflows/ci.yml

# Workflow dispatch (manual trigger)
act workflow_dispatch -W .github/workflows/ci.yml
```

### Secrets Handling

Pass secrets to workflows (for testing secret-dependent actions):

```bash
# Via command line
act -s MY_SECRET=value -W .github/workflows/ci.yml

# Via .secrets file (gitignored)
echo "MY_SECRET=value" > .secrets
act --secret-file .secrets -W .github/workflows/ci.yml
```

**Security Note:** Never commit real secrets to `.secrets`. Use dummy values for local testing.

### Container Shell Access

Debug inside the container:

```bash
# Run and keep container alive
act -j build-and-test -W .github/workflows/ci.yml --container-architecture linux/amd64 -v

# In another terminal, find container ID
docker ps

# Access shell
docker exec -it <container-id> /bin/bash
```

### Workflow Graph Visualization

See job dependencies:

```bash
act -W .github/workflows/ci.yml --graph
```

## Helper Scripts

ClarityOKR provides PowerShell wrapper scripts for common scenarios:

### scripts/act-run-clarify-okr-e2e.ps1

Runs the Clarify OKR workflow with E2E tests:

```powershell
# Basic usage
pwsh scripts/act-run-clarify-okr-e2e.ps1

# Pull image first
pwsh scripts/act-run-clarify-okr-e2e.ps1 -Pull

# Dry-run (show command without executing)
pwsh scripts/act-run-clarify-okr-e2e.ps1 -DryRun

# Verbose output
pwsh scripts/act-run-clarify-okr-e2e.ps1 -Verbose
```

### scripts/act-run-ci.ps1

Runs the main CI workflow with job selection:

```powershell
# Run build-and-test job only (default)
pwsh scripts/act-run-ci.ps1

# Run E2E job (requires build-and-test first)
pwsh scripts/act-run-ci.ps1 -Job e2e -RunE2E

# Run all jobs
pwsh scripts/act-run-ci.ps1 -Job all

# Skip lint for faster iteration
pwsh scripts/act-run-ci.ps1 -SkipLint

# Dry-run mode
pwsh scripts/act-run-ci.ps1 -DryRun
```

## Further Reading

- [act Documentation](https://nektosact.com/)
- [act GitHub Repository](https://github.com/nektos/act)
- [GitHub Actions Runner Images](https://github.com/catthehacker/docker_images)
- [ClarityOKR CI Validation Checklist](./ci-validation-checklist.md)
