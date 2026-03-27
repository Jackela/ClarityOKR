import { z } from 'zod';

export const llmOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().optional(),
});

export const llmQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(llmOptionSchema).min(2).max(6),
});

export const nextQuestionResponseSchema = z.object({
  question: llmQuestionSchema,
});

export const llmKeyResultSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  target: z.union([z.string(), z.number()]),
  measurement: z.string().min(1),
});

export const llmObjectiveSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  keyResults: z.array(llmKeyResultSchema).min(3).max(5),
});

export const llmOkrDraftSchema = z.object({
  objectives: z.array(llmObjectiveSchema).min(1),
  assumptions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const okrDraftResponseSchema = z.object({
  draft: llmOkrDraftSchema,
});

// Explicit TypeScript types for better inference
export interface OkrDraftResponse {
  draft: {
    objectives: Array<{
      id: string;
      title?: string;
      description?: string;
      keyResults: Array<{
        id: string;
        statement: string;
        target: string | number;
        measurement: string;
      }>;
    }>;
    assumptions?: string[];
    notes?: string;
  };
}
