# Fix E2E Test Flakiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all remaining E2E test failures by resolving timing issues, mock server logic flaws, and test anti-patterns.

**Architecture:**

- Fix mock server to handle different request types (nextQuestion, draft, error) correctly
- Replace flaky `waitForSelector` with reliable `expect().toBeVisible()` patterns
- Fix sticky window detection to use Electron API directly
- Add proper state synchronization between tests

**Tech Stack:** Playwright, TypeScript, Electron, Angular

---

## Batch 1: Quick Wins - Fix Test Timing Issues

### Task 1: Fix clarification/interview-flow.spec.ts timing

**Files:**

- Modify: `tests/e2e/specs/clarification/interview-flow.spec.ts:54-59`

**Step 1: Replace waitForSelector with expect().toBeVisible()**

Change lines 54-59 from:

```typescript
await optionLocator.first().click();
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
  state: 'hidden',
  timeout: 30_000,
});
```

To:

```typescript
await optionLocator.first().click();
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
  timeout: 5000,
});
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
  timeout: 30000,
});
```

**Step 2: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/clarification/interview-flow.spec.ts`
Expected: Test should run without timing-related timeouts

**Step 3: Commit**

```bash
git add tests/e2e/specs/clarification/interview-flow.spec.ts
git commit -m "fix(e2e): use expect().toBeVisible() for reliable loading state detection

Replace flaky waitForSelector with expect().toBeVisible() which
auto-retries until the condition is met."
```

---

### Task 2: Fix llm/next-question.e2e.spec.ts timing

**Files:**

- Modify: `tests/e2e/specs/llm/next-question.e2e.spec.ts:21-25`

**Step 1: Replace waitForSelector pattern**

Change lines 21-25 from:

```typescript
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
  state: 'hidden',
  timeout: 15_000,
});
```

To:

```typescript
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
  timeout: 5000,
});
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
  timeout: 15000,
});
```

**Step 2: Add expect import if missing**

Ensure `expect` is imported from fixtures:

```typescript
import { test, expect } from '../../fixtures';
```

**Step 3: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/llm/next-question.e2e.spec.ts`
Expected: Test passes without timing issues

**Step 4: Commit**

```bash
git add tests/e2e/specs/llm/next-question.e2e.spec.ts
git commit -m "fix(e2e): fix timing in next-question test

Use expect().toBeVisible() instead of waitForSelector for reliable
loading state detection."
```

---

### Task 3: Fix llm/draft.e2e.spec.ts timing and flow

**Files:**

- Modify: `tests/e2e/specs/llm/draft.e2e.spec.ts:44-54`

**Step 1: Add missing loading state waits**

Change lines 44-54 from:

```typescript
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
  state: 'hidden',
  timeout: 30_000,
});
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
```

To:

```typescript
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
  timeout: 5000,
});
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
  timeout: 30000,
});
await mainWindow.locator('[data-testid="clarification-option"]').first().click();
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
  timeout: 5000,
});
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
  timeout: 30000,
});
```

**Step 2: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/llm/draft.e2e.spec.ts`
Expected: Test passes with proper loading state synchronization

**Step 3: Commit**

```bash
git add tests/e2e/specs/llm/draft.e2e.spec.ts
git commit -m "fix(e2e): add missing loading state waits in draft test

