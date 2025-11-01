# Data Model – Clarify-to-OKR Desktop Flow

## ClarificationSession
- **sessionId**: string (UUID v4) – unique identifier persisted per user session.
- **initialIntent**: string – raw goal text entered by user; min 3 characters.
- **status**: `"collecting" | "ready" | "completed"` – progression through interview.
- **createdAt**: ISO8601 timestamp – session start time.
- **updatedAt**: ISO8601 timestamp – last modification.
- **steps**: ClarificationPrompt[] – ordered list of prompts issued.
- **selectedOptionIds**: string[] – quick lookup of chosen options (maintain order).
- **confidence**: number (0-1) – agent certainty that intent is clarified.
- **pendingQuestionId**: string | null – indicates expectation for next renderer response.

## ClarificationPrompt
- **promptId**: string – unique ID per question.
- **question**: string – localized prompt text.
- **options**: ClarificationOption[] – mutually exclusive responses.
- **sequence**: number – 0-based order index.
- **context**: string – brief agent note describing what the question resolves.

## ClarificationOption
- **optionId**: string – unique identifier for selection.
- **label**: string – button text (<= 40 chars).
- **description**: string | null – supplementary tooltip content.
- **scopeTag**: string – category used for analytics (e.g., "metric", "audience").

## OKRDocument
- **okrId**: string (UUID v4) – unique identifier for persisted OKR.
- **objective**: string – headline statement.
- **keyResults**: KeyResult[] – minimum 1, maximum 10 entries.
- **sourceSessionId**: string – references ClarificationSession.
- **generatedAt**: ISO8601 timestamp – AI generation time.
- **lastEditedAt**: ISO8601 timestamp | null – last manual edit time.
- **regenerationPolicy**: `"overwrite" | "append"` – last user choice on regenerate.
- **manualEdits**: ManualEdit[] – history of user adjustments.

## KeyResult
- **krId**: string – unique identifier per KR.
- **statement**: string – descriptive result text.
- **successMetric**: string | null – optional quantified metric.
- **owner**: string | null – optional assignee captured during clarification.

## ManualEdit
- **editId**: string – unique identifier.
- **fieldPath**: string – JSONPath (e.g., `objective`, `keyResults[2].statement`).
- **previousValue**: string – text before edit.
- **newValue**: string – text after edit.
- **editedAt**: ISO8601 timestamp – when change occurred.

## UserActionLog
- **actionId**: string – unique identifier.
- **actionType**: `"generate" | "regenerate" | "edit" | "copy"` – enumerated action.
- **sessionId**: string – relates to ClarificationSession.
- **okrId**: string | null – present when OKR exists.
- **payloadSummary**: string – concise detail (<= 120 chars) for analytics.
- **occurredAt**: ISO8601 timestamp – event time.

## Relationships
- ClarificationSession `1 - n` ClarificationPrompt via `steps`.
- ClarificationPrompt `1 - n` ClarificationOption.
- ClarificationSession `1 - 1` OKRDocument (latest generated OKR).
- OKRDocument `1 - n` KeyResult.
- OKRDocument `1 - n` ManualEdit.
- ClarificationSession `1 - n` UserActionLog.

## State Transitions
- **ClarificationSession**: `collecting` → `ready` when confidence ≥ threshold and mandatory dimensions answered; `ready` → `completed` once OKR generated or manually closed.
- **OKRDocument**: Initial state `generated`; transitions to `edited` after manual change; returns to `generated` when overwritten by regenerate with overwrite policy.
- **UserActionLog**: Append-only timeline for analytics; no deletions.

## Validation Rules
- ClarificationPrompt MUST include between 2 and 5 ClarificationOption entries.
- Objective text capped at 200 characters; Key Result statements capped at 180 characters.
- Regeneration requiring overwrite must prompt user confirmation (handled in service layer but documented for fail-fast validation).
- Clipboard export MUST serialize Objective + Key Results into markdown bullet list format.
