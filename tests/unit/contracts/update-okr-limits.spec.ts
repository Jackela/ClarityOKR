import { okrDocumentSchema, updateOKRRequestSchema } from '@clarityokr/contracts';

const FAMILY = '👨‍👩‍👧‍👦';
const base = {
  id: 'okr-1',
  objective: '目标',
  keyResults: [{ id: 'kr-1', statement: '关键结果' }],
};

/**
 * Spec §3.9a: the main process validates text edits with the same grapheme rules as the UI
 * (200 for objective, key result text and metric); the old UTF-16 limit of 180 is gone.
 */
describe('okr:update text limits (grapheme based)', () => {
  it('accepts exactly 200 characters in objective, key result and metric', () => {
    const ok = updateOKRRequestSchema.safeParse({
      id: 'okr-1',
      objective: '目'.repeat(200),
      keyResults: [{ id: 'kr-1', statement: '结'.repeat(200), successMetric: '度'.repeat(200) }],
    });
    expect(ok.success).toBe(true);
  });

  it.each([
    ['objective', { ...base, objective: '目'.repeat(201) }],
    ['statement', { ...base, keyResults: [{ id: 'kr-1', statement: '结'.repeat(201) }] }],
    [
      'metric',
      { ...base, keyResults: [{ id: 'kr-1', statement: 'x', successMetric: '度'.repeat(201) }] },
    ],
  ])('rejects 201 characters in the %s (never truncates)', (_name, payload) => {
    const result = updateOKRRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('too_long');
  });

  it('counts an emoji as one character: 200 family emoji pass, 201 fail', () => {
    expect(
      updateOKRRequestSchema.safeParse({ ...base, objective: FAMILY.repeat(200) }).success,
    ).toBe(true);
    expect(
      updateOKRRequestSchema.safeParse({ ...base, objective: FAMILY.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects a stacked-combining-mark cluster of more than 32 code units', () => {
    const result = updateOKRRequestSchema.safeParse({
      ...base,
      keyResults: [{ id: 'kr-1', statement: 'a' + '\u0301'.repeat(40) }],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('cluster_too_long');
  });

  it('still rejects empty text and an empty key result list', () => {
    expect(updateOKRRequestSchema.safeParse({ ...base, objective: '' }).success).toBe(false);
    expect(
      updateOKRRequestSchema.safeParse({ ...base, keyResults: [{ id: 'kr-1', statement: '' }] })
        .success,
    ).toBe(false);
    expect(updateOKRRequestSchema.safeParse({ ...base, keyResults: [] }).success).toBe(false);
  });

  it('the stored document accepts what the form allows (181–200 characters)', () => {
    const doc = okrDocumentSchema.safeParse({
      id: 'okr-1',
      objective: '目标',
      keyResults: [{ id: 'kr-1', statement: '结'.repeat(190), successMetric: '度'.repeat(190) }],
      sourceSessionId: 's',
      generatedAt: '2026-10-09T00:00:00.000Z',
      regenerationPolicy: 'overwrite',
      manualEdits: [],
    });
    expect(doc.success).toBe(true);
  });
});

describe('there is no owner field any more', () => {
  it('the key result schema rejects a key result that carries one', () => {
    const result = okrDocumentSchema.safeParse({
      id: 'okr-1',
      objective: '目标',
      keyResults: [{ id: 'kr-1', statement: '关键结果', owner: '团队' }],
      sourceSessionId: 's',
      generatedAt: '2026-10-10T00:00:00.000Z',
      regenerationPolicy: 'append',
      manualEdits: [],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('owner');
  });

  it('an explicit undefined owner is rejected as well (nothing carries the key)', () => {
    const result = okrDocumentSchema.safeParse({
      id: 'okr-1',
      objective: '目标',
      keyResults: [{ id: 'kr-1', statement: '关键结果', owner: undefined }],
      sourceSessionId: 's',
      generatedAt: '2026-10-10T00:00:00.000Z',
      regenerationPolicy: 'append',
      manualEdits: [],
    });
    expect(result.success).toBe(false);
  });

  it('okr:update rejects an owner on a key result too', () => {
    const result = updateOKRRequestSchema.safeParse({
      ...base,
      keyResults: [{ id: 'kr-1', statement: '关键结果', owner: '团队' }],
    });
    expect(result.success).toBe(false);
  });

  it('a key result without owner is accepted', () => {
    expect(
      okrDocumentSchema.safeParse({
        id: 'okr-1',
        objective: '目标',
        keyResults: [{ id: 'kr-1', statement: '关键结果', successMetric: '度量' }],
        sourceSessionId: 's',
        generatedAt: '2026-10-10T00:00:00.000Z',
        regenerationPolicy: 'append',
        manualEdits: [],
      }).success,
    ).toBe(true);
  });
});
