// Mock for edit-mode.store that provides CommonJS-compatible exports
// This allows the test to use require() while the actual implementation uses ESM

const VALIDATION_LIMITS = {
  objectiveMaxLength: 200,
  keyResultMaxLength: 180,
};

const VALIDATION_MESSAGES = {
  objectiveEmpty: '目标描述不能为空',
  objectiveTooLong: '目标描述不能超过200个字符',
  keyResultEmpty: '关键结果描述不能为空',
  keyResultTooLong: '关键结果描述不能超过180个字符',
};

class EditModeStoreMock {
  constructor() {
    this._state = {
      isEditing: false,
      originalObjective: '',
      originalKeyResults: [],
      draftObjective: '',
      draftKeyResults: [],
      isDirty: false,
      isValid: true,
      errors: [],
    };
  }

  getState() {
    return { ...this._state };
  }

  enterEditMode(objective, keyResults) {
    const draftKeyResults = keyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric ?? '',
      owner: kr.owner ?? '',
    }));

    this._state = {
      isEditing: true,
      originalObjective: objective,
      originalKeyResults: [...keyResults],
      draftObjective: objective,
      draftKeyResults,
      isDirty: false,
      isValid: true,
      errors: [],
    };
  }

  exitEditMode() {
    this._state = {
      ...this._state,
      isEditing: false,
    };
  }

  updateObjective(text) {
    const newState = {
      ...this._state,
      draftObjective: text,
    };
    this._state = this.recalculateState(newState);
  }

  updateKeyResult(id, updates) {
    const krIndex = this._state.draftKeyResults.findIndex((kr) => kr.id === id);
    if (krIndex === -1) {
      throw new Error(`Key result with id '${id}' not found`);
    }

    const newDraftKeyResults = [...this._state.draftKeyResults];
    newDraftKeyResults[krIndex] = {
      ...newDraftKeyResults[krIndex],
      ...updates,
    };

    const newState = {
      ...this._state,
      draftKeyResults: newDraftKeyResults,
    };
    this._state = this.recalculateState(newState);
  }

  saveEdits() {
    if (!this._state.isEditing) {
      throw new Error('Cannot save edits when not in edit mode');
    }

    const updatedKeyResults = this._state.draftKeyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric || undefined,
      owner: kr.owner || undefined,
    }));

    this._state = {
      isEditing: false,
      originalObjective: this._state.draftObjective,
      originalKeyResults: updatedKeyResults,
      draftObjective: this._state.draftObjective,
      draftKeyResults: this._state.draftKeyResults.map((kr) => ({ ...kr })),
      isDirty: false,
      isValid: true,
      errors: [],
    };

    return {
      objective: this._state.originalObjective,
      keyResults: updatedKeyResults,
    };
  }

  cancelEdits() {
    if (!this._state.isEditing) {
      throw new Error('Cannot cancel edits when not in edit mode');
    }

    const draftKeyResults = this._state.originalKeyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric ?? '',
      owner: kr.owner ?? '',
    }));

    this._state = {
      isEditing: false,
      originalObjective: this._state.originalObjective,
      originalKeyResults: [...this._state.originalKeyResults],
      draftObjective: this._state.originalObjective,
      draftKeyResults,
      isDirty: false,
      isValid: true,
      errors: [],
    };
  }

  recalculateState(state) {
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

  calculateDirty(state) {
    if (state.draftObjective !== state.originalObjective) {
      return true;
    }

    if (state.draftKeyResults.length !== state.originalKeyResults.length) {
      return true;
    }

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

  validateState(state) {
    const errors = [];

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

module.exports = { EditModeStore: EditModeStoreMock };
