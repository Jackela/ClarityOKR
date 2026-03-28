import type { EditModeState, DraftKeyResult, ValidationError } from './edit-mode.types.js';
import { VALIDATION_LIMITS, VALIDATION_MESSAGES } from './edit-mode.types.js';

/**
 * Create draft key results from original key results
 */
export function createDraftKeyResults(
  keyResults: import('@clarityokr/contracts').KeyResult[],
): DraftKeyResult[] {
  return keyResults.map((kr) => ({
    id: kr.id,
    statement: kr.statement,
    successMetric: kr.successMetric ?? '',
    owner: kr.owner ?? '',
  }));
}

/**
 * Calculate if draft differs from original
 */
export function calculateDirty(state: EditModeState): boolean {
  if (state.draftObjective !== state.originalObjective) return true;
  if (state.draftKeyResults.length !== state.originalKeyResults.length) return true;

  for (let i = 0; i < state.draftKeyResults.length; i++) {
    const draft = state.draftKeyResults[i];
    const original = state.originalKeyResults[i];

    if (
      draft.statement !== original.statement ||
      draft.successMetric !== (original.successMetric ?? '') ||
      draft.owner !== (original.owner ?? '')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate current state
 */
export function validateState(state: EditModeState): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate objective
  const objectiveTrimmed = state.draftObjective.trim();
  if (objectiveTrimmed.length === 0) {
    errors.push({ field: 'objective', message: VALIDATION_MESSAGES.objectiveEmpty });
  } else if (state.draftObjective.length > VALIDATION_LIMITS.objectiveMaxLength) {
    errors.push({ field: 'objective', message: VALIDATION_MESSAGES.objectiveTooLong });
  }

  // Validate key results
  state.draftKeyResults.forEach((kr) => {
    const statementTrimmed = kr.statement.trim();
    if (statementTrimmed.length === 0) {
      errors.push({
        field: `keyResults.${kr.id}.statement`,
        message: VALIDATION_MESSAGES.keyResultEmpty,
      });
    } else if (kr.statement.length > VALIDATION_LIMITS.keyResultMaxLength) {
      errors.push({
        field: `keyResults.${kr.id}.statement`,
        message: VALIDATION_MESSAGES.keyResultTooLong,
      });
    }
  });

  return errors;
}

/**
 * Recalculate derived state (isDirty, isValid, errors)
 */
export function recalculateState(state: EditModeState): EditModeState {
  const errors = validateState(state);
  const isValid = errors.length === 0;
  const isDirty = calculateDirty(state);

  return { ...state, isDirty, isValid, errors };
}