Add loading state waits after second option click to ensure proper
synchronization with UI transitions."
```

---

## Batch 2: Fix Mock Server Logic

### Task 4: Fix mock server to handle different request types

**Files:**

- Modify: `tests/e2e/fixtures/index.ts:98-147`

**Step 1: Add request type detection**

Replace the mock server handler logic (lines 98-147) with:

```typescript
if (req.method === 'POST' && req.url?.includes('/v1/responses')) {
  callCounter += 1;

  // Determine request type from body
  const body = parsedBody as Record<string, unknown> | null;
  const isDraftRequest = body?.intent === 'draft' || (body?.tool as string)?.includes?.('draft');

  if (process.env.E2E_DEBUG === 'true') {
    console.log(`[mock-server] Request #${callCounter}:`, { isDraftRequest, body });
  }

  // Handle draft requests
  if (isDraftRequest && responseConfig.draft) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ draft: responseConfig.draft }));
    return;
  }

  // Handle raw response (for invalid response tests)
  if (responseConfig.rawResponse !== undefined) {
    const raw =
      typeof responseConfig.rawResponse === 'function'
        ? responseConfig.rawResponse()
        : responseConfig.rawResponse;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(raw);
    return;
  }

  // Handle nextQuestion with error signaling
  const nextQuestionFn = responseConfig.nextQuestion;
  if (nextQuestionFn) {
    const questionResponse = nextQuestionFn(callCounter);
    if (questionResponse === null) {
      // null signals error - return 503
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
      return;
    }
    if (questionResponse) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(questionResponse));
      return;
    }
  }

  // Handle global error config (for network error tests)
  if (responseConfig.error) {
    const errorResponse = JSON.stringify({ error: responseConfig.error.message });
    res.writeHead(responseConfig.error.status, { 'Content-Type': 'application/json' });
    res.end(errorResponse);
    return;
  }

  // Default question response
  const defaultQuestion = {
    question: {
      id: `q${callCounter + 1}`,
      text: '再补充一个细节',
      options: [
        { id: 'a', label: 'A', value: 'a' },
        { id: 'b', label: 'B', value: 'b' },
      ],
    },
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(defaultQuestion));
  return;
}
```

**Step 2: Update MockResponseConfig interface**

Add comment to clarify null return means error:

```typescript
export interface MockResponseConfig {
  /**
   * Function to generate next question response.
   * Return null to signal an error (503 response).
   * Return undefined to fall through to default response.
   */
  nextQuestion?: (callNumber: number) => object | null | undefined;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
}
```

**Step 3: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test`
Expected: Tests should properly differentiate between nextQuestion and draft requests

**Step 4: Commit**

```bash
git add tests/e2e/fixtures/index.ts
git commit -m "fix(e2e): improve mock server request handling

- Add request type detection (draft vs nextQuestion)
- Allow nextQuestion function to return null for error signaling
- Add debug logging for request tracking
- Prioritize draft requests when draft config is set"
```

---

### Task 5: Update network-errors tests to use new error signaling

**Files:**

- Modify: `tests/e2e/specs/error-handling/network-errors.spec.ts:7-10,24-27,41-63`

**Step 1: Update first test to use error config**

Lines 7-10 remain using error config (this is correct for pure error tests):

```typescript
mockServer.setResponses({
  error: { status: 503, message: 'Service Unavailable' },
});
```

**Step 2: Update retry recovery test to use null signaling**

Change lines 41-63 from:

```typescript
let failCount = 0;
mockServer.setResponses({
  nextQuestion: () => {
    failCount += 1;
    if (failCount <= 1) {
      return null; // Signal error for first call
    }
    return {
      question: {
        id: 'q1',
        text: 'Test question',
        options: [
          { id: 'a', label: 'Option A', value: 'a' },
          { id: 'b', label: 'Option B', value: 'b' },
        ],
      },
    };
  },
});
```

To:

```typescript
let failCount = 0;
mockServer.setResponses({
  nextQuestion: (callNumber) => {
    if (callNumber <= 1) {
      return null; // Signal error for first call - returns 503
    }
    return {
      question: {
        id: 'q1',
        text: 'Test question',
        options: [
          { id: 'a', label: 'Option A', value: 'a' },
          { id: 'b', label: 'Option B', value: 'b' },
        ],
      },
    };
  },
});
```

**Step 3: Remove redundant setResponses in retry test**

The retry test (lines 75-87) sets responses again before clicking retry. With the new logic, this should work correctly, but let's simplify by removing the redundant call since the nextQuestion function already handles the retry.

