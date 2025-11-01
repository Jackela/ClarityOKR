# Clarify-to-OKR Contract Overview

This module defines the shared interfaces used by the Clarify-to-OKR desktop flow. All consumers (Electron main process, Angular renderer, and agent orchestration services) must import types from `@clarityokr/contracts` to remain aligned with the SSOT constitution rule.

## Entities

- `ClarificationSession` — Captures the question-answer history, status, and confidence metrics.
- `ClarificationPrompt` & `ClarificationOption` — Represent agent-issued questions with mutually exclusive options.
- `OKRDocument` — Tracks the Objective, Key Results, manual edits, and regeneration policy.
- `UserActionLogEntry` — Records user-triggered operations such as generate, regenerate, edit, and copy.

## Operations

- `GenerateOKRRequest` → `GenerateOKRResponse`
- `RegenerateOKRRequest` → `RegenerateOKRResponse`
- `PersistClarificationRequest`
- `ClipboardExportRequest` → `ClipboardExportResult`

All timestamps are ISO-8601 formatted strings. Confidence values are normalized between 0 and 1.

## Validation Expectations

Zod validators mirror these interfaces in `packages/contracts/src/validators/clarify-to-okr.validator.ts` (to be implemented). Consumers must run validation for fail-fast guarantees before processing payloads.
