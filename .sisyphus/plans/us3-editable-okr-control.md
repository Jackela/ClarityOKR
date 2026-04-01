# Sisyphus Work Plan: User Story 3 - Editable OKR Control

**Plan ID**: us3-editable-okr-control  
**Branch**: 001-clarify-okr-flow  
**Created**: 2026-03-27  
**Status**: In Progress  
**Depends on**: us2-sticky-okr-viz (completed)

## Context

User Story 2 (Sticky OKR Visualization) is complete. Now implementing User Story 3 which enables manual editing, regeneration, and clipboard export for the OKR note.

**Goal**: Enable manual editing, regenerate controls, and clipboard export for OKR note while preserving user adjustments.

## Prerequisites

- User Story 2 implementation complete ✅
- Sticky window infrastructure in place ✅
- OKR Repository for persistence ✅
- Action Log Writer for analytics ✅

## Implementation Tasks

### Phase 1: Tests First (TDD)

#### T035 [P] [US3] Edit State Reducer Unit Tests

**File**: `tests/unit/okr-sticky/edit-mode.store.spec.ts`  
**Purpose**: Test edit mode state management  
**Test Cases**:

- Toggle edit mode on/off
- Update objective text
- Update key result text
- Save edits
- Cancel edits (revert)
- Track dirty state (has unsaved changes)
- Validate input (max length)
- Handle empty values

**Expected**: Tests fail initially (red)

---

#### T036 [P] [US3] OKR Editing Component Tests

**File**: `tests/component/okr-sticky/okr-editing.component.spec.ts`  
**Purpose**: Component-level edit functionality tests  
**Test Cases**:

- Edit button toggles edit mode
- Input fields appear in edit mode
- Save button saves changes
- Cancel button discards changes
- Validation messages display
- Character counters work
- Disable save when no changes
- Error state handling

**Expected**: Tests fail initially (red)

---

#### T037 [P] [US3] Edit, Regenerate, Copy E2E Test

**File**: `tests/e2e/okr-sticky/edit-regenerate-copy.spec.ts`  
**Purpose**: End-to-end workflow test  
**Test Steps**:

1. Generate OKR and open sticky window
2. Click edit button, modify objective text
3. Save changes, verify display updated
4. Click regenerate, choose "overwrite"
5. Verify OKR regenerated with new content
6. Click regenerate again, choose "append"
7. Verify OKR appended, not overwritten
8. Click copy to clipboard
9. Verify clipboard contains markdown format

**Expected**: Playwright test fails initially (red)

---

### Phase 2: Implementation

#### T038 [US3] Edit Mode Store

**File**: `app/renderer/src/app/okr-sticky/state/edit-mode.store.ts`  
**Purpose**: State management for edit mode  
**Requirements**:

- Create EditModeStore service
- Manage state: `isEditing`, `draftObjective`, `draftKeyResults`, `isDirty`
- Actions: `enterEditMode()`, `exitEditMode()`, `updateObjective()`, `updateKeyResult()`, `save()`, `cancel()`
- Use Angular Signals (follow existing patterns)
- Integrate with OkrStickyGatewayService

**Interface**:

```typescript
export interface EditModeState {
  isEditing: boolean;
  originalObjective: string;
  originalKeyResults: KeyResult[];
  draftObjective: string;
  draftKeyResults: DraftKeyResult[];
  isDirty: boolean;
  isValid: boolean;
  errors: ValidationError[];
}

export interface DraftKeyResult {
  id: string;
  statement: string;
  successMetric: string | null;
  isValid: boolean;
}
```

**Validation Rules**:

- Objective max 200 characters
- Key Result statement max 180 characters
- At least 1 Key Result required

---

#### T039 [US3] Editable Template States

**File**: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`  
**Purpose**: Add edit mode UI to sticky note  
**Requirements**:

- Add edit button to header (when not in edit mode)
- Add save/cancel buttons (when in edit mode)
- Toggle between view and edit templates
- Use InputComponent for editable fields
- Show character counters
- Display validation errors
- Use EditModeStore for state management
- Update template to use `*ngIf="editStore.isEditing()"`

**Template Structure**:

```html
<!-- View Mode -->
<div *ngIf="!editStore.isEditing()" class="okr-view-mode">
  <button (click)="editStore.enterEditMode()">编辑</button>
  <!-- Display current OKR -->
</div>

<!-- Edit Mode -->
<div *ngIf="editStore.isEditing()" class="okr-edit-mode">
  <input [(ngModel)]="editStore.draftObjective" />
  <div *ngFor="let kr of editStore.draftKeyResults()">
    <input [(ngModel)]="kr.statement" />
  </div>
  <button (click)="saveEdits()" [disabled]="!editStore.isDirty() || !editStore.isValid()">
    保存
  </button>
  <button (click)="editStore.cancel()">取消</button>