Actually, keep it as-is - it's good practice to explicitly set the success state before retry.

**Step 4: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/error-handling/network-errors.spec.ts`
Expected: All network error tests pass with proper error/ success transitions

**Step 5: Commit**

```bash
git add tests/e2e/specs/error-handling/network-errors.spec.ts
git commit -m "fix(e2e): update network-errors tests for new mock server

Use null return from nextQuestion function to signal errors instead
of global error config, allowing per-request error control."
```

---

## Batch 3: Fix Sticky Window Tests

### Task 6: Create helper for sticky window detection

**Files:**

- Modify: `tests/e2e/helpers/build-check.ts`
- Modify: `tests/e2e/fixtures/index.ts`

**Step 1: Add sticky window helper to build-check.ts**

Add at the end of build-check.ts:

```typescript
export async function findStickyWindow(electronApp: ElectronApplication): Promise<Page | null> {
  // Use Electron API to find always-on-top windows
  const stickyWindowId = await electronApp.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const sticky = windows.find((w) => w.isAlwaysOnTop() && w.isVisible());
    return sticky ? sticky.id : null;
  });

  if (!stickyWindowId) return null;

  // Find corresponding Playwright page
  const pages = electronApp.context().pages();
  // The sticky window should be a page in the context
  // We need to find which page corresponds to the sticky window
  for (const page of pages) {
    const pageWindowId = await page
      .evaluate(() => {
        return (window as unknown as { electron?: { windowId: number } }).electron?.windowId;
      })
      .catch(() => null);

    if (pageWindowId === stickyWindowId) {
      return page;
    }
  }

  return null;
}
```

**Step 2: Export from fixtures/index.ts**

Add to the exports at the bottom of fixtures/index.ts:

```typescript
export { findStickyWindow } from '../helpers/build-check';
```

**Step 3: Commit**

```bash
git add tests/e2e/helpers/build-check.ts tests/e2e/fixtures/index.ts
git commit -m "feat(e2e): add sticky window detection helper

