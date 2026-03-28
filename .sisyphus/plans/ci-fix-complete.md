# Fix CI Build Errors - Complete Plan

## Branch

`feat/us2-us3-okr-sticky-and-editing`

## Critical Errors to Fix

### Error 1: session-manager.service.ts - Syntax Error

**File**: `app/main/src/services/session-manager.service.ts`
**Line**: 232-233
**Problem**: Duplicate JSDoc comments causing syntax error

**Current**:

```typescript
  /**
   * Gets a session for testing (returns undefined instead of null).
   *
   * @param sessionId - The session ID to retrieve
   * @returns Promise resolving to the session or undefined
   */
   * 获取会话（用于测试模式，返回undefined而非null）
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
```

**Fix**: Remove lines 232-233 (the duplicate Chinese comment and its closing \*/

---

### Error 2: ClarificationController - Interface Mismatch

**File**: `app/main/src/windows/clarification-controller.ts`
**Problem**: Controller expects methods that don't exist on `ClarificationSessionManager`

**Missing Methods Analysis**:
From error messages, controller expects:

- `sessionManager.createSession()` - exists
- `sessionManager.getSession()` - exists
- `sessionManager.endSession()` - exists
- `sessionManager.cleanupSessions()` - exists
- `sessionManager.getCurrentSessionId()` - MISSING
- `sessionManager.getAllSessions()` - MISSING
- `sessionManager.getSessionCount()` - MISSING
- `sessionManager.setSession()` - MISSING
- `promptHandler.handlePrompt()` - MISSING
- `promptHandler.getNextQuestion()` - MISSING
- `responseHandler.handleResponse()` - MISSING
- `draftHandler.generateDraft()` - MISSING
- `actionLogService.logAction()` - MISSING
- `actionLogService.logUnexpectedError()` - MISSING

**Fix Strategy**:

1. Check if these methods exist with different names
2. Add missing methods to implementations
3. OR fix controller to use correct method names

---

## Implementation Steps

### Step 1: Fix Syntax Error in session-manager.service.ts

```typescript
// Remove lines 232-233:
   * 获取会话（用于测试模式，返回undefined而非null）
   */
```

### Step 2: Check Actual Method Names

Search for what methods actually exist:

- `clarification-session-manager.ts` - list all public methods
- `clarification-prompt-handler.ts` - list all public methods
- `clarification-response-handler.ts` - list all public methods
- `clarification-draft-handler.ts` - list all public methods
- `action-log.service.ts` - list all public methods

### Step 3: Fix Method Name Mismatches

Either:

- Rename methods in implementations to match controller expectations
- OR update controller to use actual method names

Recommendation: Update controller to match implementation (less invasive)

### Step 4: Add Missing Methods to SessionManager

If methods truly don't exist:

- Add `getCurrentSessionId(): string | null`
- Add `getAllSessions(): ClarificationSession[]`
- Add `getSessionCount(): number`
- Add `setSession(sessionId: string): void`

---

## Verification

After all fixes:

```bash
pnpm run typecheck
pnpm run build
pnpm run test:unit
```

---

## Files to Modify

1. `app/main/src/services/session-manager.service.ts` - Fix syntax error
2. `app/main/src/windows/clarification-controller.ts` - Fix method calls
3. `app/main/src/clarification/clarification-session-manager.ts` - Add missing methods (if needed)

---

## Success Criteria

- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds
- [ ] All CI checks pass on PR #14
