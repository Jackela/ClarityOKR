# State Management Audit Report

**Task:** RF007 - 状态管理审计和简化  
**Date:** 2026-03-27  
**Audited by:** Sisyphus-Junior

---

## Executive Summary

This audit identified **5 critical issues** in the renderer state management:

- 1 duplicate file (exact copy)
- 1 deprecated adapter service (redundant delegation layer)
- 1 component using deprecated service instead of new state machine
- 1 duplicate import statement
- Multiple complex state properties that could be simplified

**Estimated cleanup impact:** ~682 lines of code removed, clearer state flow

---

## 1. Signal Usage Audit

### 1.1 Clarification State Machine ✅ (Good Pattern)

**File:** `app/renderer/src/app/clarification/services/clarification-state-machine.service.ts`

**Signal Usage:**

```typescript
// Core state (single source of truth)
private readonly _state = signal<ClarificationState>(INITIAL_STATE);

// 14 computed signals for derived state
readonly workflowState = computed(() => this._state().workflowState);
readonly currentPrompt = computed(() => this._state().currentPrompt);
readonly isLoading = computed(() => this._state().isLoading);
readonly error = computed(() => this._state().error);
readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);
readonly selections = computed(() => this._state().selections);
readonly sessionId = computed(() => this._state().sessionId);
readonly validationError = computed(() => this._state().validationError);
readonly intent = computed(() => this._state().intent);
readonly history = computed(() => this._state().history);
readonly hasError = computed(() => this._state().error !== null);
readonly selectionCount = computed(() => Object.keys(this._state().selections).length);
readonly hasPrompt = computed(() => this._state().currentPrompt !== null);
readonly errorMessage = computed(() => this._state().error?.message ?? null);
readonly currentSelection = computed(() => { ... });
readonly selectedOptionIds = computed(() => Object.values(this._state().selections));
```

**Verdict:** ✅ Proper Signal architecture

- Single writable signal as source of truth
- All reads through computed signals
- Reducer pattern for state transitions
- Clean separation between state and actions

### 1.2 Edit Mode Store ✅ (Good Pattern)

**File:** `app/renderer/src/app/okr-sticky/stores/edit-mode.store.ts`

**Signal Usage:**

```typescript
private readonly _state = signal<EditModeState>(INITIAL_STATE);

// 7 computed signals
readonly isEditing = computed(() => this._state().isEditing);
readonly originalObjective = computed(() => this._state().originalObjective);
readonly originalKeyResults = computed(() => this._state().originalKeyResults);
readonly draftObjective = computed(() => this._state().draftObjective);
readonly draftKeyResults = computed(() => this._state().draftKeyResults);
readonly isDirty = computed(() => this._state().isDirty);
readonly isValid = computed(() => this._state().isValid);
readonly errors = computed(() => this._state().errors);
```

**Verdict:** ✅ Proper Signal architecture with validation

---

## 2. Identified Issues

### Issue #1: Duplicate EditModeStore File 🔴 CRITICAL

**Files:**

- `app/renderer/src/app/okr-sticky/state/edit-mode.store.ts` (411 lines)
- `app/renderer/src/app/okr-sticky/stores/edit-mode.store.ts` (411 lines)

**Problem:** Two identical copies of the same store exist in different directories

**Evidence:**

```bash
$ diff state/edit-mode.store.ts stores/edit-mode.store.ts
Files are identical
```

**Impact:**

- Confusion about which file to import
- Potential for divergent changes
- Component imports from `stores/` (the correct location per convention)

**Recommendation:**

```bash
# Remove the duplicate
rm app/renderer/src/app/okr-sticky/state/edit-mode.store.ts
rmdir app/renderer/src/app/okr-sticky/state/
```

---

### Issue #2: Deprecated SyncClarificationState Adapter 🟡 MEDIUM

**File:** `app/renderer/src/app/clarification/services/sync-clarification-state.service.ts` (271 lines)

**Problem:** Pure delegation wrapper around ClarificationStateMachine with no added value

**Current Flow:**

```
Component → SyncClarificationState → ClarificationStateMachine
```

**All 18 methods are pure passthrough:**

```typescript
setPrompt(prompt) {
  this.stateMachine.setPrompt(prompt);  // Just delegates
}
setLoading(loading, intent?) {
  this.stateMachine.setLoading(loading, intent);  // Just delegates
}
// ... 16 more identical patterns
```

**Usage:**

- `clarification-wizard.component.ts` imports and uses this deprecated service
- ClarificationOrchestratorService also uses it

**Recommendation:**

