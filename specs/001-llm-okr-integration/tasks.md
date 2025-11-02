---

description: "Task list for LLM-driven clarification and OKR generation"
---

# Tasks: Integrate Real LLM for Clarification & OKR Generation

**Input**: Design documents from `specs/001-llm-okr-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are MANDATORY. Write failing tests before implementation tasks per TDD/BDD.

## Format: `[ID] [P] [Story] Description`

- [P]: Can run in parallel (no file conflict)
- [Story]: US1 (Clarification), US2 (OKR Draft), US3 (Resilience)
- Include exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] [ALL] Ensure `.env` is ignored (verify `.gitignore` contains `.env`, `.env.*`) in `.gitignore`
- [X] T002 [P] [ALL] Add test runner config (NEEDS CLARIFICATION: Jest vs existing) in `package.json` and `tests/`
- [X] T003 [P] [ALL] Add `nock` and configure Node HTTP mocking in `tests/integration/setup.ts`
- [X] T004 [P] [ALL] Add Playwright Electron config for E2E in `tests/e2e/playwright.config.ts`
- [X] T005 [P] [ALL] Create validators scaffolding in `src/validators/clarification.ts` and `src/validators/okr.ts`
- [X] T006 [P] [ALL] Create shared interfaces module (SSOT) in `src/models/contracts.ts` aligned to `contracts/openapi.yaml`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T010 [ALL] Electron main: load `.env` and read `LLM_API_KEY`, `LLM_BASE_URL?`, `LLM_MODEL?` in `src/main/env.ts`; unit tests in `tests/unit/main/env.spec.ts`
- [X] T011 [ALL] Electron main: expose typed IPC handlers (without secrets) in `src/main/ipc.llm.ts`; tests in `tests/integration/ipc.llm.spec.ts`
- [X] T012 [ALL] Service refactor: introduce `OkrAgentService` with `private async callLlmApi(...)` in `src/services/okr-agent.service.ts`; no implementation yet; tests red in `tests/integration/okr-agent.spec.ts`
- [X] T013 [P] [ALL] Implement zod validators for `ClarificationQuestion`, `OkrDraft` shapes per `contracts/openapi.yaml` in `src/validators/*`; unit tests in `tests/unit/validators/*.spec.ts`
- [X] T014 [P] [ALL] Add idempotent retry helper and timeout wrapper in `src/lib/retry-timeout.ts`; unit tests in `tests/unit/lib/retry-timeout.spec.ts`

**Checkpoint**: Foundation ready (env, IPC, validators, test harness)

---

## Phase 3: User Story 1 - Real-time Clarification (P1) 🎯 MVP

### Tests (write first)
- [X] T020 [P] [US1] Integration: next-question success (valid JSON) → renders question/options in `tests/integration/clarification.success.spec.ts`
- [X] T021 [P] [US1] Integration: validation fail → single repair succeeds in `tests/integration/clarification.repair.spec.ts`
- [X] T022 [P] [US1] Integration: validation fail → repair fails → friendly error + retry in `tests/integration/clarification.error.spec.ts`
- [X] T023 [P] [US1] Integration: timeout → loading → timeout message + retry; no duplicate turns in `tests/integration/clarification.timeout.spec.ts`
- [X] T024 [P] [US1] Integration: provider errors (400/429/500) → message + retry in `tests/integration/clarification.provider-errors.spec.ts`

### Implementation
- [X] T025 [US1] Implement `callLlmApi(...)` with validation + single repair + error mapping in `src/services/okr-agent.service.ts`
- [X] T026 [US1] Implement `getNextQuestion(context, lastChoice)` using `callLlmApi` in `src/services/okr-agent.service.ts`
- [X] T027 [US1] Wire IPC endpoint `clarification/next-question` in `src/main/ipc.llm.ts`
- [X] T028 [US1] Renderer store/effects: loading, debounce, retry, idempotent updates in `src/renderer/state/clarification.store.ts`
- [X] T029 [US1] UI: show next question/options, loading, and error messages in `src/renderer/components/clarification/*`

**Checkpoint**: US1 independently functional and testable

---

## Phase 4: User Story 2 - Real-time OKR Draft (P2)

### Tests (write first)
- [X] T030 [P] [US2] Integration: draft success (1 Objective with 3–5 KRs) in `tests/integration/draft.success.spec.ts`
- [X] T031 [P] [US2] Integration: incomplete context → prompt for missing inputs or label assumptions in `tests/integration/draft.incomplete.spec.ts`
- [X] T032 [P] [US2] Integration: timeout/429/5xx → message + retry in `tests/integration/draft.errors.spec.ts`

### Implementation
- [X] T033 [US2] Implement `generateDraft(context)` using `callLlmApi` in `src/services/okr-agent.service.ts`
- [X] T034 [US2] Wire IPC endpoint `okr/draft` in `src/main/ipc.llm.ts`
- [X] T035 [US2] Renderer: OKR draft view (1 Objective, 3–5 KRs) with add-more in `src/renderer/components/okr/*`

**Checkpoint**: US1 and US2 independently functional

---

## Phase 5: User Story 3 - Resilience & Transparency (P3)

### Tests (write first)
- [X] T040 [P] [US3] Unit: timeout thresholds surface non-blocking notice in `tests/unit/ui/timeout.spec.ts`
- [X] T041 [P] [US3] Integration: retry preserves context; no duplication in `tests/integration/retry.idempotence.spec.ts`
- [X] T042 [P] [US3] Unit: telemetry counters and latency buckets (content-free) in `tests/unit/telemetry/metrics.spec.ts`

### Implementation
- [X] T043 [US3] Implement user-facing timeout and retry UX in `src/renderer/components/common/loading.ts`
- [X] T044 [US3] Implement idempotent retry handling in store/effects in `src/renderer/state/common/retry.ts`
- [X] T045 [US3] Implement telemetry (counts, reasons, latency) in `src/services/telemetry.ts`

**Checkpoint**: All three user stories independently functional

---

## Phase 6: E2E & Docs

- [X] T050 [P] [ALL] Playwright E2E: US1 happy path (clarification → dynamic next question) in `tests/e2e/specs/clarification/*`
- [X] T051 [P] [ALL] Playwright E2E: US2 happy path (generate draft) in `tests/e2e/specs/llm/draft.e2e.spec.ts`
- [X] T052 [P] [ALL] JSDoc: public services and IPC handlers updated across `src/**`
- [X] T053 [P] [ALL] Validate `quickstart.md` instructions and update if needed

---

## Dependencies & Execution Order

- Foundational (Phase 2) blocks all user stories
- Within each story: write tests first; ensure they fail; then implement
- Parallel: tasks marked [P] can run concurrently

## Notes

- Integration tests MUST use `nock` to stub HTTP (no service mocks)
- Secrets MUST remain in main process; renderer never receives keys
- Non-streaming UX: show results when complete
- Initial draft: 1 Objective with 3–5 KRs; users can add more











