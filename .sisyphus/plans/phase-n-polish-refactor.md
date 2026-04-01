# Sisyphus Work Plan: Phase N - Polish & Code Refactoring

**Plan ID**: phase-n-polish-refactor  
**Branch**: 001-clarify-okr-flow  
**Created**: 2026-03-27  
**Status**: In Progress  
**Depends on**: us3-editable-okr-control (completed)

## Context

User Story 1-3 are complete. Now focusing on:

1. **Phase N**: Polish, localization, accessibility, telemetry, documentation
2. **Code Refactoring**: Make codebase more AI-friendly and maintainable

## Part 1: Phase N - Polish (T045-T053)

### T045 [P] Localization Hooks

**File**: `app/renderer/src/app/shared/i18n/messages.zh-CN.json`  
**Purpose**: Extract all hardcoded Chinese strings  
**Tasks**:

1. Create i18n message files for zh-CN
2. Extract strings from components:
   - "编辑" → `editButtonLabel`
   - "保存" → `saveButtonLabel`
   - "取消" → `cancelButtonLabel`
   - "重新生成" → `regenerateButtonLabel`
   - "复制到剪贴板" → `copyToClipboardLabel`
3. Create `I18nService` for runtime language switching
4. Update all components to use `$localize` or translation pipe

---

### T046 [P] Accessibility Hardening

**File**: `app/renderer/src/app/clarification/components/clarification-wizard.component.html`  
**Purpose**: ARIA roles and keyboard navigation  
**Tasks**:

1. Add `role="main"` to wizard container
2. Add `role="button"` with `tabindex="0"` to option cards
3. Add `aria-label` to all interactive elements
4. Implement keyboard navigation:
   - Tab/Shift+Tab for focus
   - Enter/Space to select
   - Escape to cancel
5. Add `aria-live="polite"` for status updates
6. Test with screen reader

---

### T047 [P] Documentation Refresh

**Files**: `quickstart.md`, `README.md`  
**Purpose**: Update setup instructions  
**Tasks**:

1. Update README with:
   - New features (US2, US3)
   - Screenshots/GIFs
   - Installation steps
   - Development workflow
2. Update quickstart.md with:
   - Prerequisites (Node 20, pnpm)
   - Step-by-step setup
   - Common issues
3. Add architecture diagram
4. Add contributing guide

---

### T048 [P] Clarification Telemetry

**File**: `app/renderer/src/app/clarification/services/clarification-telemetry.service.ts`  
**Purpose**: Track user interactions  
**Tasks**:

1. Create telemetry service
2. Track metrics:
   - Step completion time
   - Option selection patterns
   - Drop-off points
   - Completion rate
3. Send to analytics endpoint (or log locally)
4. Respect privacy settings

---

### T049 [P] Telemetry Unit Tests

**File**: `tests/unit/clarification/clarification-telemetry.service.spec.ts`  
**Purpose**: Test telemetry service  
**Tasks**:

1. Mock analytics endpoint
2. Test tracking methods
3. Test privacy compliance
4. Verify data format

---

### T050 Feedback UI

**File**: `app/renderer/src/app/okr-sticky/components/okr-feedback.component.ts`  
**Purpose**: User clarity feedback  
**Tasks**:

1. Create feedback component
2. Add thumbs up/down buttons
3. Add comment textarea
4. Submit to feedback API
5. Show confirmation

---

### T051 [P] Analytics Dashboard

**File**: `docs/analytics/clarify-okr-insights.md`  
**Purpose**: Document analytics  
**Tasks**:

1. Define metrics:
   - Conversion funnel (intent → clarification → OKR)
   - Edit frequency
   - Regenerate patterns
   - Copy usage
2. Create dashboard mockups
3. Document data schema
4. Add query examples

---

### T052 [P] Performance Profiling

**File**: `tests/e2e/perf/clarify-okr.metrics.ts`  
**Purpose**: Capture render timings  
**Tasks**:

1. Create Playwright performance tests
2. Measure:
   - Time to first paint
   - Clarification step transition time
   - OKR generation time
   - Edit mode switch time