Add findStickyWindow() helper that uses Electron API to find
always-on-top windows reliably."
```

---

### Task 7: Update sticky-window.spec.ts to use new helper

**Files:**

- Modify: `tests/e2e/specs/okr-sticky/sticky-window.spec.ts:1,15-40`

**Step 1: Update imports**

Change line 1 from:

```typescript
import { test, expect } from '../../fixtures';
```

To:

```typescript
import { test, expect, findStickyWindow } from '../../fixtures';
```

**Step 2: Replace waitForStickyWindowSnapshot function**

Replace the entire function (lines 15-40) with:

```typescript
async function waitForStickyWindowSnapshot(
  electronApp: ElectronApplication,
  mainWindow: Page,
  timeout = 15000,
): Promise<Page> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const stickyWindow = await findStickyWindow(electronApp);
    if (stickyWindow) {
      return stickyWindow;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Sticky window not found within ${timeout}ms`);
}
```

**Step 3: Fix timing in completeClarification function**

Change lines 20-26 from:

```typescript
async function completeClarification(mainWindow: Page) {
  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '完成澄清流程');
  await mainWindow.click('[data-testid="start-clarification"]');
  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 15000 });

  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 30_000,
  });
```

To:

```typescript
async function completeClarification(mainWindow: Page, electronApp: ElectronApplication, mockServer: MockServerFixture) {
  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '完成澄清流程');
  await mainWindow.click('[data-testid="start-clarification"]');
  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 15000 });

  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({ timeout: 5000 });
  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({ timeout: 30000 });
  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 5000 });
```

Wait, I need to check the full context of this function. Let me also update the call sites to pass the needed parameters.

Actually, let me simplify - the completeClarification function doesn't need electronApp if we're just fixing timing. But for the sticky window test, we do need it.

Let me revise:

**Step 3a: Fix timing only (lines 21-26)**

```typescript
const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
await optionLocator.first().click();
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
  timeout: 5000,
});
await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
  timeout: 30000,
});
```

**Step 3b: Update function signature and calls**

Actually, looking at line 129, the function is called with `(mainWindow)` but needs electronApp for the sticky window detection. Let me update this properly.

Change function signature (line 20):

```typescript
async function completeClarification(mainWindow: Page, electronApp: ElectronApplication) {
```

Update call at line 129:

```typescript
await completeClarification(mainWindow, electronApp);
```

**Step 4: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/okr-sticky/sticky-window.spec.ts`
Expected: Test passes with reliable sticky window detection

**Step 5: Commit**

```bash
git add tests/e2e/specs/okr-sticky/sticky-window.spec.ts
git commit -m "fix(e2e): fix sticky window detection and timing

- Use findStickyWindow helper for reliable window detection
- Fix timing issues with expect().toBeVisible()
- Update function signatures to pass electronApp"
```

---

### Task 8: Update sticky-window-reopen.spec.ts

**Files:**

- Modify: `tests/e2e/specs/okr-sticky/sticky-window-reopen.spec.ts:1,86-106`

**Step 1: Update imports**

Add to line 1:

```typescript
import { test, expect, findStickyWindow } from '../../fixtures';
```

**Step 2: Replace waitForStickyWindowSnapshot function**

Replace lines 86-106 with:

```typescript
async function waitForStickyWindowSnapshot(
  electronApp: ElectronApplication,
  mainWindow: Page,
  timeout = 15000,
): Promise<Page> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const stickyWindow = await findStickyWindow(electronApp);
    if (stickyWindow) {
      return stickyWindow;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Sticky window not found within ${timeout}ms`);
}
```

**Step 3: Verify fix**

Run: `pnpm --filter @clarityokr/tests-e2e run test --specs/okr-sticky/sticky-window-reopen.spec.ts`
Expected: Test passes

**Step 4: Commit**

```bash
git add tests/e2e/specs/okr-sticky/sticky-window-reopen.spec.ts
git commit -m "fix(e2e): use findStickyWindow helper in reopen test"
```

---

## Batch 4: Final Verification

### Task 9: Run full E2E test suite

**Step 1: Run all E2E tests**

```bash
pnpm --filter @clarityokr/tests-e2e run test
```

Expected: All 11 tests pass (8 previously failing + 3 already passing)

**Step 2: If failures occur, analyze and fix**

Check which tests still fail and address specific issues.

**Step 3: Final commit**

```bash
git commit --allow-empty -m "test(e2e): complete E2E test stability improvements

All E2E tests now pass reliably:
- Fixed timing issues with expect().toBeVisible()
- Improved mock server request handling
- Added reliable sticky window detection
- Fixed test synchronization issues"
```

---

## Verification Checklist

- [ ] interview-flow.spec.ts passes
- [ ] network-errors.spec.ts passes (all 3 tests)
- [ ] draft.e2e.spec.ts passes
- [ ] next-question.e2e.spec.ts passes
- [ ] sticky-window.spec.ts passes
- [ ] sticky-window-reopen.spec.ts passes
- [ ] invalid-responses.spec.ts still passes (3 tests)
- [ ] All tests pass in CI

---

## Notes

1. **Why expect().toBeVisible() works better:** Playwright's expect matchers auto-retry until the condition is met or timeout, whereas waitForSelector checks once and fails.

2. **Mock server request detection:** We detect draft requests by checking the intent field in the request body. This allows the same endpoint to handle both nextQuestion and draft requests correctly.

3. **Null signaling:** Returning null from nextQuestion signals an error, allowing tests to control which specific requests fail vs succeed.

4. **Sticky window detection:** Using Electron's BrowserWindow API is more reliable than Playwright's context.pages() because it works with windows created via the main process.
