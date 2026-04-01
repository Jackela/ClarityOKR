import type { KeyResult } from '@clarityokr/contracts';

/**
 * Validation error structure for edit mode
 */
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Draft key result with editable fields
 */
interface DraftKeyResult {
  id: string;
  statement: string;
  successMetric: string;
  owner: string;
}

/**
 * Edit mode state interface - TBD in T038
 * @see T035 - Test specification
 * @see T038 - Store implementation
 */
interface EditModeState {
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
 * Edit mode store interface - TBD in T038
 */
interface IEditModeStore {
  getState(): EditModeState;
  enterEditMode(objective: string, keyResults: KeyResult[]): void;
  exitEditMode(): void;
  updateObjective(text: string): void;
  updateKeyResult(id: string, updates: Partial<DraftKeyResult>): void;
  saveEdits(): { objective: string; keyResults: KeyResult[] };
  cancelEdits(): void;
}

/**
 * EditModeStore unit tests
 * Tests will FAIL initially (red phase) - store to be implemented in T038
 * @see T035
 */
describe('EditModeStore', () => {
  let store: IEditModeStore;

  /**
   * Helper to build KeyResult objects with defaults
   */
  function buildKeyResult(overrides: Partial<KeyResult> = {}): KeyResult {
    return {
      id: `kr-${Math.random().toString(36).slice(2)}`,
      statement: '默认关键结果',
      successMetric: '指标 >= 90%',
      owner: '测试团队',
      ...overrides,
    };
  }

  /**
   * Helper to create initial test data
   */
  function createInitialData(): { objective: string; keyResults: KeyResult[] } {
    return {
      objective: '提升团队交付效率',
      keyResults: [
        buildKeyResult({
          id: 'kr-1',
          statement: '将交付周期从 4 周缩短到 2 周',
          successMetric: '周期 <= 14 天',
          owner: '研发团队',
        }),
        buildKeyResult({
          id: 'kr-2',
          statement: '代码审查通过率提升到 90%',
          successMetric: '通过率 >= 90%',
          owner: '开发团队',
        }),
        buildKeyResult({
          id: 'kr-3',
          statement: '自动化测试覆盖率提升到 80%',
          successMetric: '覆盖率 >= 80%',
          owner: 'QA团队',
        }),
      ],
    };
  }

  beforeEach(() => {
    // Store will be implemented in T038
    // This will fail until EditModeStore is implemented
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EditModeStore } = require('@clarityokr/renderer/app/okr-sticky/stores/edit-mode.store');
    store = new EditModeStore();
  });

  describe('initial state', () => {
    it('should have isEditing as false initially', () => {
      const state = store.getState();
      expect(state.isEditing).toBe(false);
    });

    it('should have empty objective fields initially', () => {
      const state = store.getState();
      expect(state.originalObjective).toBe('');
      expect(state.draftObjective).toBe('');
    });

    it('should have empty key results arrays initially', () => {
      const state = store.getState();
      expect(state.originalKeyResults).toEqual([]);
      expect(state.draftKeyResults).toEqual([]);
    });

    it('should have isDirty as false initially', () => {
      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should have isValid as true initially', () => {
      const state = store.getState();
      expect(state.isValid).toBe(true);
    });

    it('should have empty errors array initially', () => {
      const state = store.getState();
      expect(state.errors).toEqual([]);
    });
  });

  describe('enter edit mode', () => {
    it('should set isEditing to true when entering edit mode', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.isEditing).toBe(true);
    });

    it('should capture original objective value', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.originalObjective).toBe('提升团队交付效率');
    });

    it('should initialize draftObjective with current objective', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.draftObjective).toBe('提升团队交付效率');
    });

    it('should capture original key results', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.originalKeyResults).toHaveLength(3);
      expect(state.originalKeyResults[0].id).toBe('kr-1');
    });

    it('should initialize draftKeyResults with current key results', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.draftKeyResults).toHaveLength(3);
      expect(state.draftKeyResults[0].statement).toBe('将交付周期从 4 周缩短到 2 周');
    });

    it('should set isDirty to false when entering edit mode', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should clear errors when entering edit mode', () => {
      const { objective, keyResults } = createInitialData();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.errors).toEqual([]);
      expect(state.isValid).toBe(true);
    });
  });

  describe('exit edit mode', () => {
    it('should set isEditing to false when exiting edit mode', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);

      store.exitEditMode();

      const state = store.getState();
      expect(state.isEditing).toBe(false);
    });

    it('should preserve original values after exit', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
      store.updateObjective('修改后的目标');

      store.exitEditMode();

      const state = store.getState();
      expect(state.originalObjective).toBe('提升团队交付效率');
      expect(state.originalKeyResults).toHaveLength(3);
    });
  });

  describe('toggle edit mode', () => {
    it('should toggle from viewing to editing', () => {
      const { objective, keyResults } = createInitialData();

      expect(store.getState().isEditing).toBe(false);

      store.enterEditMode(objective, keyResults);
      expect(store.getState().isEditing).toBe(true);
    });

    it('should toggle from editing to viewing', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);

      store.exitEditMode();

      expect(store.getState().isEditing).toBe(false);
    });
  });

  describe('update objective text (draft)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should update draftObjective when text changes', () => {
      store.updateObjective('新的目标描述');

      const state = store.getState();
      expect(state.draftObjective).toBe('新的目标描述');
    });

    it('should not modify originalObjective when updating draft', () => {
      store.updateObjective('新的目标描述');

      const state = store.getState();
      expect(state.originalObjective).toBe('提升团队交付效率');
    });

    it('should set isDirty to true when objective changes', () => {
      store.updateObjective('新的目标描述');

      const state = store.getState();
      expect(state.isDirty).toBe(true);
    });

    it('should keep isDirty false when objective remains unchanged', () => {
      store.updateObjective('提升团队交付效率');

      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should handle empty objective text', () => {
      store.updateObjective('');

      const state = store.getState();
      expect(state.draftObjective).toBe('');
      expect(state.isDirty).toBe(true);
    });

    it('should handle objective with special characters', () => {
      const specialText = '目标 <script>alert("xss")</script> & more 🎉';
      store.updateObjective(specialText);

      const state = store.getState();
      expect(state.draftObjective).toBe(specialText);
    });
  });

  describe('update key result text (draft)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should update key result statement', () => {
      store.updateKeyResult('kr-1', { statement: '新的关键结果描述' });

      const state = store.getState();
      const kr = state.draftKeyResults.find((k) => k.id === 'kr-1');
      expect(kr?.statement).toBe('新的关键结果描述');
    });

    it('should update key result successMetric', () => {
      store.updateKeyResult('kr-1', { successMetric: '新的指标 >= 95%' });

      const state = store.getState();
      const kr = state.draftKeyResults.find((k) => k.id === 'kr-1');
      expect(kr?.successMetric).toBe('新的指标 >= 95%');
    });

    it('should update key result owner', () => {
      store.updateKeyResult('kr-1', { owner: '新团队' });

      const state = store.getState();
      const kr = state.draftKeyResults.find((k) => k.id === 'kr-1');
      expect(kr?.owner).toBe('新团队');
    });

    it('should update multiple fields at once', () => {
      store.updateKeyResult('kr-1', {
        statement: '新描述',
        successMetric: '新指标',
        owner: '新团队',
      });

      const state = store.getState();
      const kr = state.draftKeyResults.find((k) => k.id === 'kr-1');
      expect(kr?.statement).toBe('新描述');
      expect(kr?.successMetric).toBe('新指标');
      expect(kr?.owner).toBe('新团队');
    });

    it('should not modify other key results when updating one', () => {
      store.updateKeyResult('kr-1', { statement: '修改后的KR1' });

      const state = store.getState();
      const kr2 = state.draftKeyResults.find((k) => k.id === 'kr-2');
      expect(kr2?.statement).toBe('代码审查通过率提升到 90%');
    });

    it('should set isDirty to true when key result changes', () => {
      store.updateKeyResult('kr-1', { statement: '修改后的描述' });

      const state = store.getState();
      expect(state.isDirty).toBe(true);
    });

    it('should keep isDirty false when key result remains unchanged', () => {
      store.updateKeyResult('kr-1', { statement: '将交付周期从 4 周缩短到 2 周' });

      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should throw error when updating non-existent key result', () => {
      expect(() => {
        store.updateKeyResult('kr-nonexistent', { statement: '新描述' });
      }).toThrow();
    });

    it('should not modify original key results when updating draft', () => {
      store.updateKeyResult('kr-1', { statement: '新描述' });

      const state = store.getState();
      expect(state.originalKeyResults[0].statement).toBe('将交付周期从 4 周缩短到 2 周');
    });
  });

  describe('save edits (commit changes)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should return updated objective and key results on save', () => {
      store.updateObjective('保存后的目标');
      store.updateKeyResult('kr-1', { statement: '保存后的KR' });

      const result = store.saveEdits();

      expect(result.objective).toBe('保存后的目标');
      expect(result.keyResults[0].statement).toBe('保存后的KR');
    });

    it('should exit edit mode after save', () => {
      store.updateObjective('修改后的目标');
      store.saveEdits();

      const state = store.getState();
      expect(state.isEditing).toBe(false);
    });

    it('should reset isDirty to false after save', () => {
      store.updateObjective('修改后的目标');
      store.saveEdits();

      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should update original values to saved values', () => {
      store.updateObjective('修改后的目标');
      store.saveEdits();

      const state = store.getState();
      expect(state.originalObjective).toBe('修改后的目标');
      expect(state.draftObjective).toBe('修改后的目标');
    });

    it('should clear errors after successful save', () => {
      store.updateObjective(''); // This might cause validation error
      store.saveEdits();

      const state = store.getState();
      expect(state.errors).toEqual([]);
      expect(state.isValid).toBe(true);
    });

    it('should throw if trying to save when not in edit mode', () => {
      store.exitEditMode();

      expect(() => {
        store.saveEdits();
      }).toThrow();
    });
  });

  describe('cancel edits (revert to original)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should revert draftObjective to originalObjective on cancel', () => {
      store.updateObjective('修改后的目标');
      store.cancelEdits();

      const state = store.getState();
      expect(state.draftObjective).toBe('提升团队交付效率');
    });

    it('should revert draftKeyResults to originalKeyResults on cancel', () => {
      store.updateKeyResult('kr-1', { statement: '修改后的KR' });
      store.cancelEdits();

      const state = store.getState();
      expect(state.draftKeyResults[0].statement).toBe('将交付周期从 4 周缩短到 2 周');
    });

    it('should exit edit mode on cancel', () => {
      store.updateObjective('修改后的目标');
      store.cancelEdits();

      const state = store.getState();
      expect(state.isEditing).toBe(false);
    });

    it('should reset isDirty to false on cancel', () => {
      store.updateObjective('修改后的目标');
      store.cancelEdits();

      const state = store.getState();
      expect(state.isDirty).toBe(false);
    });

    it('should clear errors on cancel', () => {
      store.updateObjective('');
      store.cancelEdits();

      const state = store.getState();
      expect(state.errors).toEqual([]);
      expect(state.isValid).toBe(true);
    });

    it('should keep original values unchanged after cancel', () => {
      const originalObjective = store.getState().originalObjective;
      store.updateObjective('修改后的目标');
      store.cancelEdits();

      const state = store.getState();
      expect(state.originalObjective).toBe(originalObjective);
    });

    it('should throw if trying to cancel when not in edit mode', () => {
      store.exitEditMode();

      expect(() => {
        store.cancelEdits();
      }).toThrow();
    });
  });

  describe('dirty state tracking', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should track isDirty when objective changes', () => {
      expect(store.getState().isDirty).toBe(false);

      store.updateObjective('修改后的目标');
      expect(store.getState().isDirty).toBe(true);
    });

    it('should track isDirty when key result changes', () => {
      expect(store.getState().isDirty).toBe(false);

      store.updateKeyResult('kr-1', { statement: '修改后的KR' });
      expect(store.getState().isDirty).toBe(true);
    });

    it('should track isDirty when any field of key result changes', () => {
      store.updateKeyResult('kr-1', { successMetric: '新指标' });
      expect(store.getState().isDirty).toBe(true);

      store.cancelEdits();
      store.enterEditMode(store.getState().originalObjective, store.getState().originalKeyResults);

      store.updateKeyResult('kr-1', { owner: '新团队' });
      expect(store.getState().isDirty).toBe(true);
    });

    it('should not be dirty when changes are reverted to original', () => {
      store.updateObjective('修改后的目标');
      expect(store.getState().isDirty).toBe(true);

      store.updateObjective('提升团队交付效率');
      expect(store.getState().isDirty).toBe(false);
    });

    it('should be dirty when only some changes are reverted', () => {
      store.updateObjective('修改后的目标');
      store.updateKeyResult('kr-1', { statement: '修改后的KR' });

      store.updateObjective('提升团队交付效率');
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('validation - objective max length (200)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should be valid when objective is at max length (200)', () => {
      const validText = 'A'.repeat(200);
      store.updateObjective(validText);

      const state = store.getState();
      expect(state.isValid).toBe(true);
      expect(state.errors).toEqual([]);
    });

    it('should be invalid when objective exceeds max length (201)', () => {
      const invalidText = 'A'.repeat(201);
      store.updateObjective(invalidText);

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors).toContainEqual({
        field: 'objective',
        message: '目标描述不能超过200个字符',
      });
    });

    it('should add validation error for too long objective', () => {
      store.updateObjective('A'.repeat(250));

      const state = store.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].field).toBe('objective');
    });

    it('should clear validation error when objective is fixed', () => {
      store.updateObjective('A'.repeat(250));
      expect(store.getState().isValid).toBe(false);

      store.updateObjective('有效的目标');
      const state = store.getState();
      expect(state.isValid).toBe(true);
      expect(state.errors).toEqual([]);
    });
  });

  describe('validation - key result max length (180)', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should be valid when KR statement is at max length (180)', () => {
      const validText = 'B'.repeat(180);
      store.updateKeyResult('kr-1', { statement: validText });

      const state = store.getState();
      expect(state.isValid).toBe(true);
      expect(state.errors).toEqual([]);
    });

    it('should be invalid when KR statement exceeds max length (181)', () => {
      const invalidText = 'B'.repeat(181);
      store.updateKeyResult('kr-1', { statement: invalidText });

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors).toContainEqual({
        field: 'keyResults.kr-1.statement',
        message: '关键结果描述不能超过180个字符',
      });
    });

    it('should add validation error for too long KR statement', () => {
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });

      const state = store.getState();
      expect(state.errors.length).toBeGreaterThan(0);
      expect(state.errors[0].field).toContain('keyResults');
    });

    it('should validate each key result independently', () => {
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });
      store.updateKeyResult('kr-2', { statement: '有效的KR描述' });

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors.length).toBe(1);
    });

    it('should accumulate errors for multiple invalid KRs', () => {
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });
      store.updateKeyResult('kr-2', { statement: 'C'.repeat(200) });

      const state = store.getState();
      expect(state.errors).toHaveLength(2);
    });
  });

  describe('validation - empty/invalid values', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should be invalid when objective is empty', () => {
      store.updateObjective('');

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors).toContainEqual({
        field: 'objective',
        message: '目标描述不能为空',
      });
    });

    it('should be invalid when objective contains only whitespace', () => {
      store.updateObjective('   \t\n  ');

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors).toContainEqual({
        field: 'objective',
        message: '目标描述不能为空',
      });
    });

    it('should be invalid when KR statement is empty', () => {
      store.updateKeyResult('kr-1', { statement: '' });

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors).toContainEqual({
        field: 'keyResults.kr-1.statement',
        message: '关键结果描述不能为空',
      });
    });

    it('should be invalid when KR statement contains only whitespace', () => {
      store.updateKeyResult('kr-1', { statement: '   \t\n  ' });

      const state = store.getState();
      expect(state.isValid).toBe(false);
    });

    it('should allow empty successMetric (optional field)', () => {
      store.updateKeyResult('kr-1', { successMetric: '' });

      const state = store.getState();
      expect(state.isValid).toBe(true);
    });

    it('should allow empty owner (optional field)', () => {
      store.updateKeyResult('kr-1', { owner: '' });

      const state = store.getState();
      expect(state.isValid).toBe(true);
    });

    it('should accumulate multiple validation errors', () => {
      store.updateObjective('');
      store.updateKeyResult('kr-1', { statement: '' });
      store.updateKeyResult('kr-2', { statement: '' });

      const state = store.getState();
      expect(state.isValid).toBe(false);
      expect(state.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validation errors tracking', () => {
    beforeEach(() => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
    });

    it('should track all validation errors', () => {
      store.updateObjective('A'.repeat(250));
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });

      const state = store.getState();
      expect(state.errors).toHaveLength(2);
    });

    it('should include field name in error', () => {
      store.updateObjective('');

      const state = store.getState();
      expect(state.errors[0].field).toBe('objective');
    });

    it('should include error message in error', () => {
      store.updateObjective('');

      const state = store.getState();
      expect(state.errors[0].message).toBeDefined();
      expect(typeof state.errors[0].message).toBe('string');
    });

    it('should remove specific error when field is fixed', () => {
      store.updateObjective('');
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });
      expect(store.getState().errors).toHaveLength(2);

      store.updateObjective('有效的目标');
      const state = store.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].field).toContain('kr-1');
    });

    it('should keep isValid false while any error exists', () => {
      store.updateObjective('');
      store.updateKeyResult('kr-1', { statement: '' });

      store.updateObjective('有效的目标');
      const state = store.getState();
      expect(state.isValid).toBe(false);
    });

    it('should set isValid true when all errors are cleared', () => {
      store.updateObjective('');
      store.updateKeyResult('kr-1', { statement: 'B'.repeat(200) });

      store.updateObjective('有效的目标');
      store.updateKeyResult('kr-1', { statement: '有效的KR' });

      const state = store.getState();
      expect(state.isValid).toBe(true);
      expect(state.errors).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle entering edit mode with empty key results', () => {
      store.enterEditMode('目标', []);

      const state = store.getState();
      expect(state.isEditing).toBe(true);
      expect(state.draftKeyResults).toEqual([]);
    });

    it('should handle very long text within limits', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);

      const longObjective = '目标 '.repeat(50); // 100 chars with spaces
      store.updateObjective(longObjective);

      const state = store.getState();
      expect(state.isValid).toBe(true);
    });

    it('should handle key result with all fields', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);

      store.updateKeyResult('kr-1', {
        statement: '完整的KR描述',
        successMetric: '指标 >= 100%',
        owner: '完整团队名称',
      });

      const state = store.getState();
      const kr = state.draftKeyResults.find((k) => k.id === 'kr-1');
      expect(kr).toEqual({
        id: 'kr-1',
        statement: '完整的KR描述',
        successMetric: '指标 >= 100%',
        owner: '完整团队名称',
      });
    });

    it('should handle re-entering edit mode after cancel', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
      store.updateObjective('修改后的目标');
      store.cancelEdits();

      store.enterEditMode(objective, keyResults);

      const state = store.getState();
      expect(state.isEditing).toBe(true);
      expect(state.draftObjective).toBe('提升团队交付效率');
      expect(state.isDirty).toBe(false);
    });

    it('should handle re-entering edit mode after save', () => {
      const { objective, keyResults } = createInitialData();
      store.enterEditMode(objective, keyResults);
      store.updateObjective('保存后的目标');
      store.saveEdits();

      const savedObjective = store.getState().originalObjective;
      const savedKeyResults = store.getState().originalKeyResults;

      store.enterEditMode(savedObjective, savedKeyResults);

      const state = store.getState();
      expect(state.isEditing).toBe(true);
      expect(state.draftObjective).toBe('保存后的目标');
      expect(state.isDirty).toBe(false);
    });
  });
});
