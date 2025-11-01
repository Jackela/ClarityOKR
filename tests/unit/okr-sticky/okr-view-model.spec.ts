import { OkrProjectionService } from '../../../app/renderer/src/app/okr-sticky/services/okr-projection.service';
import type { OKRDocument } from '@clarityokr/contracts';

describe('OkrProjectionService', () => {
  const service = new OkrProjectionService();

  function buildOkR(overrides: Partial<OKRDocument> = {}): OKRDocument {
    return {
      id: 'okr-1',
      objective: '提升团队交付节奏',
      keyResults: [
        {
          id: 'kr-1',
          statement: '把交付周期从 4 周缩短到 3 周',
          successMetric: '周期 <= 21 天',
          owner: '运营团队'
        },
        {
          id: 'kr-2',
          statement: '将上线缺陷率控制在 0.5%',
          successMetric: '缺陷率 0.5%',
          owner: undefined
        }
      ],
      sourceSessionId: 'session-123',
      generatedAt: '2025-10-31T10:12:00.000Z',
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: [],
      ...overrides
    };
  }

  it('maps OKR documents into sticky note view models', () => {
    const okr = buildOkR();

    const viewModel = service.project(okr);

    expect(viewModel.objective).toBe('提升团队交付节奏');
    expect(viewModel.generatedAt).toBe('2025-10-31T10:12:00.000Z');
    expect(viewModel.lastEditedAt).toBeNull();
    expect(viewModel.regenerationPolicy).toBe('append');
    expect(viewModel.hasManualEdits).toBe(false);
    expect(viewModel.keyResults).toHaveLength(2);
    expect(viewModel.keyResults[0]).toEqual({
      id: 'kr-1',
      statement: '把交付周期从 4 周缩短到 3 周',
      metricLabel: '周期 <= 21 天',
      ownerLabel: '运营团队'
    });
    expect(viewModel.keyResults[1]).toEqual({
      id: 'kr-2',
      statement: '将上线缺陷率控制在 0.5%',
      metricLabel: '缺陷率 0.5%',
      ownerLabel: null
    });
  });

  it('flags documents that include manual edits', () => {
    const okr = buildOkR({
      manualEdits: [
        {
          id: 'edit-1',
          fieldPath: 'objective',
          previousValue: '旧目标',
          newValue: '新目标',
          editedAt: '2025-10-31T12:00:00.000Z'
        }
      ],
      lastEditedAt: '2025-10-31T12:00:00.000Z'
    });

    const viewModel = service.project(okr);

    expect(viewModel.hasManualEdits).toBe(true);
    expect(viewModel.lastEditedAt).toBe('2025-10-31T12:00:00.000Z');
  });

  it('throws when key results are missing', () => {
    const okr = buildOkR({ keyResults: [] });

    expect(() => service.project(okr)).toThrow(/Key Results are required for sticky note rendering/);
  });
});
