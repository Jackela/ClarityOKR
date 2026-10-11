import { EditModeStore } from './edit-mode.store';
import { VALIDATION_LIMITS } from './edit-mode.types';

describe('Actual edit draft, validation and commit contract', () => {
  const originals = [
    { id: 'a', statement: 'First result' },
    { id: 'b', statement: 'Second result', owner: 'Team', successMetric: '90%' },
  ];
  it('keeps originals intact, saves valid edits, and resets dirty state', () => {
    const store = new EditModeStore();
    expect(() => store.saveEdits()).toThrow('not in edit mode');
    expect(() => store.cancelEdits()).toThrow('not in edit mode');
    store.enterEditMode('Original objective', originals);
    expect(store.originalObjective()).toBe('Original objective');
    expect(store.originalKeyResults()).toEqual(originals);
    expect(store.draftKeyResults()[0]).toMatchObject({ owner: '', successMetric: '' });
    expect(store.isDirty()).toBe(false);
    store.updateObjective('Updated objective');
    store.updateKeyResult('a', {
      statement: 'Updated first',
      owner: 'Owner',
      successMetric: '75%',
    });
    expect(store.isDirty()).toBe(true);
    expect(store.isValid()).toBe(true);
    expect(originals[0].statement).toBe('First result');
    const saved = store.saveEdits();
    expect(saved).toEqual({
      objective: 'Updated objective',
      keyResults: [
        { id: 'a', statement: 'Updated first', owner: 'Owner', successMetric: '75%' },
        originals[1],
      ],
    });
    expect(store.isEditing()).toBe(false);
    expect(store.isDirty()).toBe(false);
    store.toggleEditMode();
    expect(store.isEditing()).toBe(true);
    expect(store.draftObjective()).toBe('Updated objective');
    store.toggleEditMode();
    expect(store.isEditing()).toBe(false);
  });

  it('reverts cancelled edits, treats unchanged metadata as clean and rejects unknown result IDs', () => {
    const store = new EditModeStore();
    store.enterEditMode('Objective', originals);
    store.updateKeyResult('b', { owner: 'Team', successMetric: '90%' });
    expect(store.isDirty()).toBe(false);
    store.updateKeyResult('b', { owner: 'Other' });
    expect(store.isDirty()).toBe(true);
    expect(() => store.updateKeyResult('missing', { statement: 'Invalid' })).toThrow('not found');
    store.updateObjective('Changed');
    store.cancelEdits();
    expect(store.getState()).toMatchObject({
      isEditing: false,
      isDirty: false,
      isValid: true,
      originalObjective: 'Objective',
      draftObjective: 'Objective',
      errors: [],
    });
    expect(store.originalKeyResults()).toEqual(originals);
    store.toggleEditMode();
    store.saveEdits();
    expect(store.originalKeyResults()[0].owner).toBeUndefined();
  });

  it('provides actionable validation errors at empty and length boundaries', () => {
    const store = new EditModeStore();
    store.enterEditMode('Objective', originals);
    store.updateObjective('  ');
    store.updateKeyResult('a', { statement: '' });
    expect(store.isValid()).toBe(false);
    expect(store.errors().map((error) => error.field)).toEqual([
      'objective',
      'keyResults.a.statement',
    ]);
    store.updateObjective('A'.repeat(VALIDATION_LIMITS.objectiveMaxLength + 1));
    store.updateKeyResult('a', { statement: 'A'.repeat(VALIDATION_LIMITS.keyResultMaxLength + 1) });
    expect(
      store
        .errors()
        .map((error) => error.message)
        .join(' '),
    ).toContain('超过');
    store.updateObjective('A'.repeat(VALIDATION_LIMITS.objectiveMaxLength));
    store.updateKeyResult('a', { statement: 'A'.repeat(VALIDATION_LIMITS.keyResultMaxLength) });
    expect(store.isValid()).toBe(true);
    expect(store.errors()).toEqual([]);
    store.updateObjective('Objective');
    store.updateKeyResult('a', { statement: 'First result' });
    expect(store.isDirty()).toBe(false);
  });
});

