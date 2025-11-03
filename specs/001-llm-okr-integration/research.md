# Phase 0 Research: Integrate Real LLM for Clarification & OKR Generation

## Decisions

- Decision: Non-streaming UX for both clarification and OKR draft
  - Rationale: Simpler UI, consistent presentation; aligns with spec choice
  - Alternatives considered: Full streaming; hybrid streaming over threshold

- Decision: Initial OKR draft starts with 1 Objective and 3–5 Key Results; user can add more Objectives after
  - Rationale: Faster first value; lets users progressively elaborate
  - Alternatives considered: 1–3 Objectives by default; fixed 3x3

- Decision: Anonymized, content-free telemetry retained 30 days
  - Rationale: Supports quality monitoring without storing user content
  - Alternatives considered: No telemetry; opt-in full logging

- Decision: Provider-agnostic HTTP client with OpenAI-compatible JSON shape (base URL and model via env)
  - Rationale: Enables swapping providers; common request/response conventions
  - Alternatives considered: Hardcode a single vendor; SDK lock-in

- Decision: Load secrets via Electron main from `.env`; never expose to renderer
  - Rationale: Honors security constraint; renderer communicates via IPC only
  - Alternatives considered: Renderer-side fetch; preload exposure (rejected)

- Decision: Validate responses with shared contracts + zod schemas at the boundary
  - Rationale: Early, typed failure and repair attempt; consistent across calls
  - Alternatives considered: Ad-hoc parsing; UI-layer validation

- Decision: Test strategy uses nock for Node HTTP in integration tests; Playwright for Electron E2E
  - Rationale: Stubs at network layer per spec; realistic main-process behavior
  - Alternatives considered: Mocking service methods; full end-to-end with live providers

## Resolved Unknowns (NEEDS CLARIFICATION)

- Unit test runner
  - Decision: Jest (Node/TS) for unit + integration tests
  - Rationale: Common in TS/Electron; good nock ecosystem support
  - Alternatives: Vitest (lighter, but Jest already common)

## Best Practices & Patterns

- Secrets: `.env` loaded only in main process; ensure `.gitignore` includes `.env`
- IPC: Use narrow, typed IPC channels; validate inputs and outputs
- Retries: Single retry with idempotence (no duplicated turns)
- Timeouts: User-visible loading; cancel/retry after threshold; preserve context
- Validation: Use strict schema with helpful error messages for repair

