# Feature Specification: Integrate Real LLM for Clarification & OKR Generation

**Feature Branch**: `001-llm-okr-integration`  
**Created**: 2025-11-02  
**Status**: Draft  
**Input**: User description: "为 ClarityOKR 定义一个集成真实 LLM 的新功能规范。User Story 1 (P1 - 实时澄清): 作为用户，当我在澄清流程 中点击选项时，系统必须调用真实的 LLM API 来动态生成下一个问题和选项，而不是使用模拟数据。User Story 2 (P2 - 实时生成): 作为用户，当我点击“生成 OKR 草案”时，系统必须调用真实的 LLM API，并传入完整的澄清上下文，来生成最终的 OKR。功能需求 (FRs) 必须包括：FR1: 必须在 Electron Main 进程中安全地从 .env 文件加载 LLM API Key（确保 .env 在 .gitignore 中）。FR2: OkrAgentService 必须被重构，以包含一个 private async callLlmApi(...) 方法。FR3: 所有对 callLlmApi 的调用必须遵循 TDD 原则，使用集成测试（例如 nock 或 msw）来模拟 HTTP 响应，而不是模拟整个服务。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-time Clarification (Priority: P1)

As a user in the clarification flow, when I choose an option, the system asks a real language model for the next question and its options based on everything clarified so far, so the conversation adapts to my context rather than using canned questions.

**Why this priority**: Real-time, context-aware questions drive higher relevance and reduce steps to a usable OKR, directly impacting primary product value.

**Independent Test**: Can be fully tested by simulating a user selecting options in a fresh session and observing that subsequent questions and options update based on prior selections (without any hardcoded question tree).

**Acceptance Scenarios**:

1. Given a clarification session with at least one prior answer, When the user selects an option, Then the next question and options reflect the previous answers and differ from a static/default question.
2. Given no prior context (first interaction), When the user selects the first option presented, Then the next question is coherent, on-topic for OKR discovery, and includes at least 2 actionable options.
3. Given transient network latency, When the user selects an option, Then the UI shows a loading state until a response arrives or a timeout fallback message is displayed.
4. Given the language model returns unparsable content, When the system validates the response, Then it requests a corrected/structured response once and falls back to a friendly error prompt if still invalid.

---

### User Story 2 - Real-time OKR Draft (Priority: P2)

As a user, when I click “Generate OKR Draft,” the system sends the full clarification context to a real language model and returns a structured OKR draft that I can review and refine.

**Why this priority**: Delivers the core outcome users expect—an initial OKR that reflects their context—reducing setup time and improving adoption.

**Independent Test**: Can be fully tested by completing a minimal clarification session and verifying that the generated OKR draft meaningfully references prior context and follows OKR structure.

**Acceptance Scenarios**:

1. Given a completed clarification session with at least 3 turns, When the user clicks “Generate OKR Draft,” Then the returned draft contains Objectives and Key Results aligned to the captured context.
2. Given incomplete context (e.g., fewer than 2 turns), When the user clicks “Generate OKR Draft,” Then the system prompts to gather missing inputs or proceeds with sensible defaults clearly labeled as assumptions in the draft.
3. Given the language model rate-limits or errors, When the user attempts generation, Then the system surfaces a human-readable message and a retry option without losing session context.

---

### User Story 3 - Resilience & Transparency (Priority: P3)

As a user, I receive clear feedback about progress, delays, or failures during clarification and generation, with non-destructive retries that preserve my context.

**Why this priority**: Builds trust and reduces frustration during inevitable latency or error cases.

**Independent Test**: Can be fully tested by inducing timeouts and errors and observing user-facing messages and successful retry preserving state.

**Acceptance Scenarios**:

1. Given a timeout threshold is exceeded, When waiting for a model response, Then the UI displays a non-blocking timeout notice and a retry control.
2. Given a successful retry after a previous error, When the result arrives, Then the prior context remains intact and the flow continues without duplication.

---

### Edge Cases

