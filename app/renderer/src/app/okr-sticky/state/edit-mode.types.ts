import type { KeyResult } from '@clarityokr/contracts';
import { TEXT_LIMITS } from '@clarityokr/contracts';

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Draft key result with editable fields
 */
export interface DraftKeyResult {
  id: string;
  statement: string;
  successMetric: string;
}

/** The text content of one point in the edit history (progress is never part of it). */
export interface TextSnapshot {
  objective: string;
  keyResults: Array<{ id: string; statement: string; successMetric: string }>;
}

/**
 * Edit mode state interface
 */
export interface EditModeState {
  isEditing: boolean;
  originalObjective: string;
  originalKeyResults: KeyResult[];
  draftObjective: string;
  draftKeyResults: DraftKeyResult[];
  isDirty: boolean;
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Limits in grapheme clusters, shared with the main process (spec §3.9a).
 */
export const VALIDATION_LIMITS = {
  objectiveMaxLength: TEXT_LIMITS.objective,
  keyResultMaxLength: TEXT_LIMITS.keyResult,
  metricMaxLength: TEXT_LIMITS.successMetric,
} as const;

/**
 * Validation messages
 */
export const VALIDATION_MESSAGES = {
  objectiveEmpty: '目标描述不能为空',
  objectiveTooLong: '目标描述不能超过200个字符',
  keyResultEmpty: '关键结果描述不能为空',
  keyResultTooLong: '关键结果描述不能超过200个字符',
  metricTooLong: '度量不能超过200个字符',
  clusterTooLong: '内容里的特殊符号过多，请删减后再保存。',
} as const;

/**
 * Initial state for edit mode
 */
export const INITIAL_STATE: EditModeState = {
  isEditing: false,
  originalObjective: '',
  originalKeyResults: [],
  draftObjective: '',
  draftKeyResults: [],
  isDirty: false,
  isValid: true,
  errors: [],
};
