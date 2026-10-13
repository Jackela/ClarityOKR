import { describe, expect, it } from '@jest/globals';

import {
  planRegeneration,
  readReturnedKeyResults,
  type CurrentKr,
} from '../../../app/main/src/regenerate/plan-regeneration.js';

const cur = (id: string, text = id): CurrentKr => ({ id, statement: text, successMetric: 'm' });
const three = [cur('a'), cur('b'), cur('c')];
let n = 0;
const newId = (): string => `new-${++n}`;

describe('planRegeneration (spec §3.7)', () => {
  it('all ids back, same order: updated; text and metric replaced', () => {
    n = 0;
    const plan = planRegeneration(
      three,
      [
        { id: 'a', statement: 'A2', successMetric: 'x' },
        { id: 'b', statement: 'B2' },
        { id: 'c', statement: 'C2', successMetric: 'z' },
      ],
      newId,
    );
    expect(plan.summary).toMatchObject({ outcome: 'updated', kept: 3, added: 0, removed: 0 });
    expect(plan.keyResults).toEqual([
      { id: 'a', statement: 'A2', successMetric: 'x' },
      { id: 'b', statement: 'B2', successMetric: null },
      { id: 'c', statement: 'C2', successMetric: 'z' },
    ]);
  });

  it('all ids back in another order: reordered, list follows the model', () => {
    const plan = planRegeneration(
      three,
      [
        { id: 'c', statement: 'C' },
        { id: 'a', statement: 'A' },
        { id: 'b', statement: 'B' },
      ],
      newId,
    );
    expect(plan.summary.outcome).toBe('reordered');
    expect(plan.keyResults.map((k) => k.id)).toEqual(['c', 'a', 'b']);
  });

  it('id missing (same count): changed with missingIds, unmatched old ones removed', () => {
    n = 0;
    const plan = planRegeneration(
      three,
      [{ id: 'a', statement: 'A' }, { statement: 'X' }, { id: 'zzz', statement: 'Y' }],
      newId,
    );
    expect(plan.summary).toMatchObject({
      outcome: 'changed',
      kept: 1,
      added: 2,
      removed: 2,
      missingIds: 2,
      addedIds: ['new-1', 'new-2'],
    });
    expect(plan.keyResults.map((k) => k.id)).toEqual(['a', 'new-1', 'new-2']);
  });

  it('more key results than before: added without the "no number" sentence', () => {
    const plan = planRegeneration(
      three,
      [
        { id: 'a', statement: 'A' },
        { id: 'b', statement: 'B' },
        { id: 'c', statement: 'C' },
        { id: 'extra', statement: 'D', successMetric: '5 次' },
      ],
      newId,
    );
    expect(plan.summary).toMatchObject({ outcome: 'changed', added: 1, removed: 0, missingIds: 0 });
    expect(plan.keyResults[3]!.successMetric).toBe('5 次');
  });

  it('fewer key results: the missing one is removed', () => {
    const plan = planRegeneration(
      three,
      [
        { id: 'a', statement: 'A' },
        { id: 'c', statement: 'C' },
      ],
      newId,
    );
    expect(plan.summary).toMatchObject({ outcome: 'changed', kept: 2, added: 0, removed: 1 });
  });

  it('a repeated id counts once (the second is new)', () => {
    const plan = planRegeneration(
      [cur('a')],
      [
        { id: 'a', statement: 'A' },
        { id: 'a', statement: 'A again' },
      ],
      newId,
    );
    expect(plan.summary.kept).toBe(1);
    expect(plan.summary.added).toBe(1);
  });

  it('partial, all back: only the selected change; ids outside the selection are ignored', () => {
    const plan = planRegeneration(
      three,
      [
        { id: 'b', statement: 'B2' },
        { id: 'a', statement: 'IGNORED' },
        { statement: 'IGNORED TOO' },
      ],
      newId,
      ['b'],
    );
    expect(plan.summary).toMatchObject({
      outcome: 'partial_updated',
      requested: 1,
      kept: 1,
      removed: 0,
      added: 0,
    });
    expect(plan.keyResults.map((k) => k.statement)).toEqual(['a', 'B2', 'c']);
  });

  it('partial, one selected not returned: removed, order kept', () => {
    const plan = planRegeneration(three, [{ id: 'a', statement: 'A2' }], newId, ['a', 'c']);
    expect(plan.summary).toMatchObject({ outcome: 'partial_removed', requested: 2, removed: 1 });
    expect(plan.keyResults.map((k) => k.id)).toEqual(['a', 'b']);
  });
});

describe('readReturnedKeyResults', () => {
  it('canonical draft: metric = target + measurement; ids optional', () => {
    expect(
      readReturnedKeyResults({
        draft: {
          objectives: [
            {
              keyResults: [
                { id: 'a', statement: ' A ', target: '2天', measurement: '耗时' },
                { statement: 'B', target: 80, measurement: '' },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      { id: 'a', statement: 'A', successMetric: '2天 耗时' },
      { statement: 'B', successMetric: '80' },
    ]);
  });

  it('flat shape and junk', () => {
    expect(
      readReturnedKeyResults({ keyResults: [{ id: 'x', statement: 'S', successMetric: 'M' }] }),
    ).toEqual([{ id: 'x', statement: 'S', successMetric: 'M' }]);
    expect(readReturnedKeyResults(null)).toBeNull();
    expect(readReturnedKeyResults({ keyResults: [] })).toBeNull();
    expect(readReturnedKeyResults({ keyResults: [{ statement: '' }] })).toBeNull();
  });
});
