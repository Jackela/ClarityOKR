import { z } from 'zod';

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

export const clarificationSessionSchema = z.object({
  id: z.string().min(1),
  initialIntent: z.string().min(3),
  status: z.enum(['collecting', 'ready', 'completed']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  steps: z.array(clarificationPromptSchema),
  selectedOptionIds: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  pendingQuestionId: z.string().optional().nullable(),
});

export const keyResultSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1).max(180),
  successMetric: z.string().optional(),
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
  objective: z.string().min(1).max(200),
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

export const LlmQuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().optional(),
});

export const LlmQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(LlmQuestionOptionSchema),
});

export const LlmNextQuestionResponseSchema = z.object({
  question: LlmQuestionSchema,
});

export const LlmKeyResultSchema = z.object({
  id: z.string().optional(),
  statement: z.string().optional(),
  target: z.union([z.number(), z.string()]).optional(),
  measurement: z.string().optional(),
});

export const LlmObjectiveSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  keyResults: z.array(LlmKeyResultSchema).optional(),
});

export const LlmDraftSchema = z.object({
  objectives: z.array(LlmObjectiveSchema).optional(),
});

export const LlmDraftResponseSchema = z.object({
  draft: LlmDraftSchema.optional(),
});
