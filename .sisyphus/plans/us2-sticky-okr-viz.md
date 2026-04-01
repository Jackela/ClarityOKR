# Sisyphus Work Plan: User Story 2 - Sticky OKR Visualization

**Plan ID**: us2-sticky-okr-viz  
**Branch**: 001-clarify-okr-flow  
**Created**: 2026-03-27  
**Status**: In Progress

## Context

User Story 1 (Clarification Wizard) is complete. Now implementing User Story 2 which creates an always-on-top sticky window to display generated OKRs.

## Existing Infrastructure

From code exploration:

- `app/main/windows/sticky-window-manager.ts` - Window lifecycle management (102 lines)
- `app/renderer/okr-sticky/components/okr-sticky-note.component.ts` - Main UI component (155 lines)
- `app/renderer/okr-sticky/services/okr-projection.service.ts` - Data transformation (41 lines)
- `app/renderer/okr-sticky/services/okr-sticky-gateway.service.ts` - IPC bridge (205 lines)
- Data models in `packages/contracts/src/clarify-to-okr.contract.ts`
- Always-on-top window already configured with proper Electron settings

## Implementation Tasks

### Phase 1: Tests First (TDD)

#### T022 [P] [US2] OKR View Model Unit Tests

**File**: `tests/unit/okr-sticky/okr-view-model.spec.ts`  
**Purpose**: Test OKR to ViewModel transformation logic  
**Test Cases**:

- Transform OKRDocument with 1 Objective + 3-5 KRs
- Handle empty/invalid OKR data
- Test manual edit detection
- Test date formatting
- Test regeneration policy display

**Acceptance**: All tests fail initially (red), then pass after T026 implementation

#### T023 [P] [US2] Sticky Component Test

**File**: `tests/component/okr-sticky/okr-sticky.component.spec.ts`  
**Purpose**: Component rendering and interaction tests  
**Test Cases**:

- Render objective and key results list
- Display metadata badges (generated time, edit status)
- "Add Key Result" button visibility
- Loading state rendering
- Empty state handling

**Acceptance**: Tests fail before T027, pass after

#### T024 [P] [US2] Always-on-Top E2E Test

**File**: `tests/e2e/okr-sticky/sticky-window.spec.ts`  
**Purpose**: Verify sticky window stays on top  
**Test Steps**:

1. Generate OKR through clarification flow
2. Verify sticky window opens
3. Switch to other applications
4. Assert window remains visible on top
5. Verify hierarchical display of Objective + KRs

**Acceptance**: Playwright test passes with real Electron

#### T025 [P] [US2] Window Reopen E2E Test

**File**: `tests/e2e/okr-sticky/sticky-window-reopen.spec.ts`  
**Purpose**: Test sticky window reopen after close  
**Test Steps**:

1. Open sticky window with OKR
2. Close sticky window
3. Trigger reopen action
4. Verify window reappears with same OKR data

**Acceptance**: Playwright test passes

### Phase 2: Implementation

#### T026 [US2] Implement OKR Projection Service

**File**: `app/renderer/src/app/okr-sticky/services/okr-projection.service.ts`  
**Purpose**: Transform OKRDocument domain model to ViewModel for UI  
**Requirements**:

- Map `OKRDocument` → `OkrStickyViewModel`
- Format dates for display (localized)
- Calculate `hasManualEdits` flag
- Handle missing/null fields gracefully
- Pure function, no side effects

**Interface**:

```typescript
export interface OkrProjectionService {
  project(okr: OKRDocument | null): OkrStickyViewModel | null;
}
```

**Validation**: T022 tests pass after implementation

#### T027 [US2] Build Sticky Note Component

**File**: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`  
**Purpose**: Main sticky note UI with OKR display  
**Requirements**:

- Standalone Angular component (OnPush change detection)
- Display Objective as header
- Display KeyResults as hierarchical list
- Show metadata (generation time, edit status)
- "Add Key Result" button with handler
- Loading spinner during initial load
- Error state for failed loads
- Use shared ButtonComponent, CardComponent
- Follow BEM CSS naming from existing .scss file

**Inputs**: ViewModel from projection service  
**Outputs**: User actions (add KR, edit, close)

**Template**: Use existing `okr-sticky-note.component.html`

**Validation**: T023 component tests pass

#### T028 [US2] Configure Always-on-Top BrowserWindow

**File**: `app/main/src/windows/sticky-window-manager.ts`  
**Purpose**: Manage sticky window lifecycle and always-on-top behavior  
**Requirements**:

- Create BrowserWindow with existing configuration:
  - `alwaysOnTop: true`
  - `type: 'toolbar'`
  - `frame: false` (frameless)
  - `titleBarStyle: 'hidden'`
  - `width: 420, height: 560`
  - `setAlwaysOnTop(true, 'screen-saver')`
  - `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
- Handle window close (hide vs destroy)
- Handle window reopen
- Load correct renderer URL with `?view=sticky` query param
- Clean up on app quit

**Methods**:

- `createStickyWindow(okrId: string): Promise<BrowserWindow>`
- `showStickyWindow(): void`
- `hideStickyWindow(): void`
- `reopenStickyWindow(): Promise<void>`

**Validation**: T024, T025 E2E tests pass

#### T029 [US2] Render Hierarchical Objective/KR Template

