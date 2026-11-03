import { Injectable, signal, computed } from '@angular/core';
import type { KeyResult } from '@clarityokr/contracts';
import type { EditModeState, DraftKeyResult, TextSnapshot } from './edit-mode.types.js';
import { INITIAL_STATE } from './edit-mode.types.js';
import { createDraftKeyResults, recalculateState } from './edit-mode.utils.js';

export type { EditModeState, DraftKeyResult, ValidationError } from './edit-mode.types.js';

/**
 * Typing in the SAME field with less than this between two inputs is one undo step. A new step
 * starts on: another field, a paste, after undo / redo, and on blur (spec §3.9).
 */
const COALESCE_MS = 1000;

function snapshotOf(objective: string, keyResults: readonly DraftKeyResult[]): TextSnapshot {
  return {
    objective,
    keyResults: keyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric,
    })),
  };
}

function sameSnapshot(a: TextSnapshot, b: TextSnapshot): boolean {
  return (
    a.objective === b.objective &&
    a.keyResults.length === b.keyResults.length &&
    a.keyResults.every((kr, i) => {
      const other = b.keyResults[i];
      return (
        !!other &&
        kr.id === other.id &&
        kr.statement === other.statement &&
        kr.successMetric === other.successMetric
      );
    })
  );
}

/**
 * EditModeStore - Manages edit mode state for OKR sticky note
 *
 * Architecture: Signal-based state management with computed derived values
 * - All state changes through dedicated methods
 * - Computed signals for isDirty and isValid
 * - Validation runs on every state change
 *
 * Undo / redo (spec §3.9) covers the text only. The history survives a save (so a saved edit
 * can still be undone, which makes the draft dirty again) and is dropped when another OKR is
 * opened or the text changed underneath it (regeneration): `enterEditMode` starts a new history
 * whenever the document no longer matches the entry the cursor sits on.
 *
 * @example
 * ```typescript
 * this.editModeStore.enterEditMode('Objective', keyResults, okrId);
 * this.editModeStore.updateObjective('New objective');
 * this.editModeStore.undo();
 * this.editModeStore.saveEdits();
 * ```
 */
@Injectable({ providedIn: 'root' })
export class EditModeStore {
  // === Core state (single source of truth) ===
  private readonly _state = signal<EditModeState>(INITIAL_STATE);

  // === Undo history (text only) ===
  private readonly history = signal<readonly TextSnapshot[]>([]);
  private readonly cursor = signal(-1);
  /** Index of the history entry that equals the saved document. */
  private savedIndex = -1;
  private historyOkrId: string | null = null;
  private lastKey: string | null = null;
  private lastAt = 0;

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

  /** An earlier text state exists. */
  readonly canUndo = computed(() => this.cursor() > 0);

  /** A later text state exists (after an undo). */
  readonly canRedo = computed(
    () => this.cursor() >= 0 && this.cursor() < this.history().length - 1,
  );

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
   * @param okrId - The OKR being edited; a different one than before starts a new history
   * @param addKeyResultId - Also append an empty key result with this id (spec §3.10)
   */
  enterEditMode(
    objective: string,
    keyResults: KeyResult[],
    okrId: string | null = null,
    addKeyResultId?: string,
  ): void {
    const draftKeyResults: DraftKeyResult[] = createDraftKeyResults(keyResults);
    const current = snapshotOf(objective, draftKeyResults);
    const entry = this.history()[this.cursor()];
    if (okrId !== this.historyOkrId || !entry || !sameSnapshot(entry, current)) {
      this.history.set([current]);
      this.cursor.set(0);
    }
    this.historyOkrId = okrId;
    this.savedIndex = this.cursor();
    this.lastKey = null;

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
    if (addKeyResultId) this.addKeyResult(addKeyResultId);
  }

  /** Forget the undo history (another OKR was opened, the OKR was regenerated). */
  clearHistory(): void {
    this.history.set([]);
    this.cursor.set(-1);
    this.savedIndex = -1;
    this.historyOkrId = null;
    this.lastKey = null;
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
      this.enterEditMode(
        currentState.originalObjective,
        currentState.originalKeyResults,
        this.historyOkrId,
      );
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
    this.record('objective');
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
    const field =
      'statement' in updates ? 'statement' : 'successMetric' in updates ? 'metric' : 'other';
    this.record(`${id}:${field}`);
  }

  /** Appends an empty key result at the end of the draft (spec §3.10). */
  addKeyResult(id: string): void {
    this._state.update((state) =>
      recalculateState({
        ...state,
        draftKeyResults: [...state.draftKeyResults, { id, statement: '', successMetric: '' }],
      }),
    );
    this.record(`add:${id}`, false);
  }

  /** Steps back one text state. Does nothing at the start of the history. */
  undo(): void {
    if (!this.canUndo()) return;
    this.moveTo(this.cursor() - 1);
  }

  /** Steps forward one text state. Does nothing at the end of the history. */
  redo(): void {
    if (!this.canRedo()) return;
    this.moveTo(this.cursor() + 1);
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
    // The history is kept: the saved text is simply the entry the cursor is on.
    this.savedIndex = this.cursor();
    this.lastKey = null;

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
    // Back to the saved text; whatever was typed since is no longer part of the history.
    if (this.savedIndex >= 0) {
      this.history.update((entries) => entries.slice(0, this.savedIndex + 1));
      this.cursor.set(this.savedIndex);
    }
    this.lastKey = null;
  }

  /**
   * Ends the current undo step: the next typing starts a new one (spec §3.9). Called on blur
   * and around a paste; undo / redo / switching to another field do it by themselves.
   */
  breakCoalescing(): void {
    this.lastKey = null;
  }

  /** #117: the history point now, for {@link rollbackTo} (S3-05: undo a restore exactly). */
  checkpoint(): number {
    return this.cursor();
  }

  /**
   * #117 S3-05: back to a {@link checkpoint} of this edit — objective, key result texts and
   * added key results as they were — and forget the steps after it.
   */
  rollbackTo(index: number): void {
    if (!this.history()[index]) return;
    this.history.set(this.history().slice(0, index + 1));
    this.moveTo(index);
  }

  // === History plumbing ===

  private record(key: string, coalesce = true): void {
    const state = this._state();
    const snapshot = snapshotOf(state.draftObjective, state.draftKeyResults);
    const entries = this.history();
    const now = Date.now();
    const atTip = this.cursor() === entries.length - 1;
    const merge =
      coalesce &&
      atTip &&
      this.lastKey === key &&
      now - this.lastAt < COALESCE_MS &&
      this.cursor() > this.savedIndex;
    if (merge) {
      this.history.set([...entries.slice(0, this.cursor()), snapshot]);
    } else {
      const kept = entries.slice(0, this.cursor() + 1);
      this.history.set([...kept, snapshot]);
      this.cursor.set(kept.length);
    }
    this.lastKey = key;
    this.lastAt = now;
  }

  private moveTo(index: number): void {
    const target = this.history()[index];
    if (!target) return;
    this.cursor.set(index);
    this.lastKey = null;
    this._state.update((state) => {
      const previous = new Map(state.draftKeyResults.map((kr) => [kr.id, kr]));
      const original = new Map(state.originalKeyResults.map((kr) => [kr.id, kr]));
      return recalculateState({
        ...state,
        draftObjective: target.objective,
        draftKeyResults: target.keyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.successMetric,
        })),
      });
    });
  }
}
