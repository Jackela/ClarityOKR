import { Injectable, signal, computed } from '@angular/core';
import type { KeyResult } from '@clarityokr/contracts';

/**
 * Validation error structure for edit mode
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
 * Initial state for edit mode
 */
const INITIAL_STATE: EditModeState = {
  isEditing: false,
  originalObjective: '',
  originalKeyResults: [],
  draftObjective: '',
  draftKeyResults: [],
  isDirty: false,
  isValid: true,
  errors: [],
};

/**
 * Maximum length constants for validation
 */
const VALIDATION_LIMITS = {
  objectiveMaxLength: 200,
  keyResultMaxLength: 180,
} as const;

/**
 * Validation messages
 */
const VALIDATION_MESSAGES = {
  objectiveEmpty: '目标描述不能为空',
  objectiveTooLong: '目标描述不能超过200个字符',
  keyResultEmpty: '关键结果描述不能为空',
  keyResultTooLong: '关键结果描述不能超过180个字符',
} as const;

/**
 * EditModeStore - Manages edit mode state for OKR sticky note
 *
 * Architecture: Signal-based state management with computed derived values
 * - All state changes through dedicated methods
 * - Computed signals for isDirty and isValid
 * - Validation runs on every state change
 *
 * @example
 * ```typescript
 * // In component
 * constructor(private editModeStore: EditModeStore) {}
 *
 * // Enter edit mode
 * this.editModeStore.enterEditMode('Objective', keyResults);
 *
 * // Update draft
 * this.editModeStore.updateObjective('New objective');
 *
 * // Check state
 * const isDirty = this.editModeStore.isDirty();
 * const isValid = this.editModeStore.isValid();
 *
 * // Save or cancel
 * this.editModeStore.saveEdits();
 * this.editModeStore.cancelEdits();
 * ```
 */
@Injectable({ providedIn: 'root' })
export class EditModeStore {
  // === Core state (single source of truth) ===
  private readonly _state = signal<EditModeState>(INITIAL_STATE);

  // === Derived readonly Signals ===

  /** Current edit mode state */
  readonly isEditing = computed(() => this._state().isEditing);

  /** Original objective value */
  readonly originalObjective = computed(() => this._state().originalObjective);

  /** Original key results */
  readonly originalKeyResults = computed(() => this._state().originalKeyResults);

  /** Draft objective value */
  readonly draftObjective = computed(() => this._state().draftObjective);

  /** Draft key results */
  readonly draftKeyResults = computed(() => this._state().draftKeyResults);

  /** Whether draft differs from original */
  readonly isDirty = computed(() => this._state().isDirty);

  /** Whether current state is valid */
  readonly isValid = computed(() => this._state().isValid);

  /** Current validation errors */
  readonly errors = computed(() => this._state().errors);

  // === Public Methods ===

  /**
   * Get current state snapshot
   * @returns Complete state object
   */
  getState(): EditModeState {
    return { ...this._state() };
  }

