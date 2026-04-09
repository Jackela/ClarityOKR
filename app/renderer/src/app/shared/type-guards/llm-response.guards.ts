/**
 * Type guards for LLM response validation
 */

/**
 * Checks if an object has a 'question' property
 * Used to determine if LLM response contains another question or if clarification is complete
 */
export function hasQuestionProperty(obj: unknown): obj is { question: unknown } {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return 'question' in record && record.question !== undefined;
}

/**
 * Draft response structure from LLM
 */
export interface DraftResponse {
  draft?: {
    objectives?: Array<{ title?: string }>;
  };
}

/**
 * Type guard for DraftResponse validation
 * Used to safely access draft generation responses
 */
export function isDraftResponse(obj: unknown): obj is DraftResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  if (record.draft === undefined || typeof record.draft !== 'object' || record.draft === null) {
    return false;
  }
  return true;
}
