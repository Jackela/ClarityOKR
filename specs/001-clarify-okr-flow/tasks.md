---

description: "Task list template for feature implementation"
---

# Tasks: Clarify-to-OKR Desktop Flow

**Input**: Design documents from `/specs/001-clarify-okr-flow/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are MANDATORY. Capture failing tests (unit, integration, contract) before implementation tasks per the TDD/BDD workflow.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Configure pnpm workspace and align package scripts in `package.json` + `pnpm-workspace.yaml`
- [X] T002 Install Electron 30, Angular 17, Jest, Playwright, `@ngrx/component-store`, and `zod` dependencies via `pnpm` manifests
- [X] T003 Enforce TypeScript `strict: true` and ESM settings across `tsconfig.json` files in `app/main`, `app/renderer`, and `packages/contracts`
- [X] T004 Initialize linting (`eslint`, `prettier`) and formatting pipelines with npm scripts in repository root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Scaffold shared contract module in `packages/contracts/src/clarify-to-okr.contract.ts` with Clarification + OKR interfaces
- [X] T006 Build IPC channel constants and type-safe bridge in `app/main/bootstrap/ipc-channels.ts` and `app/renderer/src/app/shared/ipc-channel.tokens.ts`
- [X] T007 Implement `zod` validators mirroring contract types in `packages/contracts/src/validators/clarify-to-okr.validator.ts`
- [X] T008 Create persistence repository with local JSON read/write in `app/main/persistence/session-repository.ts`
- [X] T009 Configure Electron preload + contextBridge exposure in `app/main/bootstrap/preload.ts`
- [X] T010 Set up Playwright Electron test runner configuration in `tests/e2e/playwright.config.ts`
- [X] T011 Establish CI scripts for `lint`, `test:unit`, `test:component`, `test:e2e` in `.github/workflows/clarify-okr.yml`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Guided Clarification Interview (Priority: P1) 🎯 MVP

**Goal**: Deliver button-driven clarification flow that surfaces mutually exclusive prompts and unlocks “生成 OKR” when intent is ready

**Independent Test**: Launch dev app, walk through ambiguous intent using button answers, observe validation of option counts, and verify “生成 OKR” enables with summarized intent

### Tests for User Story 1 (MANDATORY - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Author ClarificationSession component-store unit specs in `tests/unit/clarification/clarification-store.spec.ts`
- [X] T013 [P] [US1] Create Angular component BDD spec for prompt wizard in `app/renderer/src/app/clarification/components/clarification-wizard.component.spec.ts`
- [X] T014 [P] [US1] Script Playwright scenario for interview flow in `tests/e2e/clarification/interview-flow.spec.ts``

### Implementation for User Story 1

- [X] T015 [US1] Implement clarification component store with option validation in `app/renderer/src/app/clarification/state/clarification.store.ts`
- [X] T016 [US1] Build clarification wizard UI with button options in `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`
- [X] T017 [US1] Wire agent orchestration service to IPC bridge in `app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts`
- [X] T018 [US1] Handle agent question generation + fail-fast validation in `app/main/windows/clarification-controller.ts`
- [X] T019 [US1] Persist ClarificationSession progression in `app/main/persistence/session-repository.ts`
- [X] T020 [US1] Emit user action logs for prompt selections in `app/main/persistence/session-repository.ts`
- [X] T021 [US1] Update shared contracts changelog + JSDoc in `packages/contracts/CHANGELOG.md` and `packages/contracts/src/clarify-to-okr.contract.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Sticky OKR Visualization (Priority: P2)

**Goal**: Present generated OKR in always-on-top sticky window with hierarchical display of Objective and Key Results

**Independent Test**: Trigger OKR generation, confirm sticky note opens, remains on top across app switches, and renders Objective + Key Results tree correctly

### Tests for User Story 2 (MANDATORY - write first) ⚠️

- [ ] T022 [P] [US2] Add Jest specs for OKR view models in `tests/unit/okr-sticky/okr-view-model.spec.ts`
- [ ] T023 [P] [US2] Create component test verifying tree/list rendering in `tests/component/okr-sticky/okr-sticky.component.spec.ts`
- [ ] T024 [P] [US2] Extend Playwright scenario to assert always-on-top behavior in `tests/e2e/okr-sticky/sticky-window.spec.ts`
- [ ] T025 [P] [US2] Add Playwright scenario verifying sticky note reopen after window close in `tests/e2e/okr-sticky/sticky-window-reopen.spec.ts`

### Implementation for User Story 2

- [ ] T026 [US2] Implement OKR projection service mapping contracts to view model in `app/renderer/src/app/okr-sticky/services/okr-projection.service.ts`
- [ ] T027 [US2] Build sticky note component with Angular CDK Overlay in `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`
- [ ] T028 [US2] Configure always-on-top BrowserWindow controller in `app/main/windows/sticky-window-manager.ts`
- [ ] T029 [US2] Render hierarchical Objective/Key Results template + styling in `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.html`
- [ ] T030 [US2] Persist OKRDocument snapshot to disk upon generation in `app/main/persistence/okr-repository.ts`
- [ ] T031 [US2] Log “generate” action entries in `app/main/persistence/action-log-writer.ts`
- [ ] T032 [US2] Document sticky window API surface via JSDoc in `app/main/windows/sticky-window-manager.ts`
- [ ] T033 [US2] Implement sticky-window reopen handler in `app/main/windows/sticky-window-manager.ts`
- [ ] T034 [US2] Expose reopen trigger in sticky note UI + menu in `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Editable OKR Control (Priority: P3)

