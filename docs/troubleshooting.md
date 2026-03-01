# ClarityOKR Troubleshooting Guide

## Common Issues

### Application Won't Start

**Symptom**: Electron window doesn't appear or crashes immediately.

**Solutions**:

1. Check Node.js version: `node --version` (requires ≥20.19.x)
2. Clear dependencies and reinstall:
   ```bash
   rm -rf node_modules app/*/node_modules packages/*/node_modules
   pnpm install
   ```
3. Check for port conflicts if dev server won't start:
   ```bash
   lsof -i :4200  # Angular dev server
   ```

### Tests Hang or Timeout

**Symptom**: Jest or Playwright tests hang indefinitely.

**Solutions**:

1. Increase timeout in CI environments:
   ```bash
   JEST_TIMEOUT=30000 pnpm run test:unit
   ```
2. For E2E tests, ensure Xvfb is running (Linux):
   ```bash
   xvfb-run -a pnpm run test:e2e
   ```
3. Check for zombie Electron processes:
   ```bash
   pkill -f electron
   ```

### E2E Tests Fail with "Session Already Exists"

**Symptom**: E2E tests fail claiming a session already exists.

**Solution**: Clear the data directory between test runs:

```bash
rm -rf data/
pnpm run test:e2e
```

### LLM API Errors

**Symptom**: "Failed to generate clarification prompt" or network errors.

**Solutions**:

1. Verify environment variables:
   ```bash
   echo $LLM_API_KEY
   echo $LLM_BASE_URL
   echo $LLM_MODEL
   ```
2. Test API connectivity:
   ```bash
   curl -H "Authorization: Bearer $LLM_API_KEY" $LLM_BASE_URL/models
   ```
3. For E2E tests, verify mock server is running on the expected port.

### IPC Communication Errors

**Symptom**: "Invalid payload" errors in console.

**Solutions**:

1. Check that renderer and main process use the same contract version
2. Validate payload structure against Zod schema
3. Enable IPC logging:
   ```typescript
   // In main process
   electron.ipcMain.on('*', (event, ...args) => {
     console.log('[IPC]', event.channel, args);
   });
   ```

### Angular Component Tests Fail

**Symptom**: Karma tests fail with module resolution errors.

**Solutions**:

1. Clear Angular cache:
   ```bash
   pnpm --filter @clarityokr/renderer run ng cache clean
   ```
2. Check TestBed configuration matches module imports
3. Verify all mock providers are correctly configured

### Build Errors

**Symptom**: TypeScript compilation or build fails.

**Solutions**:

1. Run typecheck separately for detailed errors:
   ```bash
   pnpm run typecheck
   ```
2. Check for circular dependencies:
   ```bash
   npx madge --circular app/
   ```
3. Verify ESM imports (no CommonJS require):
   ```bash
   grep -r "require(" app/ --include="*.ts"
   ```

## Debug Tips

### Enable Verbose Logging

Add to main process entry:

```typescript
process.env.DEBUG = 'clarityokr:*';
```

### Run Single Test File

```bash
# Unit tests
pnpm jest tests/unit/specs/path/to/test.spec.ts

# E2E tests
pnpm playwright test tests/e2e/specs/path/to/test.spec.ts --headed
```

### Inspect IPC Messages

In renderer DevTools console:

```javascript
// Log all IPC messages
require('electron').ipcRenderer.on('*', (event, ...args) => console.log(event, args));
```

### Check File System State

```bash
# View current session
cat data/session.json | jq .

# View saved OKRs
ls -la data/okr/

# View action log
tail -f data/action-log.ndjson
```

### Debug Electron Main Process

1. Add to main process:
   ```typescript
   // Enable DevTools for main process
   import { app } from 'electron';
   app.on('ready', () => {
     const { BrowserWindow } = require('electron');
     // Debug code here
   });
   ```
2. Use VS Code launch configuration for Electron debugging

## Performance Issues

### Slow Startup

1. Check bundle size:
   ```bash
   du -sh app/renderer/dist/
   ```
2. Enable build optimization in angular.json
3. Lazy load feature modules

### Memory Leaks

1. Use Chrome DevTools Memory profiler
2. Check for unsubscribed RxJS observables:
   ```typescript
   // Always use takeUntil or async pipe
   this.service.data$.pipe(takeUntil(this.destroy$)).subscribe();
   ```

## CI/CD Issues

### act (GitHub Actions Local) Fails

1. Check Docker is running: `docker ps`
2. Use correct event type:
   ```bash
   act -j build pull_request  # not 'push'
   ```
3. See [docs/ci-simulation.md](ci-simulation.md) for detailed setup

### CI Tests Pass Locally but Fail in GitHub Actions

1. Compare environment versions (Node.js, pnpm)
2. Check for environment-dependent code (paths, line endings)
3. Review timing issues in async code

## Getting Help

1. Check existing issues: https://github.com/Jackela/ClarityOKR/issues
2. Review action logs in `data/action-log.ndjson`
3. Create a minimal reproduction case
4. Include:
   - Node.js version
   - OS and version
   - Error messages (full stack trace)
   - Steps to reproduce
