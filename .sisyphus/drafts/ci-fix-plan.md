# Fix Plan: CI Build Errors

## Problem Analysis

CI build is failing due to syntax errors introduced during code generation:

### Error 1: session-manager.service.ts

**Location**: Line 232-233  
**Issue**: Duplicate JSDoc comments causing "Unterminated regular expression literal"

**Current Code**:

```typescript
   * 获取会话（用于测试模式，返回undefined而非null）
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
```

**Fix**: Remove lines 232-233 (duplicate Chinese comment)

---

### Error 2: clarification-controller.ts

**Location**: Multiple lines  
**Issue**: Interface/Type mismatch - `ClarificationSessionManager` doesn't implement `IClarificationSessionManager`

**Errors**:

- Missing properties: `createSession`, `getSession`, `endSession`, `cleanupSessions`
- Missing methods on handlers: `handlePrompt`, `handleResponse`, `generateDraft`
- Missing methods on services: `logAction`, `logUnexpectedError`

**Root Cause**: The controller expects an interface that doesn't match the actual implementation.

**Fix Options**:

1. Update `IClarificationSessionManager` interface to match implementation
2. OR Update `ClarificationSessionManager` to implement missing methods
3. OR Fix the controller to use correct method names

---

## Fix Commands

### Fix 1: session-manager.service.ts

```bash
# Remove duplicate lines 232-233
sed -i '232,233d' app/main/src/services/session-manager.service.ts
```

### Fix 2: Check clarification-controller.ts

```bash
# First check what methods actually exist
grep -n "async.*getSession\|async.*createSession\|async.*endSession" app/main/src/services/session-manager.service.ts
```

---

## Verification

After fixes, verify:

```bash
pnpm run typecheck
pnpm run build
```

---

## Note to User

These errors were likely introduced by AI code generation that created:

1. Duplicate comments (Chinese translation added without removing English)
2. Interface definitions that don't match implementations

The fixes require direct code edits which must be done by the implementation agent (Sisyphus).