**File**: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.html`  
**Purpose**: HTML template for sticky note  
**Requirements**:

- Display Objective as prominent header
- List KeyResults with indentation/hierarchy
- Show metadata badges (generation time, edit count)
- Action buttons: Add KR, Edit (for US3), Close, Minimize
- Empty state when no OKR loaded
- Loading state with spinner
- Use CSS classes matching existing .scss file

**Structure**:

```html
<div class="okr-sticky">
  <header class="okr-sticky__header">
    <h2 class="okr-sticky__objective">{{ viewModel.objective }}</h2>
    <div class="okr-sticky__meta">...</div>
  </header>
  <ul class="okr-sticky__key-results">
    <li *ngFor="let kr of viewModel.keyResults">...</li>
  </ul>
  <footer class="okr-sticky__actions">...</footer>
</div>
```

**Validation**: Visual inspection + T023 tests

#### T030 [US2] Persist OKRDocument Snapshot

**File**: `app/main/src/persistence/okr-repository.ts`  
**Purpose**: Repository for OKRDocument persistence  
**Requirements**:

- CRUD operations for OKRDocument
- SQLite storage via database.service
- JSON serialization/deserialization
- Query by sessionId, okrId
- List all OKRs for session
- Implement `Repository<T>` interface pattern

**Methods**:

- `save(okr: OKRDocument): Promise<void>`
- `findById(okrId: string): Promise<OKRDocument | null>`
- `findBySessionId(sessionId: string): Promise<OKRDocument[]>`
- `getLatestForSession(sessionId: string): Promise<OKRDocument | null>`

**Validation**: Integration tests pass, T024/T025 E2E passes

#### T031 [US2] Log "Generate" Action Entries

**File**: `app/main/src/persistence/action-log-writer.ts`  
**Purpose**: Write user action logs for analytics  
**Requirements**:

- Log "generate" action when OKR is created
- Include sessionId, okrId, timestamp
- Include payload summary (objective preview)
- SQLite storage
- Append-only, no deletions

**Interface**:

```typescript
export interface ActionLogWriter {
  logGenerate(sessionId: string, okrId: string, objective: string): Promise<void>;
}
```

**Validation**: Logs appear in database during E2E tests

#### T032 [US2] Document Sticky Window API

**File**: `app/main/src/windows/sticky-window-manager.ts`  
**Purpose**: JSDoc documentation for public API  
**Requirements**:

- Document all public methods with JSDoc
- Include @param, @returns, @throws
- Add @usage examples
- Document window configuration options

**Validation**: ESLint JSDoc rules pass

#### T033 [US2] Implement Sticky Window Reopen Handler

**File**: `app/main/src/windows/sticky-window-manager.ts`  
**Purpose**: Handle STICKY_REOPEN IPC channel  
**Requirements**:

- Register IPC handler for `STICKY_REOPEN` channel
- Retrieve latest OKR for current session
- Recreate window if destroyed, show if hidden
- Handle case where no OKR exists (show message)
- Update ClarificationController facade

**Validation**: T025 E2E test passes

#### T034 [US2] Expose Reopen Trigger in UI

**File**: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`  
**Purpose**: UI control to reopen sticky window  
**Requirements**:

- Add menu/button to reopen closed sticky window
- Send STICKY_REOPEN IPC message
- Show feedback if no OKR available
- Handle window state changes

**Alternative locations**:

- Could be in main app menu
- Could be in system tray (if implemented)
- Could be in clarification wizard

**Decision**: Add to sticky note component's close button as "Minimize to tray" pattern

**Validation**: T025 E2E test passes

## Dependencies & Execution Order

### Test Dependencies

T022, T023, T024, T025 can be written in parallel (all fail initially)

### Implementation Dependencies

```
T026 (Projection Service)
  ↓
T027 (Component) ← T023 tests pass
  ↓
T029 (Template) ← Visual integration
  ↓
T028 (Window Manager) ← T024, T025 tests pass
  ↓
T030 (Repository) ← Data persistence
  ↓
T031 (Action Log) ← Analytics
  ↓
T033 (Reopen Handler) ← T025 tests pass
  ↓
T034 (Reopen UI)
  ↓
T032 (Documentation) ← Final polish
```

## Parallel Opportunities

**Phase 1 (Tests)**: All 4 test tasks can run in parallel

**Phase 2 (Implementation)**:

- T026 + T027 + T029 can proceed together after component structure defined
- T028 + T030 + T031 can proceed in parallel (separate domains)
- T032 (docs) can happen anytime after T028 complete
- T033 + T034 are sequential but can start after core implementation

## Success Criteria

- [ ] T022-T025 tests exist and pass
- [ ] Sticky window opens after "Generate OKR" clicked
- [ ] Window remains always-on-top across app switches (verified in T024)
- [ ] Objective and Key Results display hierarchically
- [ ] Window can be closed and reopened with same data (T025)
- [ ] OKR persists to SQLite (T030)
- [ ] Generate action is logged (T031)
- [ ] All existing tests still pass (regression check)

## Verification Steps

1. Run new tests: `pnpm run test:unit -- okr-sticky` and `pnpm run test:e2e -- okr-sticky`
2. Manual test: Complete clarification flow, click "Generate OKR", verify sticky appears
3. Manual test: Switch between apps, verify sticky stays on top
4. Manual test: Close sticky, reopen from menu, verify data preserved
5. Regression: Run full test suite `pnpm run test`

## Notes

- Follow existing patterns from clarification-wizard component
- Use shared components from `app/renderer/src/app/shared/`
- Maintain strict TypeScript with `strict: true`
- ESM imports only, no CommonJS
- Update contracts package if new IPC channels needed
- Keep files under 300 lines (split if needed)
