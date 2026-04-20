import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';
import { SessionRepository } from '../../../app/main/src/persistence/session-repository';
import { OkrRepository } from '../../../app/main/src/persistence/okr-repository';
import { DatabaseService } from '../../../app/main/src/persistence/database.service';
import { SQLiteActionLogWriter } from '../../../app/main/src/persistence/sqlite-action-log-writer';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  opsPerSecond: number;
}

function generateMockSession(id: string): ClarificationSession {
  return {
    id,
    initialIntent: 'Test intent for benchmarking',
    status: 'collecting',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    selectedOptionIds: [],
    confidence: 0.85,
  };
}

function generateMockOKR(sessionId: string): OKRDocument {
  return {
    id: `okr-${sessionId}`,
    objective: 'Benchmark test objective',
    keyResults: [
      {
        id: 'kr-1',
        statement: 'Key result 1 for benchmarking',
        successMetric: '100% completion',
        owner: 'Test Owner',
      },
      {
        id: 'kr-2',
        statement: 'Key result 2 for benchmarking',
        successMetric: '95% accuracy',
      },
    ],
    sourceSessionId: sessionId,
    generatedAt: new Date().toISOString(),
    regenerationPolicy: 'overwrite',
    manualEdits: [],
  };
}

function generateMockActionLog(sessionId: string, count: number): UserActionLogEntry[] {
  const entries: UserActionLogEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      id: `action-${i}`,
      actionType: 'generate',
      sessionId,
      okrId: `okr-${sessionId}`,
      payloadSummary: `Action ${i} summary`,
      occurredAt: new Date().toISOString(),
    });
  }
  return entries;
}

async function benchmark<T>(
  operation: string,
  fn: () => Promise<T>,
  iterations: number,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTimeMs = times.reduce((sum, time) => sum + time, 0);
  const avgTimeMs = totalTimeMs / iterations;
  const minTimeMs = Math.min(...times);
  const maxTimeMs = Math.max(...times);
  const opsPerSecond = (iterations / totalTimeMs) * 1000;

  return {
    operation,
    iterations,
    totalTimeMs,
    avgTimeMs,
    minTimeMs,
    maxTimeMs,
    opsPerSecond,
  };
}

