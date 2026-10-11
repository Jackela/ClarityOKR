import { z } from 'zod';

import { TEXT_LIMITS, checkText } from '../okr-model.js';

/**
 * Text that must stay within a grapheme limit (spec §3.9a). The same `checkText` the renderer's
 * forms use; nothing is truncated, over-long text is rejected.
 */
function graphemeText(limit: number) {
  return z.string().superRefine((value, ctx) => {
    const check = checkText(value, limit);
    if (!check.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.reason });
    }
  });
}

export const clarificationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(40),
  description: z.string().min(1).optional(),
  scopeTag: z.string().min(1),
});

export const clarificationPromptSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  sequence: z.number().int().min(0),
  context: z.string().min(1),
  options: z.array(clarificationOptionSchema).min(2).max(5),
});

export const clarificationPromptRequestSchema = z.object({
  sessionId: z.string().min(1),
  intent: z.string().min(3),
});

export const clarificationPromptResponseSchema = z.object({
  prompt: clarificationPromptSchema,
});

export const clarificationOptionSelectionSchema = z.object({
  sessionId: z.string().min(1),
  promptId: z.string().min(1),
  optionId: z.string().min(1),
});

export const clarificationSelectionSchema = z.object({
  promptId: z.string().min(1),
  optionId: z.string().min(1),
  selectedAt: z.string().datetime(),
});

export const clarificationSessionSchema = z.object({
  id: z.string().min(1),
  initialIntent: z.string().min(3),
  status: z.enum(['collecting', 'ready', 'completed']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  steps: z.array(clarificationPromptSchema),
  selectedOptions: z.array(clarificationSelectionSchema),
  confidence: z.number().min(0).max(1),
  pendingQuestionId: z.string().optional().nullable(),
});

export const keyResultSchema = z.object({
  id: z.string().min(1),
  statement: graphemeText(TEXT_LIMITS.keyResult).refine((v) => v.length > 0, 'empty'),
  successMetric: graphemeText(TEXT_LIMITS.successMetric).optional(),
  owner: z.string().optional(),
});

export const manualEditRecordSchema = z.object({
  id: z.string().min(1),
  fieldPath: z.string().min(1),
  previousValue: z.string(),
  newValue: z.string(),
  editedAt: z.string().datetime(),
});

export const okrDocumentSchema = z.object({
  id: z.string().min(1),
  objective: graphemeText(TEXT_LIMITS.objective).refine((v) => v.length > 0, 'empty'),
  keyResults: z.array(keyResultSchema).min(1).max(10),
  sourceSessionId: z.string().min(1),
  generatedAt: z.string().datetime(),
  lastEditedAt: z.string().datetime().nullable().optional(),
  regenerationPolicy: z.enum(['overwrite', 'append']),
  manualEdits: z.array(manualEditRecordSchema),
});

export const userActionLogEntrySchema = z.object({
  id: z.string().min(1),
  actionType: z.enum(['generate', 'regenerate', 'edit', 'copy']),
  sessionId: z.string().min(1),
  okrId: z.string().optional().nullable(),
  payloadSummary: z.string().max(120),
  occurredAt: z.string().datetime(),
});

export const generateOKRRequestSchema = z.object({
  sessionId: z.string().min(1),
  intentSummary: z.string().min(1),
});

export const generateOKRResponseSchema = z.object({
  okr: okrDocumentSchema,
  session: clarificationSessionSchema,
});

export const regenerateOKRRequestSchema = z.object({
  sessionId: z.string().min(1),
  policy: z.enum(['overwrite', 'append']),
});

export const regenerateOKRResponseSchema = z.object({
  okr: okrDocumentSchema,
  session: clarificationSessionSchema,
});

export const persistClarificationRequestSchema = z.object({
  session: clarificationSessionSchema,
  okr: okrDocumentSchema.optional().nullable(),
});

export const clipboardExportRequestSchema = z.object({
  okrId: z.string().min(1),
});

export const clipboardExportResultSchema = z.object({
  okrMarkdown: z.string().min(1),
  copiedAt: z.string().datetime(),
});

/** Editable fields only; main owns session identity, timestamps, and edit history. */
export const updateOKRRequestSchema = okrDocumentSchema.pick({
  id: true,
  objective: true,
  keyResults: true,
});
