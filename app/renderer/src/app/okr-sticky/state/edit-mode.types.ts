import type { KeyResult } from '@clarityokr/contracts';

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
  owner: string;
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
 * Maximum length constants for validation
 */
export const VALIDATION_LIMITS = {
  objectiveMaxLength: 200,
  keyResultMaxLength: 180,
} as const;

/**
 * Validation messages
 */
export const VALIDATION_MESSAGES = {
  objectiveEmpty: '目标描述不能为空',
  objectiveTooLong: '目标描述不能超过200个字符',
  keyResultEmpty: '关键结果描述不能为空',
  keyResultTooLong: '关键结果描述不能超过180个字符',
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
