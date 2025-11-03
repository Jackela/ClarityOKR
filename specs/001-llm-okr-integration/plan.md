# Implementation Plan: Integrate Real LLM for Clarification & OKR Generation

**Branch**: `001-llm-okr-integration` | **Date**: 2025-11-02 | **Spec**: /mnt/d/Code/ClarityOKR/specs/001-llm-okr-integration/spec.md
**Input**: Feature specification from `/specs/001-llm-okr-integration/spec.md`

## Summary

Deliver real-time LLM-driven clarification and OKR draft generation. All LLM calls are centralized behind an internal agent method, validated against shared contracts, with graceful error handling and TDD-first integration tests stubbing HTTP at the network layer.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20.x, Angular 17, Electron 30  
**Primary Dependencies**: Electron IPC/contextBridge, RxJS 7, @ngrx/component-store, zod, Playwright (Electron E2E), nock (HTTP stubbing for Node), msw (optional for renderer)  
**Storage**: In-memory session state (no persistent storage for prompts/outputs)  
**Testing**: Jest for unit and Node integration (nock); Playwright for Electron E2E  
**Target Platform**: Electron desktop (Windows/macOS/Linux)  
**Project Type**: Desktop application (Electron main + Angular renderer)  
**Performance Goals**: Clarification <= 2s p95; OKR draft <= 10s p90  
**Constraints**: Non-streaming UX; secrets never exposed to renderer; ESM-only modules; TS strict  
**Scale/Scope**: Single-user desktop sessions; moderate concurrency limited to user actions

## Constitution Check

- **Stack Compliance**: Uses pure TypeScript stack with Electron, Node.js, Angular; ESM-only; TS `strict: true`.
- **Architecture Discipline**: Centralized agent boundary for LLM calls; SOLID responsibilities (service for orchestration, validator for schemas, store for state). Fail-fast typed errors.
- **Test-First Readiness**: Integration tests planned for success, validation-repair, timeout, and error paths before implementation.
- **SSOT Alignment**: Shared contracts to be introduced/updated for Clarification and OkrDraft types; all layers import these.
- **Documentation Coverage**: JSDoc planned for public surfaces; quickstart and contracts delivered with this plan.

## Project Structure

### Documentation (this feature)

```text
specs/001-llm-okr-integration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── checklists/
```

### Source Code (repository root)

```text
app/
├── main/                # Electron main (LLM calls, env handling)
├── renderer/            # Angular app (clarification UI, OKR view)

packages/
└── contracts            # Shared contracts package

tests/
├── unit/                # Jest (unit)
├── integration/         # Jest + nock (integration)
└── e2e/                 # Playwright (Electron)
```

**Structure Decision**: Single-project Electron app with clear main/renderer split; services encapsulate agent logic; validators enforce response structure.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 2: Implementation Plan (TDD-first)

### Test Matrix (write first)
- Clarification next-question
  - Success: valid structured response → renders next question/options
  - Validation fail → single repair attempt succeeds
  - Validation fail → repair fails → friendly error + retry
  - Timeout → loading → timeout message + retry; idempotent state
  - Provider error (4xx/5xx/429) → message + retry, context preserved
- OKR draft generation
  - Success: 1 Objective with 3–5 KRs referencing context
  - Incomplete context → prompt for missing inputs or proceed with labeled assumptions
  - Timeout / 429 / 5xx → message + retry; no data loss

### TDD Sequence
1) Contracts + validators: write failing tests for schema validation and repair path
2) Service refactor: write failing integration tests for `OkrAgentService` using network stubs
3) Electron main env loader: tests verifying key presence and non-exposure to renderer
4) IPC endpoints: tests for request/response validation at boundaries
5) UI store/flows: tests for loading states, retries, idempotence
6) Telemetry hooks: tests for counters and latency buckets (content-free)

### Work Breakdown
- Contracts/Validation
  - Add shared interfaces for Clarification and OKR draft (mirror OpenAPI)
  - Implement zod validators for request/response shapes and counts
  - Add helper for one-shot repair attempt (e.g., coercion/reshape)
- OkrAgentService
  - Refactor to include `private async callLlmApi(...)`
  - Centralize validation, retries, and logging inside this method
  - Public methods: `getNextQuestion(context, lastChoice)`, `generateDraft(context)`
- Electron Main
  - Load `.env` and read `LLM_API_KEY`, optional `LLM_BASE_URL`, `LLM_MODEL`
  - Register typed IPC handlers; never pass secrets to renderer
- Renderer (Angular)
  - Update clarification flow to call IPC endpoints; manage loading/error/retry
  - Draft view renders 1 Objective (3–5 KRs) with add-more capability
- Tests
  - Integration (nock): simulate provider responses for all matrix cases
  - E2E (Playwright): primary happy paths and visible error/retry behaviors
- Telemetry (non-PII)
  - Capture: call count, error reason, latency buckets
  - Surface via dev logs or lightweight metrics sink

### Rollout & Verification
- Dev verification checklist: env present, secrets not exposed, tests green
- Performance spot-checks: p95 next-question <2s, p90 draft <10s (local baseline)
- User acceptance: tailored-question perception and draft alignment spot-checks

### Risks & Mitigations
- Provider variability → keep provider-agnostic client and strict boundary validation
- Latency spikes → clear loading, retry, and cancel; telemetry for visibility
- Schema drift → SSOT contracts and validators; CI to gate changes

## Post-Design Constitution Check

- Stack remains pure TypeScript with Electron/Node/Angular and ESM-only modules.
- SOLID/DDD boundaries defined (agent service, validators, stores) with fail-fast errors.
- TDD plan intact: integration tests with nock at network layer before implementation; E2E via Playwright.
- SSOT enforced: contracts defined in `specs/001-llm-okr-integration/contracts/openapi.yaml` to be mirrored in shared interfaces.
- Documentation planned: JSDoc for public surfaces; quickstart and contracts included.

All gates pass; no violations to justify.