3. Set performance budgets
4. Generate reports

---

### T053 [P] Packaging Smoke Test

**File**: `docs/releases/clarify-okr-desktop.md`  
**Purpose**: Release testing  
**Tasks**:

1. Create release checklist
2. Test packaging on macOS
3. Test packaging on Windows
4. Document known issues
5. Add auto-update notes

---

## Part 2: Code Refactoring (RF001-RF010)

### RF001 Split Large Components

**Files**:

- `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts` (too large)
- `app/main/src/windows/sticky-window-manager.ts` (500+ lines)

**Approach**:

1. Extract presentational components:
   - `okr-view-mode.component.ts`
   - `okr-edit-mode.component.ts`
   - `okr-actions.component.ts`
2. Keep container component as orchestrator
3. Update tests

---

### RF002 Service Layer Consolidation

**Goal**: Reduce service fragmentation

**Actions**:

1. Merge related services:
   - `OkrStickyGatewayService` + `OkrProjectionService`
2. Create facade pattern for complex operations
3. Add service index exports

---

### RF003 Type Safety Improvements

**Goal**: Remove any types, add strict contracts

**Actions**:

1. Audit all `any` types
2. Replace with strict types
3. Add runtime validation with Zod
4. Update contracts package

---

### RF004 Test Organization

**Goal**: Consistent test structure

**Actions**:

1. Move all tests to `tests/` directory
2. Standardize naming:
   - `*.spec.ts` for unit
   - `*.test.ts` for component
   - `*.e2e.ts` for E2E
3. Create test utilities library

---

### RF005 Documentation Standardization

**Goal**: Every public API has JSDoc

**Actions**:

1. Add ESLint rule: require JSDoc
2. Document all services
3. Document all components
4. Add @usage examples

---

### RF006 Error Handling Patterns

**Goal**: Consistent error handling

**Actions**:

1. Create custom error classes
2. Add error boundaries
3. Implement retry logic
4. Add user-friendly error messages

---

### RF007 State Management Audit

**Goal**: Simplify state flow

**Actions**:

1. Audit signal usage
2. Remove redundant states
3. Consolidate stores
4. Add state diagrams

---

### RF008 File Naming Convention

**Goal**: Consistent naming

**Actions**:

1. Rename files to match pattern:
   - `feature.type.ts` (e.g., `edit-mode.store.ts`)
2. Update imports
3. Add path aliases

---

### RF009 Dead Code Removal

**Goal**: Remove unused code

**Actions**:

1. Run coverage analysis
2. Remove unused exports
3. Remove commented code
4. Clean up dependencies

---

### RF010 Architecture Documentation

**Goal**: Document architecture decisions

**Actions**:

1. Create ADR (Architecture Decision Records)
2. Document:
   - Why Signals over RxJS
   - Why SQLite over files
   - Why Angular over React
3. Add diagrams
4. Update AGENTS.md

---

## Execution Strategy

### Parallel Execution Groups

**Group A - Polish (Independent)**:

- T045 (Localization)
- T046 (Accessibility)
- T047 (Documentation)
- T050 (Feedback UI)
- T051 (Analytics docs)

**Group B - Telemetry (Depends on T048)**:

- T048 (Telemetry service)
- T049 (Telemetry tests)

**Group C - Performance (Independent)**:

- T052 (Performance tests)
- T053 (Packaging)

**Group D - Refactoring (Independent)**:

- RF001-RF010 (All refactoring tasks)

### Order

1. Start all independent tasks (Groups A, C, D) in parallel
2. After T048 completes, start T049
3. Review and merge groups incrementally

## Success Criteria

- [ ] All T045-T053 tasks complete
- [ ] Code coverage > 80%
- [ ] No files > 300 lines
- [ ] All public APIs documented
- [ ] Zero TypeScript `any` types
- [ ] Performance budgets met
- [ ] Accessibility audit passed
- [ ] Documentation complete

## Verification

```bash
# Tests
pnpm run test:unit
pnpm run test:e2e

# Quality
pnpm run lint
pnpm run typecheck

# Performance
pnpm run test:perf

# Build
pnpm run build
```
