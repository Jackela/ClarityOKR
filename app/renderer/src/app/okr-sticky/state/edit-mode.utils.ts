import type { KeyResult } from '@clarityokr/contracts';

import { evaluateText } from '../../closed-loop/text-limit';
import type { EditModeState, DraftKeyResult, ValidationError } from './edit-mode.types.js';
import { VALIDATION_LIMITS, VALIDATION_MESSAGES } from './edit-mode.types.js';

/**
 * Create draft key results from original key results
 */
export function createDraftKeyResults(keyResults: KeyResult[]): DraftKeyResult[] {
  return keyResults.map((kr) => ({
    id: kr.id,
    statement: kr.statement,
    successMetric: kr.successMetric ?? '',
  }));
}

/**
 * Calculate if draft differs from original. A key result that only exists in the draft
 * (added in this session) always makes the draft dirty.
 */
export function calculateDirty(state: EditModeState): boolean {
  if (state.draftObjective !== state.originalObjective) return true;
  if (state.draftKeyResults.length !== state.originalKeyResults.length) return true;

  for (let i = 0; i < state.draftKeyResults.length; i++) {
    const draft = state.draftKeyResults[i];
    const original = state.originalKeyResults[i];

    if (
      draft.id !== original.id ||
      draft.statement !== original.statement ||
      draft.successMetric !== (original.successMetric ?? '')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate current state: empty required fields, then the grapheme limits (§3.9a).
 */
export function validateState(state: EditModeState): ValidationError[] {
  const errors: ValidationError[] = [];

  const objective = evaluateText(state.draftObjective, VALIDATION_LIMITS.objectiveMaxLength);
  if (state.draftObjective.trim().length === 0) {
    errors.push({ field: 'objective', message: VALIDATION_MESSAGES.objectiveEmpty });
  } else if (objective.kind === 'cluster_too_long') {
    errors.push({ field: 'objective', message: VALIDATION_MESSAGES.clusterTooLong });
  } else if (objective.kind === 'too_long') {
    errors.push({ field: 'objective', message: VALIDATION_MESSAGES.objectiveTooLong });
  }

  state.draftKeyResults.forEach((kr) => {
    const statement = evaluateText(kr.statement, VALIDATION_LIMITS.keyResultMaxLength);
    const field = `keyResults.${kr.id}.statement`;
    if (kr.statement.trim().length === 0) {
      errors.push({ field, message: VALIDATION_MESSAGES.keyResultEmpty });
    } else if (statement.kind === 'cluster_too_long') {
      errors.push({ field, message: VALIDATION_MESSAGES.clusterTooLong });
    } else if (statement.kind === 'too_long') {
      errors.push({ field, message: VALIDATION_MESSAGES.keyResultTooLong });
    }

    const metric = evaluateText(kr.successMetric, VALIDATION_LIMITS.metricMaxLength);
    const metricField = `keyResults.${kr.id}.successMetric`;
    if (metric.kind === 'cluster_too_long') {
      errors.push({ field: metricField, message: VALIDATION_MESSAGES.clusterTooLong });
    } else if (metric.kind === 'too_long') {
      errors.push({ field: metricField, message: VALIDATION_MESSAGES.metricTooLong });
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