function printResult(result: BenchmarkResult): void {
  console.log(`\n📊 ${result.operation}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total Time: ${result.totalTimeMs.toFixed(2)}ms`);
  console.log(`  Average Time: ${result.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min Time: ${result.minTimeMs.toFixed(2)}ms`);
  console.log(`  Max Time: ${result.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Ops/Second: ${result.opsPerSecond.toFixed(2)}`);
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('Persistence Benchmarks', () => {
  let tempDir: string;
  let sessionRepo: SessionRepository;
  let okrRepo: OkrRepository;
  let actionLogWriter: SQLiteActionLogWriter;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    tempDir = join(tmpdir(), `clarityokr-bench-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    sessionRepo = new SessionRepository(tempDir);
    okrRepo = new OkrRepository(tempDir);
    databaseService = new DatabaseService({ dataDir: tempDir, filename: 'benchmark.db' });
    databaseService.initialize();
    actionLogWriter = new SQLiteActionLogWriter(databaseService);
  });

  afterAll(async () => {
    databaseService.close();
    await cleanupDir(tempDir);
  });

  afterEach(async () => {
    databaseService.close();
    await cleanupDir(tempDir);
    await fs.mkdir(tempDir, { recursive: true });
    databaseService = new DatabaseService({ dataDir: tempDir, filename: 'benchmark.db' });
    databaseService.initialize();
    actionLogWriter = new SQLiteActionLogWriter(databaseService);
  });

  describe('SessionRepository Benchmarks', () => {
    it('should benchmark session save operations', async () => {
      const result = await benchmark(
        'SessionRepository.saveSession',
        async () => {
          const session = generateMockSession(`session-${Date.now()}`);
          await sessionRepo.saveSession(session);
        },
        100,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(50);
      expect(result.opsPerSecond).toBeGreaterThan(20);
    });

    it('should benchmark session load operations', async () => {
      const session = generateMockSession('benchmark-session');
      await sessionRepo.saveSession(session);

      const result = await benchmark(
        'SessionRepository.load',
        async () => {
          await sessionRepo.load();
        },
        100,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(30);
      expect(result.opsPerSecond).toBeGreaterThan(30);
    });

    it('should benchmark save + load cycle', async () => {
      const result = await benchmark(
        'SessionRepository.saveSession + load',
        async () => {
          const session = generateMockSession(`session-${Date.now()}`);
          await sessionRepo.saveSession(session);
          await sessionRepo.load();
        },
        50,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(80);
      expect(result.opsPerSecond).toBeGreaterThan(12);
    });
  });

  describe('OkrRepository Benchmarks', () => {
    it('should benchmark OKR save operations', async () => {
      const result = await benchmark(
        'OkrRepository.save',
        async () => {
          const okr = generateMockOKR(`session-${Date.now()}`);
          await okrRepo.save(okr);
        },
        100,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(50);
      expect(result.opsPerSecond).toBeGreaterThan(20);
    });

    it('should benchmark OKR load operations', async () => {
      const okr = generateMockOKR('benchmark-session');
      await okrRepo.save(okr);

      const result = await benchmark(
        'OkrRepository.loadLatest',
        async () => {
          await okrRepo.loadLatest();
        },
        100,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(30);
      expect(result.opsPerSecond).toBeGreaterThan(30);
    });

    it('should benchmark save + load cycle', async () => {
      const result = await benchmark(
        'OkrRepository.save + loadLatest',
        async () => {
          const okr = generateMockOKR(`session-${Date.now()}`);
          await okrRepo.save(okr);
          await okrRepo.loadLatest();
        },
        50,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(80);
      expect(result.opsPerSecond).toBeGreaterThan(12);
    });
  });

  describe('ActionLogWriter Benchmarks', () => {
    it('should benchmark single action log append', async () => {
      const sessionId = 'benchmark-session';

      const result = await benchmark(
        'ActionLogWriter.append (single)',
        async () => {
          const entry = generateMockActionLog(sessionId, 1)[0];
          await actionLogWriter.append(entry);
        },
        100,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(60);
      expect(result.opsPerSecond).toBeGreaterThan(16);
    });

    it('should benchmark action log read with 100 entries', async () => {
      const sessionId = 'benchmark-session';
      const entries = generateMockActionLog(sessionId, 100);

      await actionLogWriter.append(entries[0]);
      for (let i = 1; i < entries.length; i++) {
        await actionLogWriter.append(entries[i]);
      }

      const result = await benchmark(
        'ActionLogWriter.all (100 entries)',
        async () => {
          await actionLogWriter.all();
        },
        50,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(50);
      expect(result.opsPerSecond).toBeGreaterThan(20);
    });

    it('should benchmark append with growing log (10 -> 50 entries)', async () => {
      const sessionId = 'benchmark-session';

      for (let size = 10; size <= 50; size += 10) {
        await cleanupDir(tempDir);
        await fs.mkdir(tempDir, { recursive: true });
        databaseService.close();
        databaseService = new DatabaseService({ dataDir: tempDir, filename: 'benchmark.db' });
        databaseService.initialize();
        actionLogWriter = new SQLiteActionLogWriter(databaseService);

        const entries = generateMockActionLog(sessionId, size);
        for (const entry of entries) {
          await actionLogWriter.append(entry);
        }

        const result = await benchmark(
          `ActionLogWriter.append (${size} existing entries)`,
          async () => {
            const newEntry = generateMockActionLog(sessionId, 1)[0];
            await actionLogWriter.append(newEntry);
          },
          20,
        );

        printResult(result);

        expect(result.avgTimeMs).toBeLessThan(100);
        expect(result.opsPerSecond).toBeGreaterThan(10);
      }
    });
  });

  describe('Combined Operations Benchmarks', () => {
    it('should benchmark full workflow: save session, save OKR, append log', async () => {
      const result = await benchmark(
        'Full Workflow (session + OKR + log)',
        async () => {
          const sessionId = `session-${Date.now()}`;
          const session = generateMockSession(sessionId);
          const okr = generateMockOKR(sessionId);
          const logEntry = generateMockActionLog(sessionId, 1)[0];

          await sessionRepo.saveSession(session);
          await sessionRepo.saveOKRDocument(okr);
          await actionLogWriter.append(logEntry);
        },
        30,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(150);
      expect(result.opsPerSecond).toBeGreaterThan(6);
    });

    it('should benchmark load all persisted state', async () => {
      const sessionId = 'benchmark-session';
      const session = generateMockSession(sessionId);
      const okr = generateMockOKR(sessionId);
      const logEntries = generateMockActionLog(sessionId, 10);

      await sessionRepo.saveSession(session);
      await sessionRepo.saveOKRDocument(okr);
      for (const entry of logEntries) {
        await actionLogWriter.append(entry);
      }

      const result = await benchmark(
        'Load All State (session + OKR + 10 log entries)',
        async () => {
          await sessionRepo.load();
          await okrRepo.loadLatest();
          await actionLogWriter.all();
        },
        50,
      );

      printResult(result);

      expect(result.avgTimeMs).toBeLessThan(100);
      expect(result.opsPerSecond).toBeGreaterThan(10);
    });
  });
});