describe('Undo / redo of text edits (spec §3.9)', () => {
  const originals = [
    { id: 'a', statement: 'First', successMetric: '10' },
    { id: 'b', statement: 'Second' },
  ];
  let store: EditModeStore;
  let now: number;

  beforeEach(() => {
    now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    store = new EditModeStore();
    store.enterEditMode('Objective', originals, 'okr-1');
  });

  afterEach(() => jest.restoreAllMocks());

  it('starts with nothing to undo or redo', () => {
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('undo restores the earlier text, redo brings the change back', () => {
    store.updateObjective('Changed');
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.draftObjective()).toBe('Objective');
    expect(store.isDirty()).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.draftObjective()).toBe('Changed');
    expect(store.isDirty()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });

  it('covers objective, statement and metric edits, each a step of its own', () => {
    store.updateObjective('O2');
    store.updateKeyResult('a', { statement: 'S2' });
    store.updateKeyResult('a', { successMetric: 'M2' });
    store.undo();
    expect(store.draftKeyResults()[0]).toMatchObject({ statement: 'S2', successMetric: '10' });
    store.undo();
    expect(store.draftKeyResults()[0]).toMatchObject({ statement: 'First' });
    expect(store.draftObjective()).toBe('O2');
    store.undo();
    expect(store.draftObjective()).toBe('Objective');
  });

  it('typing in one field within a second is one step; a pause starts a new one', () => {
    store.updateObjective('O');
    store.updateObjective('Ob');
    now += 300;
    store.updateObjective('Obj');
    store.undo();
    expect(store.draftObjective()).toBe('Objective');
    expect(store.canUndo()).toBe(false);
    store.redo();
    now += 5_000;
    store.updateObjective('Obje');
    store.undo();
    expect(store.draftObjective()).toBe('Obj');
  });

  it('a new edit after an undo drops the redo branch', () => {
    store.updateObjective('One');
    now += 2_000;
    store.updateObjective('Two');
    store.undo();
    now += 2_000;
    store.updateObjective('Three');
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.draftObjective()).toBe('One');
  });

  it('undo and redo do nothing at the ends', () => {
    store.undo();
    store.redo();
    expect(store.draftObjective()).toBe('Objective');
    expect(store.isDirty()).toBe(false);
  });

  it('keeps the history over a save: the saved text can still be undone and is then dirty again', () => {
    store.updateObjective('Saved text');
    store.saveEdits();
    expect(store.isEditing()).toBe(false);
    store.enterEditMode('Saved text', [...originals], 'okr-1');
    expect(store.canUndo()).toBe(true);
    expect(store.isDirty()).toBe(false);
    store.undo();
    expect(store.draftObjective()).toBe('Objective');
    expect(store.isDirty()).toBe(true); // an uncommitted change against the saved text
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.draftObjective()).toBe('Saved text');
    expect(store.isDirty()).toBe(false);
  });

  it('the first edit after a save is a new step, not merged into the saved one', () => {
    store.updateObjective('Saved');
    store.saveEdits();
    store.enterEditMode('Saved', [...originals], 'okr-1');
    store.updateObjective('Saved!');
    store.undo();
    expect(store.draftObjective()).toBe('Saved');
    expect(store.isDirty()).toBe(false);
  });

  it('cancel goes back to the saved text and forgets the typed steps, older ones stay', () => {
    store.updateObjective('Saved');
    store.saveEdits();
    store.enterEditMode('Saved', [...originals], 'okr-1');
    now += 2_000;
    store.updateObjective('Typed');
    store.cancelEdits();
    store.enterEditMode('Saved', [...originals], 'okr-1');
    expect(store.draftObjective()).toBe('Saved');
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.draftObjective()).toBe('Objective');
  });

  it('opening another OKR starts a new history', () => {
    store.updateObjective('Changed');
    store.cancelEdits();
    store.enterEditMode('Other', [{ id: 'z', statement: 'Z' }], 'okr-2');
    expect(store.canUndo()).toBe(false);
    store.updateObjective('Other2');
    store.undo();
    expect(store.draftObjective()).toBe('Other');
    store.undo();
    expect(store.draftObjective()).toBe('Other');
  });

  it('text that changed underneath (regeneration) starts a new history', () => {
    store.updateObjective('Mine');
    store.saveEdits();
    store.enterEditMode('Regenerated', [{ id: 'n', statement: 'New' }], 'okr-1');
    expect(store.canUndo()).toBe(false);
  });

  it('clearHistory forgets everything', () => {
    store.updateObjective('Mine');
    store.saveEdits();
    store.clearHistory();
    store.enterEditMode('Mine', [...originals], 'okr-1');
    expect(store.canUndo()).toBe(false);
  });

  it('adding a key result is a step; undo removes the empty row again', () => {
    store.addKeyResult('new');
    expect(store.draftKeyResults().map((kr) => kr.id)).toEqual(['a', 'b', 'new']);
    expect(store.isDirty()).toBe(true);
    expect(store.isValid()).toBe(false); // empty text
    store.undo();
    expect(store.draftKeyResults().map((kr) => kr.id)).toEqual(['a', 'b']);
    expect(store.isDirty()).toBe(false);
    store.redo();
    expect(store.draftKeyResults()).toHaveLength(3);
  });

  it('enterEditMode can append the empty row right away', () => {
    store.cancelEdits();
    store.enterEditMode('Objective', originals, 'okr-1', 'n1');
    expect(store.draftKeyResults().at(-1)).toMatchObject({ id: 'n1', statement: '' });
    expect(store.canUndo()).toBe(true);
  });

  it('progress is not part of the history: it only holds text', () => {
    store.updateObjective('Changed');
    const keys = Object.keys(store.getState().draftKeyResults[0]!).sort();
    expect(keys).toEqual(['id', 'owner', 'statement', 'successMetric']);
  });
});

describe('Limits are grapheme based (spec §3.9a)', () => {
  it('counts an emoji as one and flags 201 characters, in all three fields', () => {
    const store = new EditModeStore();
    store.enterEditMode('Objective', [{ id: 'a', statement: 'x' }], 'okr-1');
    const family = '👨‍👩‍👧‍👦';
    store.updateObjective(family.repeat(200));
    store.updateKeyResult('a', { statement: '😀'.repeat(200), successMetric: '度'.repeat(200) });
    expect(store.isValid()).toBe(true);
    store.updateKeyResult('a', { successMetric: '度'.repeat(201) });
    expect(store.errors().map((e) => e.field)).toEqual(['keyResults.a.successMetric']);
    store.updateKeyResult('a', { statement: '😀'.repeat(201), successMetric: '' });
    expect(store.errors().map((e) => e.field)).toEqual(['keyResults.a.statement']);
  });

  it('a stacked-combining cluster is invalid with the special-symbols message', () => {
    const store = new EditModeStore();
    store.enterEditMode('Objective', [{ id: 'a', statement: 'x' }], 'okr-1');
    store.updateObjective('a' + '\u0301'.repeat(40));
    expect(store.errors()).toEqual([
      { field: 'objective', message: '内容里的特殊符号过多，请删减后再保存。' },
    ]);
  });
});