1. Update `clarification-wizard.component.ts` to inject `ClarificationStateMachine` directly
2. Update `clarification-orchestrator.service.ts` to use `ClarificationStateMachine`
3. Delete `sync-clarification-state.service.ts`
4. Update any tests

**Estimated savings:** 271 lines

---

### Issue #3: Component Using Deprecated Service 🟡 MEDIUM

**File:** `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`

**Problem:** Still uses deprecated `SyncClarificationState` instead of `ClarificationStateMachine`

**Current Code:**

```typescript
import type { SyncClarificationState } from '../services/sync-clarification-state.service';
// ...
constructor(public readonly state: SyncClarificationState) {}
```

**Should Be:**

```typescript
import { ClarificationStateMachine } from '../services/clarification-state-machine.service';
// ...
constructor(public readonly state: ClarificationStateMachine) {}
```

---

### Issue #4: Duplicate Import Statement 🟢 MINOR

**File:** `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`

**Lines 25-26:**

```typescript
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { SyncClarificationState } from '../services/sync-clarification-state.service';
import { SkeletonComponent } from '../../shared/components/skeleton.component'; // DUPLICATE
import type { SyncClarificationState } from '../services/sync-clarification-state.service'; // DUPLICATE
```

---

### Issue #5: Redundant State Properties 🟡 MEDIUM

**File:** `app/renderer/src/app/clarification/services/clarification-state-machine.service.ts`

**Current State Interface:**

```typescript
interface ClarificationState {
  workflowState: WorkflowState; // 'idle' | 'loading' | 'prompting' | ...
  isLoading: boolean; // REDUNDANT - derived from workflowState
  isReadyToGenerate: boolean; // REDUNDANT - derived from selections.length
  error: ErrorInfo | null; // Could simplify
  // ... other fields
}
```

**Issues:**

1. `isLoading` - Can be derived from `workflowState === 'loading' || workflowState === 'generating'`
2. `isReadyToGenerate` - Can be derived from `Object.keys(selections).length >= 1`
3. `error` + `validationError` - Two error states; could unify

**Recommendation:** Consider making these computed properties instead of stored state

---

## 3. State Flow Documentation

### 3.1 Clarification Flow State Machine

```
┌─────────┐     START      ┌──────────┐
│  idle   │───────────────>│ loading  │
└─────────┘                └────┬─────┘
                                │
                                │ SET_PROMPT
                                ▼
┌─────────┐    RECORD_      ┌──────────┐
│  ready  │<──SELECTION─────│prompting │
└────┬────┘                 └────┬─────┘
     │                           │
     │ SET_GENERATING            │ ERROR
     ▼                           ▼
┌──────────┐  SET_COMPLETED  ┌───────┐
│generating│────────────────>│completed
└────┬─────┘                 └───┬───┘
     │                          │
     │ ERROR                    │ RESET
     ▼                          ▼
┌─────────┐<─────────────────┐idle   │
│  error  │   CLEAR_ERROR    └───────┘
└─────────┘
```

### 3.2 State Ownership Matrix

| State            | Owner                     | Type     | Consumers                     |
| ---------------- | ------------------------- | -------- | ----------------------------- |
| `workflowState`  | ClarificationStateMachine | Signal   | WizardComponent, Orchestrator |
| `currentPrompt`  | ClarificationStateMachine | Signal   | WizardComponent               |
| `selections`     | ClarificationStateMachine | Signal   | WizardComponent               |
| `isEditing`      | EditModeStore             | Signal   | OkrStickyNoteComponent        |
| `draftObjective` | EditModeStore             | Signal   | OkrEditModeComponent          |
| `isDirty`        | EditModeStore             | Computed | OkrStickyNoteComponent        |
| `isValid`        | EditModeStore             | Computed | OkrStickyNoteComponent        |

### 3.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          RENDERER PROCESS                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │ClarificationWizard│         │ OkrStickyNote    │                 │
│  │   Component       │         │   Component      │                 │
│  └────────┬─────────┘         └────────┬─────────┘                 │
│           │                            │                          │
│           │ inject                     │ inject                   │
│           ▼                            ▼                          │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │ClarificationState│         │   EditModeStore  │                 │
│  │     Machine      │         │   (Signal-based) │                 │
│  └────────┬─────────┘         └──────────────────┘                 │
│           │                                                       │
│           │ IPC invoke/send                                       │
│           ▼                                                       │
│  ┌──────────────────┐                                             │
│  │  Orchestrator    │─────────────────────────────────────────────┤
│  └──────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │ClarificationState│         │   Main Process   │                 │
│  │     Machine      │         │   State Machine  │                 │
│  └──────────────────┘         └──────────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Simplification Recommendations

