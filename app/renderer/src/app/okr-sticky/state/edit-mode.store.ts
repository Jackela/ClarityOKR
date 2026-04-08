import { Injectable, signal, computed } from '@angular/core';
import type { KeyResult } from '@clarityokr/contracts';
import type { EditModeState, DraftKeyResult } from './edit-mode.types.js';
import { INITIAL_STATE } from './edit-mode.types.js';
import { createDraftKeyResults, recalculateState } from './edit-mode.utils.js';

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
    const draftKeyResults: DraftKeyResult[] = createDraftKeyResults(keyResults);

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
      return recalculateState(newState);
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
      return recalculateState(newState);
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

    const draftKeyResults: DraftKeyResult[] = createDraftKeyResults(
      currentState.originalKeyResults,
    );

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
}
