import type { OKRDocument, KeyResult, ManualEditRecord } from '@clarityokr/contracts';
import { OkrProjectionService } from '@clarityokr/renderer/app/okr-sticky/services/okr-projection.service';

/**
 * ViewModel interface for the OKR sticky note display.
 * This interface defines the contract that the projection service must implement.
 * @see T026 - Projection service implementation
 */
interface KeyResultViewModel {
  id: string;
  statement: string;
  metricLabel: string | null;
  ownerLabel: string | null;
}

interface OkrStickyViewModel {
  objective: string;
  keyResults: KeyResultViewModel[];
  generatedAt: string; // formatted ISO string
  lastEditedAt: string | null;
  hasManualEdits: boolean;
  regenerationPolicy: 'overwrite' | 'append';
}

/**
 * Projection service interface.
 * @see T026 - Projection service implementation
 */
interface IOkrProjectionService {
  project(document: OKRDocument): OkrStickyViewModel;
}

describe('OkrProjectionService', () => {
  let service: IOkrProjectionService;

  beforeEach(() => {
    service = new OkrProjectionService();
  });

  /**
   * Helper to build KeyResult objects with defaults
   */
  function buildKeyResult(overrides: Partial<KeyResult> = {}): KeyResult {
    return {
      id: `kr-${Math.random().toString(36).slice(2)}`,
      statement: '默认关键结果',
      successMetric: undefined,
      owner: undefined,
      ...overrides,
    };
  }

  /**
   * Helper to build OKRDocument objects with defaults
   */
  function buildOKRDocument(overrides: Partial<OKRDocument> = {}): OKRDocument {
    return {
      id: 'okr-1',
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
          owner: undefined,
        }),
        buildKeyResult({
          id: 'kr-3',
          statement: '自动化测试覆盖率提升到 80%',
          successMetric: '覆盖率 >= 80%',
          owner: 'QA团队',
        }),
        buildKeyResult({
          id: 'kr-4',
          statement: '生产环境故障恢复时间控制在 30 分钟内',
          owner: '运维团队',
        }),
        buildKeyResult({
          id: 'kr-5',
          statement: '每月发布版本数增加到 4 个',
          successMetric: '版本数 >= 4/月',
          owner: '产品团队',
        }),
      ],
      sourceSessionId: 'session-123',
      generatedAt: '2025-03-27T10:00:00.000Z',
      lastEditedAt: null,
      regenerationPolicy: 'overwrite',
      manualEdits: [],
      ...overrides,
    };
  }

  /**
   * Helper to build ManualEditRecord objects
   */
  function buildManualEdit(overrides: Partial<ManualEditRecord> = {}): ManualEditRecord {
    return {
      id: `edit-${Math.random().toString(36).slice(2)}`,
      fieldPath: 'objective',
      previousValue: '旧值',
      newValue: '新值',
      editedAt: '2025-03-27T12:00:00.000Z',
      ...overrides,
    };
  }

  describe('basic transformation', () => {
    it('should transform OKRDocument with 1 Objective + 3-5 KRs to ViewModel', () => {
      // Arrange
      const okr = buildOKRDocument();

      // Act
      const viewModel = service.project(okr);

      // Assert
      expect(viewModel.objective).toBe('提升团队交付效率');
      expect(viewModel.keyResults).toHaveLength(5);

      // Verify first KR has all fields
      expect(viewModel.keyResults[0]).toEqual({
        id: 'kr-1',
        statement: '将交付周期从 4 周缩短到 2 周',
        metricLabel: '周期 <= 14 天',
        ownerLabel: '研发团队',
      });

      // Verify KR without owner has null ownerLabel
      expect(viewModel.keyResults[1].ownerLabel).toBeNull();

      // Verify KR without successMetric has null metricLabel
      expect(viewModel.keyResults[3].metricLabel).toBeNull();
    });

    it('should transform with minimum 3 KRs', () => {
      const okr = buildOKRDocument({
        keyResults: [
          buildKeyResult({ id: 'kr-1', statement: 'KR 1' }),
          buildKeyResult({ id: 'kr-2', statement: 'KR 2' }),
          buildKeyResult({ id: 'kr-3', statement: 'KR 3' }),
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.keyResults).toHaveLength(3);
    });
  });

  describe('null/empty handling', () => {
    it('should handle null OKR data gracefully', () => {
      // Act & Assert - should throw with descriptive message
      expect(() => service.project(null as unknown as OKRDocument)).toThrow();
    });

    it('should handle empty objective', () => {
      const okr = buildOKRDocument({ objective: '' });

      const viewModel = service.project(okr);

      expect(viewModel.objective).toBe('');
    });

    it('should handle empty keyResults array', () => {
      const okr = buildOKRDocument({ keyResults: [] });

      // Should either throw or return empty array - behavior TBD in T026
      expect(() => service.project(okr)).toThrow();
    });
  });

  describe('manual edit detection', () => {
    it('should detect manual edits when manualEdits array has items', () => {
      const okr = buildOKRDocument({
        manualEdits: [buildManualEdit()],
      });

      const viewModel = service.project(okr);

      expect(viewModel.hasManualEdits).toBe(true);
    });

    it('should not flag hasManualEdits when manualEdits array is empty', () => {
      const okr = buildOKRDocument({ manualEdits: [] });

      const viewModel = service.project(okr);

      expect(viewModel.hasManualEdits).toBe(false);
    });

    it('should detect multiple manual edits', () => {
      const okr = buildOKRDocument({
        manualEdits: [
          buildManualEdit({ id: 'edit-1', fieldPath: 'objective' }),
          buildManualEdit({ id: 'edit-2', fieldPath: 'keyResults[0].statement' }),
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.hasManualEdits).toBe(true);
    });
  });

  describe('date formatting', () => {
    it('should format generatedAt date for display', () => {
      const okr = buildOKRDocument({
        generatedAt: '2025-03-27T10:30:45.123Z',
      });

      const viewModel = service.project(okr);

      // Should preserve ISO format or transform to display format
      expect(viewModel.generatedAt).toBeDefined();
      expect(typeof viewModel.generatedAt).toBe('string');
    });

    it('should handle null lastEditedAt', () => {
      const okr = buildOKRDocument({ lastEditedAt: null });

      const viewModel = service.project(okr);

      expect(viewModel.lastEditedAt).toBeNull();
    });

    it('should format lastEditedAt date when present', () => {
      const okr = buildOKRDocument({
        lastEditedAt: '2025-03-27T15:45:30.000Z',
      });

      const viewModel = service.project(okr);

      expect(viewModel.lastEditedAt).toBe('2025-03-27T15:45:30.000Z');
    });

    it('should handle undefined lastEditedAt', () => {
      const okr = buildOKRDocument({ lastEditedAt: undefined });

      const viewModel = service.project(okr);

      expect(viewModel.lastEditedAt).toBeNull();
    });
  });

  describe('regeneration policy display', () => {
    it("should display 'overwrite' policy correctly", () => {
      const okr = buildOKRDocument({ regenerationPolicy: 'overwrite' });

      const viewModel = service.project(okr);

      expect(viewModel.regenerationPolicy).toBe('overwrite');
    });

    it("should display 'append' policy correctly", () => {
      const okr = buildOKRDocument({ regenerationPolicy: 'append' });

      const viewModel = service.project(okr);

      expect(viewModel.regenerationPolicy).toBe('append');
    });
  });

  describe('optional fields handling', () => {
    it('should handle missing successMetric on KeyResult', () => {
      const okr = buildOKRDocument({
        keyResults: [
          buildKeyResult({
            id: 'kr-1',
            statement: '没有指标的关键结果',
            successMetric: undefined,
          }),
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.keyResults[0].metricLabel).toBeNull();
    });

    it('should handle missing owner on KeyResult', () => {
      const okr = buildOKRDocument({
        keyResults: [
          buildKeyResult({
            id: 'kr-1',
            statement: '没有负责人的关键结果',
            owner: undefined,
          }),
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.keyResults[0].ownerLabel).toBeNull();
    });

    it('should handle KeyResult with all optional fields missing', () => {
      const okr = buildOKRDocument({
        keyResults: [
          {
            id: 'kr-minimal',
            statement: '最小化关键结果',
          } as KeyResult,
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.keyResults[0]).toEqual({
        id: 'kr-minimal',
        statement: '最小化关键结果',
        metricLabel: null,
        ownerLabel: null,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very long objective text', () => {
      const longObjective = 'A'.repeat(500);
      const okr = buildOKRDocument({ objective: longObjective });

      const viewModel = service.project(okr);

      expect(viewModel.objective).toBe(longObjective);
    });

    it('should handle special characters in objective and KR statements', () => {
      const okr = buildOKRDocument({
        objective: '目标 <script>alert("xss")</script> & more',
        keyResults: [
          buildKeyResult({
            id: 'kr-1',
            statement: '关键结果 with 日本語 and 🎉 emoji',
          }),
        ],
      });

      const viewModel = service.project(okr);

      expect(viewModel.objective).toContain('<script>');
      expect(viewModel.keyResults[0].statement).toContain('日本語');
    });

    it('should handle KeyResult with empty string optional fields', () => {
      const okr = buildOKRDocument({
        keyResults: [
          buildKeyResult({
            id: 'kr-1',
            statement: '测试',
            successMetric: '',
            owner: '',
          }),
        ],
      });

      const viewModel = service.project(okr);

      // Empty strings should be treated as null/empty for display
      expect(viewModel.keyResults[0].metricLabel).toBe('');
      expect(viewModel.keyResults[0].ownerLabel).toBe('');
    });
  });
});