</div>
```

---

#### T040 [US3] Regenerate Command

**File**: `app/main/src/windows/sticky-window-manager.ts`  
**Purpose**: Implement regenerate with overwrite/append policy  
**Requirements**:

- Add `regenerateOkr(sessionId: string, policy: 'overwrite' | 'append'): Promise<void>` method
- Call LLM to generate new OKR based on clarified intent
- If policy is 'overwrite': replace current OKR
- If policy is 'append': add new Key Results to existing OKR
- Show confirmation dialog before regenerating
- Log regenerate action via ActionLogWriter
- Persist new OKR to repository
- Broadcast to renderer via IPC

**IPC Channel**: `OKR_REGENERATE` (already defined)

**Flow**:

1. User clicks "重新生成"
2. Show dialog: "Overwrite existing OKR?" / "Append to existing OKR?"
3. Call LLM with stored clarification context
4. Generate new OKR draft
5. Apply policy (overwrite or append)
6. Save to repository
7. Broadcast update to renderer
8. Log action

---

#### T041 [US3] Persist Manual Edit History

**File**: `app/main/src/persistence/okr-repository.ts`  
**Purpose**: Save manual edit history  
**Requirements**:

- Update `save(okr: OKRDocument)` to track manual edits
- When saving edited OKR, append to `manualEdits` array
- Store: field path, previous value, new value, timestamp
- Implement `recordEdit(okrId: string, edit: ManualEditRecord): Promise<void>`
- Update `OKRDocument` to include edit history in response

**Edit Record Structure**:

```typescript
interface ManualEditRecord {
  editId: string;
  fieldPath: string; // e.g., "objective" or "keyResults[0].statement"
  previousValue: string;
  newValue: string;
  editedAt: string; // ISO timestamp
}
```

---

#### T042 [US3] Clipboard Exporter

**File**: `app/main/src/windows/clipboard-exporter.ts`  
**Purpose**: Export OKR to clipboard in markdown format  
**Requirements**:

- Create ClipboardExporter service
- Method: `exportOkrToClipboard(okr: OKRDocument): Promise<void>`
- Format as markdown bullet list:

  ```markdown
  ## Objective

  - {objective text}

  ## Key Results

  - {KR 1 statement} ({metric})
  - {KR 2 statement} ({metric})
  - ...
  ```

- Use Electron clipboard API
- Handle errors (permissions, empty content)
- Return success/failure status

**IPC Channel**: `CLIPBOARD_EXPORT` (already defined)

---

#### T043 [US3] Log Regenerate/Copy Actions

**File**: `app/main/src/persistence/action-log-writer.ts`  
**Purpose**: Log user actions for analytics  
**Requirements**:

- Use existing ActionLogWriter
- Call `logRegenerate()` when user regenerates OKR
- Call `logCopy()` when user copies to clipboard
- Include policy (overwrite/append) in regenerate log
- Include OKR summary in copy log
- Ensure all actions are timestamped

---

#### T044 [US3] Update Documentation

**File**: `packages/contracts/docs/clarify-to-okr.md`  
**Purpose**: Document regenerate and clipboard behaviors  
**Requirements**:

- Document regenerate API
- Document clipboard export format
- Document edit mode behavior
- Update data model documentation
- Add usage examples

---

## Dependencies & Execution Order

### Test Dependencies

T035, T036, T037 can be written in parallel

### Implementation Dependencies

```
T038 (Edit Mode Store)
  ↓
T039 (Editable Template) ← T036 tests pass
  ↓
T040 (Regenerate Command) ← T037 tests pass
  ↓
T041 (Edit History) ← Data persistence
  ↓
T042 (Clipboard) ← T037 tests pass
  ↓
T043 (Action Logging) ← Analytics
  ↓
T044 (Documentation) ← Final polish
```

## Parallel Opportunities

**Phase 1 (Tests)**: All 3 test tasks can run in parallel

**Phase 2 (Implementation)**:

- T038 + T039 can proceed together
- T040 + T041 + T042 can proceed in parallel (separate domains)
- T043 happens after T040/T042
- T044 can happen anytime after core implementation

## Success Criteria

- [ ] T035-T037 tests exist and pass
- [ ] User can toggle edit mode on sticky note
- [ ] User can edit objective and key results
- [ ] Changes are saved and persisted
- [ ] Edit history is tracked
- [ ] User can regenerate OKR with overwrite/append options
- [ ] User can copy OKR to clipboard in markdown format
- [ ] All actions are logged
- [ ] Documentation is updated
- [ ] All existing tests still pass (regression check)

## Verification Steps

1. Run new tests: `pnpm run test:unit -- edit-mode` and `pnpm run test:e2e -- edit`
2. Manual test: Open sticky, click edit, modify text, save
3. Manual test: Click regenerate, choose policy, verify result
4. Manual test: Click copy, paste into external editor, verify format
5. Regression: Run full test suite `pnpm run test`

## Notes

- Follow existing patterns from US2 implementation
- Use shared components (InputComponent, ButtonComponent)
- Maintain strict TypeScript with `strict: true`
- Ensure edit mode is accessible (keyboard navigation, ARIA)
- Keep files under 300 lines