### Priority 1: Remove Duplicate Files

**Action:** Delete `app/renderer/src/app/okr-sticky/state/` directory

```bash
rm -rf app/renderer/src/app/okr-sticky/state/
```

**Lines saved:** 411

---

### Priority 2: Remove Deprecated SyncClarificationState

**Action Plan:**

1. **Update `clarification-wizard.component.ts`:**

   ```typescript
   // BEFORE
   import type { SyncClarificationState } from '../services/sync-clarification-state.service';
   constructor(public readonly state: SyncClarificationState) {}

   // AFTER
   import { ClarificationStateMachine } from '../services/clarification-state-machine.service';
   constructor(public readonly state: ClarificationStateMachine) {}
   ```

2. **Update `clarification-orchestrator.service.ts`:**

   ```typescript
   // BEFORE
   import type { SyncClarificationState } from './sync-clarification-state.service';
   constructor(private readonly state: SyncClarificationState) {}

   // AFTER
   import { ClarificationStateMachine } from './clarification-state-machine.service';
   constructor(private readonly state: ClarificationStateMachine) {}
   ```

3. **Delete deprecated file:**
   ```bash
   rm app/renderer/src/app/clarification/services/sync-clarification-state.service.ts
   ```

**Lines saved:** 271

---

### Priority 3: Fix Duplicate Imports

**File:** `clarification-wizard.component.ts`

Remove lines 25-26 (duplicate imports)

---

### Priority 4: Consider Deriving Redundant State

**Option A: Keep as-is** (more explicit, slightly more memory)
**Option B: Derive from workflowState** (less state, more computation)

Example for Option B:

```typescript
// Instead of storing isLoading
readonly isLoading = computed(() =>
  this.workflowState() === 'loading' ||
  this.workflowState() === 'generating'
);

// Instead of storing isReadyToGenerate
readonly isReadyToGenerate = computed(() =>
  this.selectionCount() >= 1
);
```

**Recommendation:** Keep as-is for now - explicit state is clearer for debugging

---

## 5. Clean Architecture After Simplification

### Final State Management Structure:

```
app/renderer/src/app/
├── clarification/
│   └── services/
│       ├── clarification-state-machine.service.ts  ✅ Core state
│       ├── clarification-orchestrator.service.ts   ✅ IPC coordination
│       ├── llm-gateway.service.ts                  ✅ Abstract gateway
│       ├── ipc-llm-gateway.service.ts              ✅ IPC implementation
│       └── mock-llm-gateway.service.ts             ✅ Test mock
│       └── sync-clarification-state.service.ts     ❌ DELETE
├── okr-sticky/
│   └── stores/
│       └── edit-mode.store.ts                      ✅ Edit state
│   └── state/                                       ❌ DELETE (duplicate)
```

### Total Estimated Cleanup:

| Action                                     | Lines Removed |
| ------------------------------------------ | ------------- |
| Delete duplicate edit-mode.store.ts        | 411           |
| Delete sync-clarification-state.service.ts | 271           |
| **Total**                                  | **682**       |

---

## 6. Migration Checklist

- [ ] 1. Remove `app/renderer/src/app/okr-sticky/state/` directory
- [ ] 2. Update `clarification-wizard.component.ts` to use `ClarificationStateMachine`
- [ ] 3. Fix duplicate imports in `clarification-wizard.component.ts`
- [ ] 4. Update `clarification-orchestrator.service.ts` to use `ClarificationStateMachine`
- [ ] 5. Delete `sync-clarification-state.service.ts`
- [ ] 6. Update unit tests to use `ClarificationStateMachine`
- [ ] 7. Run full test suite
- [ ] 8. Verify build passes

---

## Appendix: Interface Audit

### ClarificationState Interface

**Location:** `app/renderer/src/app/clarification/interfaces/clarification-state.interface.ts`

**Status:** ⚠️ Interface defines writable signals that don't exist in implementation

```typescript
export interface IClarificationState {
  // These are all Signal<T> in interface
  workflowState: Signal<WorkflowState>;
  currentPrompt: Signal<ClarificationPrompt | null>;
  // ...

  // But ClarificationStateMachine exposes them as readonly computed
  // This is technically correct but naming is confusing
}
```

**Recommendation:** Interface should use `Signal<T>` (read-only) or `WritableSignal<T>` (read-write) explicitly

---

_End of Audit Report_