  /**
   * Enter edit mode with current values
   * Captures originals and initializes drafts
   *
   * @param objective - Current objective text
   * @param keyResults - Current key results
   *
   * @example
   * ```typescript
   * store.enterEditMode('提升效率', keyResults);
   * // isEditing = true
   * // originalObjective = draftObjective = '提升效率'
   * ```
   */
  enterEditMode(objective: string, keyResults: KeyResult[]): void {
    const draftKeyResults: DraftKeyResult[] = keyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric ?? '',
      owner: kr.owner ?? '',
    }));

    this._state.set({
      isEditing: true,
      originalObjective: objective,
      originalKeyResults: [...keyResults],
      draftObjective: objective,
      draftKeyResults,
      isDirty: false,
      isValid: true,
      errors: [],
    });
  }

  /**
   * Exit edit mode without saving
   * Keeps original values, resets draft state
   */
  exitEditMode(): void {
    this._state.update((state) => ({
      ...state,
      isEditing: false,
    }));
  }

  /**
   * Toggle edit mode on/off
   * If entering edit mode, uses current draft values
   */
  toggleEditMode(): void {
    const currentState = this._state();
    if (currentState.isEditing) {
      this.exitEditMode();
    } else {
      this.enterEditMode(currentState.originalObjective, currentState.originalKeyResults);
    }
  }

  /**
   * Update draft objective text
   * Triggers dirty check and validation
   *
   * @param text - New objective text
   */
  updateObjective(text: string): void {
    this._state.update((state) => {
      const newState: EditModeState = {
        ...state,
        draftObjective: text,
      };
      return this.recalculateState(newState);
    });
  }

  /**
   * Update draft key result
   * Triggers dirty check and validation
   *
   * @param id - Key result ID
   * @param updates - Partial updates to apply
   *
   * @throws Error if key result not found
   */
  updateKeyResult(id: string, updates: Partial<DraftKeyResult>): void {
    this._state.update((state) => {
      const krIndex = state.draftKeyResults.findIndex((kr) => kr.id === id);
      if (krIndex === -1) {
        throw new Error(`Key result with id '${id}' not found`);
      }

      const newDraftKeyResults = [...state.draftKeyResults];
      newDraftKeyResults[krIndex] = {
        ...newDraftKeyResults[krIndex],
        ...updates,
      };

      const newState: EditModeState = {
        ...state,
        draftKeyResults: newDraftKeyResults,
      };
      return this.recalculateState(newState);
    });
  }

  /**
   * Save edits and exit edit mode
   * Updates originals to draft values
   *
   * @returns Updated objective and key results
   * @throws Error if not in edit mode
   */
  saveEdits(): { objective: string; keyResults: KeyResult[] } {
    const currentState = this._state();
    if (!currentState.isEditing) {
      throw new Error('Cannot save edits when not in edit mode');
    }

    const updatedKeyResults: KeyResult[] = currentState.draftKeyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric || undefined,
      owner: kr.owner || undefined,
    }));

    this._state.set({
      isEditing: false,
      originalObjective: currentState.draftObjective,
      originalKeyResults: updatedKeyResults,
      draftObjective: currentState.draftObjective,
      draftKeyResults: currentState.draftKeyResults.map((kr) => ({ ...kr })),
      isDirty: false,
      isValid: true,
      errors: [],
    });

    return {
      objective: currentState.draftObjective,
      keyResults: updatedKeyResults,
    };
  }

  /**
   * Cancel edits and revert to originals
   * Exits edit mode, restores original values to drafts
   *
   * @throws Error if not in edit mode
   */
  cancelEdits(): void {
    const currentState = this._state();
    if (!currentState.isEditing) {
      throw new Error('Cannot cancel edits when not in edit mode');
    }

    const draftKeyResults: DraftKeyResult[] = currentState.originalKeyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric ?? '',
      owner: kr.owner ?? '',
    }));

    this._state.set({
      isEditing: false,
      originalObjective: currentState.originalObjective,
      originalKeyResults: [...currentState.originalKeyResults],
      draftObjective: currentState.originalObjective,
      draftKeyResults,
      isDirty: false,
      isValid: true,
      errors: [],
    });
  }

  // === Private Methods ===

  /**
   * Recalculate derived state (isDirty, isValid, errors)
   * Called after any draft change
   *
   * @param state - Current state
   * @returns Updated state with recalculated values
   */
  private recalculateState(state: EditModeState): EditModeState {
    const errors = this.validateState(state);
    const isValid = errors.length === 0;
    const isDirty = this.calculateDirty(state);

    return {
      ...state,
      isDirty,
      isValid,
      errors,
    };
  }

  /**
   * Calculate if draft differs from original
   *
   * @param state - Current state
   * @returns true if any draft value differs from original
   */
  private calculateDirty(state: EditModeState): boolean {
    // Check objective
    if (state.draftObjective !== state.originalObjective) {
      return true;
    }

    // Check key results count
    if (state.draftKeyResults.length !== state.originalKeyResults.length) {
      return true;
    }

    // Check each key result
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
   *
   * Rules:
   * - Objective: required, max 200 chars
   * - KR statement: required, max 180 chars
   * - At least 1 KR required
   *
   * @param state - Current state
   * @returns Array of validation errors
   */
  private validateState(state: EditModeState): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate objective
    const objectiveTrimmed = state.draftObjective.trim();
    if (objectiveTrimmed.length === 0) {
      errors.push({
        field: 'objective',
        message: VALIDATION_MESSAGES.objectiveEmpty,
      });
    } else if (state.draftObjective.length > VALIDATION_LIMITS.objectiveMaxLength) {
      errors.push({
        field: 'objective',
        message: VALIDATION_MESSAGES.objectiveTooLong,
      });
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
}
