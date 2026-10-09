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