- No network connectivity at selection or generation time (retry, preserve context).
- Invalid or missing model credentials (prevent calls, instruct configuration, preserve context).
- Model returns off-topic or unsafe content (filter and request regeneration once, then show safe fallback).
- Unparsable or incomplete structured response (attempt self-repair once, then message and allow retry).
- Excessive latency (show progress indicator; offer cancel/retry after threshold).
- High-frequency clicks (debounce and prevent duplicate requests).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Real-time Clarification)**: On option selection, the system MUST request the next question and options from a language model using the accumulated clarification context; no static decision tree may determine the next step.
- **FR-002 (Context Integrity)**: The request payload to the model MUST include the full, ordered clarification history sufficient for the model to produce context-aware output.
- **FR-003 (Structured Response Validation)**: The system MUST validate model responses against an expected structure for “next question” (question text, 2–6 options each with id/label/value) and for “OKR draft” (1–3 Objectives, each with 3–5 Key Results, plus brief rationale).
- **FR-004 (Graceful Degradation)**: On validation failure or model error, the system MUST attempt a single corrective regeneration; if still failing, it MUST display a clear message and allow a non-destructive retry.
- **FR-005 (User Feedback)**: The system MUST present visible progress during model calls and ensure the UI remains responsive.
- **FR-006 (Security of Secrets)**: The model API credentials MUST be loaded from a secure environment configuration that is not checked into source control and not exposed to the renderer process.
- **FR-007 (Single Call Abstraction)**: The OKR agent capability MUST centralize all model invocations behind a single internal method to ensure consistent validation, retries, and logging.
- **FR-008 (Test Strategy)**: Integration tests MUST validate model-call behavior by stubbing HTTP responses at the network layer (not by mocking the agent service), covering success, validation failure→repair, timeout, and error paths.
- **FR-009 (Idempotent Retries)**: Retries MUST not duplicate turns or create conflicting state.
- **FR-010 (Telemetry Basics)**: The system SHOULD capture non-PII metrics for call counts, error reasons, and latency buckets to inform quality improvements.

Dependencies and assumptions (for scope clarity):
- Model provider and exact prompt style are out-of-scope for this spec; only behavior is specified. Responses are presented only when complete (non‑streaming UX).
- Initial OKR draft starts with 1 Objective containing 3–5 Key Results; users can expand to more Objectives after generation.
- No prompts/outputs are stored beyond the active session. Anonymized, content-free metrics (counts, error reasons, latency) may be retained for up to 30 days.

### Key Entities *(include if feature involves data)*

- **ClarificationContext**: Ordered list of user turns and system prompts used to inform the next question and final OKR.
- **ClarificationQuestion**: `id`, `text`, `options[]` where each option has `id`, `label`, `value`.
- **ClarificationTurn**: `questionId`, `optionId`, `timestamp`.
- **OkrDraft**: `objectives[]`, `assumptions[]`, `notes`.
- **Objective**: `id`, `title`, `description`, `keyResults[]`.
- **KeyResult**: `id`, `statement`, `target`, `measurement`.

## Shared TypeScript Interfaces *(mandatory for contract changes)*

- **Interface Package**: Shared contracts package (to be determined)
- **Change Summary**: Add contracts for `ClarificationQuestion`, `ClarificationOption`, `ClarificationContext`, and `OkrDraft` (Objectives/KeyResults). Define validation rules for counts and required fields.
- **Consumer Impact**: Renderer consumes question/option and draft types; agent service produces validated contract instances; tests rely on the shared contracts for assertions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Clarification Latency)**: 95% of “next question” responses present to users within 2 seconds under normal network conditions.
- **SC-002 (Draft Generation Latency)**: 90% of OKR draft generations present to users within 10 seconds under normal conditions.
- **SC-003 (Validity Rate)**: At least 98% of model responses pass structure validation without requiring more than one repair attempt.
- **SC-004 (Task Completion)**: 80% of users can progress from first clarification to a usable draft in one session without support.
- **SC-005 (Error Resilience)**: User-reported failures related to generation remain under 2% of interactions in the first release.
- **SC-006 (User Perception)**: 80% of surveyed users report that questions feel tailored to their context.