**Goal**: Enable manual editing, regenerate controls, and clipboard export for OKR note while preserving user adjustments

**Independent Test**: Toggle edit mode, adjust Objective/key results, save, test regenerate overwrite/append prompts, and copy OKR to clipboard verifying markdown format

### Tests for User Story 3 (MANDATORY - write first) ⚠️

- [ ] T035 [P] [US3] Write unit tests for edit state reducer in `tests/unit/okr-sticky/edit-mode.store.spec.ts`
- [ ] T036 [P] [US3] Add component spec covering edit toggle + validation in `tests/component/okr-sticky/okr-editing.component.spec.ts`
- [ ] T037 [P] [US3] Implement Playwright scenario for edit, regenerate, and copy flow in `tests/e2e/okr-sticky/edit-regenerate-copy.spec.ts`

### Implementation for User Story 3

- [ ] T038 [US3] Implement edit mode store handling manual edits in `app/renderer/src/app/okr-sticky/state/edit-mode.store.ts`
- [ ] T039 [US3] Add editable template states and save actions in `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`
- [ ] T040 [US3] Implement regenerate command with overwrite/append policy in `app/main/windows/sticky-window-manager.ts`
- [ ] T041 [US3] Persist manual edit history to disk in `app/main/persistence/okr-repository.ts`
- [ ] T042 [US3] Build clipboard exporter producing markdown in `app/main/windows/clipboard-exporter.ts`
- [ ] T043 [US3] Prompt user confirmations and log regenerate/copy actions in `app/main/persistence/action-log-writer.ts`
- [ ] T044 [US3] Update shared documentation + contracts for regenerate/clipboard behaviors in `packages/contracts/docs/clarify-to-okr.md`

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T045 Validate localization hooks for prompts and OKR text in `app/renderer/src/app/shared/i18n/messages.zh-CN.json`
- [ ] T046 Harden accessibility (keyboard navigation, ARIA roles) in `app/renderer/src/app/clarification/components/clarification-wizard.component.html`
- [ ] T047 [P] Refresh quickstart and README instructions in `quickstart.md` and `README.md`
- [ ] T048 [P] Instrument clarification telemetry (step counts, completion outcomes) in `app/renderer/src/app/clarification/services/clarification-telemetry.service.ts`
- [ ] T049 [P] Author telemetry unit specs in `tests/unit/clarification/clarification-telemetry.service.spec.ts`
- [ ] T050 Capture user clarity feedback UI in `app/renderer/src/app/okr-sticky/components/okr-feedback.component.ts`
- [ ] T051 [P] Extend analytics dashboards with step and clarity metrics in `docs/analytics/clarify-okr-insights.md`
- [ ] T052 Perform performance profiling scripts capturing render timings in `tests/e2e/perf/clarify-okr.metrics.ts`
- [ ] T053 Run packaging smoke test and document results in `docs/releases/clarify-okr-desktop.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 completion for OKR payload availability
- **User Story 3 (P3)**: Depends on User Story 2 completion for sticky window infrastructure

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Stores/services before UI components when dependencies exist
- Renderer updates before main-process integrations only when IPC contracts already satisfied
- Persisted data updates before analytics logging to avoid inconsistent records

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (none designated)
- In Foundational phase, tasks interacting with separate directories (contracts, IPC, persistence, CI) can be parallelized once interfaces agreed
- Within US1, T015/T016 may proceed in parallel once state schema defined, while T017 waits on IPC bridge
- Within US2, T026 and T027 can progress independently after contracts complete, with T029 following component scaffolding
- Within US3, T038 and T039 can proceed in parallel; regenerate manager updates (T040) must wait for sticky window foundation

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
pnpm test --filter clarification-store.spec.ts
pnpm test --filter prompt-wizard.component.spec.ts
pnpm exec playwright test clarification/interview-flow.spec.ts

# Launch all models/services for User Story 1 together:
pnpm run build:renderer
pnpm run build:main
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
