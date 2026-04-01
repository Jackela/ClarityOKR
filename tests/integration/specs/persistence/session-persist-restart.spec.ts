import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRepository } from '../../../../app/main/src/persistence/session-repository.js';
import { OkrRepository } from '../../../../app/main/src/persistence/okr-repository.js';
import type { OKRDocument } from '../../../../packages/contracts/src/clarify-to-okr.contract';

describe('Integration: Session persistence across restart', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'clarityokr-persist-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('preserves session data after repository recreation', async () => {
    const sessionRepo1 = new SessionRepository(testDir);
    const session = {
      id: 'test-session-1',
      initialIntent: '提高效率',
      status: 'collecting' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'q1',
          sequence: 0,
          question: '你的目标是什么',
          context: 'initial',
          options: [{ id: 'opt1', label: '提高效率', scopeTag: 'llm' }],
        },
      ],
      selectedOptionIds: ['opt1'],
      confidence: 0.5,
      pendingQuestionId: 'q2',
    };

    await sessionRepo1.saveSession(session);

    // 模拟应用重启：创建新的repository实例
    const sessionRepo2 = new SessionRepository(testDir);
    const loaded = await sessionRepo2.load();

    expect(loaded.session).toEqual(session);
    expect(loaded.session?.initialIntent).toBe('提高效率');
    expect(loaded.session?.selectedOptionIds).toEqual(['opt1']);
  });

  it('preserves OKR data after repository recreation', async () => {
    const okrRepo1 = new OkrRepository(testDir);
    const okr: OKRDocument = {
      id: 'okr-1',
      objective: '提高执行力',
      keyResults: [
        { id: 'kr1', statement: 'KR1', successMetric: '10% improvement' },
        { id: 'kr2', statement: 'KR2', successMetric: '5 items' },
      ],
      sourceSessionId: 'session-1',
      generatedAt: new Date().toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'overwrite',
      manualEdits: [],
    };

    await okrRepo1.save(okr);

    // 模拟应用重启
    const okrRepo2 = new OkrRepository(testDir);
    const loaded = await okrRepo2.loadLatest();

    expect(loaded).toEqual(okr);
  });

  it('maintains data integrity after multiple saves', async () => {
    const sessionRepo = new SessionRepository(testDir);

    // 第一次保存
    const session1 = {
      id: 'test-session',
      initialIntent: '初始目标',
      status: 'collecting' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    };
    await sessionRepo.saveSession(session1);

    // 第二次保存 - 更新数据
    const session2 = {
      ...session1,
      initialIntent: '更新后的目标',
      selectedOptionIds: ['opt1'],
      updatedAt: new Date().toISOString(),
    };
    await sessionRepo.saveSession(session2);

    // 模拟重启后加载
    const sessionRepo2 = new SessionRepository(testDir);
    const loaded = await sessionRepo2.load();

    expect(loaded.session?.initialIntent).toBe('更新后的目标');
    expect(loaded.session?.selectedOptionIds).toEqual(['opt1']);
  });
});
