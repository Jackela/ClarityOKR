import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { IPC_CHANNELS, type ImportReply, type IpcResult } from '@clarityokr/contracts';
import { renderJson } from '../../../../app/main/src/export/export-document.js';
import { ExportService } from '../../../../app/main/src/export/export-service.js';
import { buildBackupFileName } from '../../../../app/main/src/export/export-file-name.js';
import { ImportService } from '../../../../app/main/src/import/import-service.js';
import { registerClosedLoopHandlers } from '../../../../app/main/src/ipc/closed-loop-handlers.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { loadExportSource } from '../../../../app/main/src/startup/closed-loop.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

function clock(start = Date.parse('2026-10-01T08:00:00.000Z')): () => Date {
  let t = start;
  return () => new Date((t += 1000));
}

function open() {
  const db = new BetterSqlite3(':memory:');
  applySchema(db);
  return { db, store: new OkrStore(db, clock()) };
}

/** Three OKRs: one with a removed KR, reverts and a review; one plain; one with a review only. */
function seed(store: OkrStore): void {
  const a = store.createObjective({
    title: '甲',
    period: '2026-Q4',
    keyResults: [{ statement: 'a1', successMetric: 'm' }, { statement: 'a2' }],
  });
  const [a1, a2] = a.keyResults.map((k) => k.id) as [string, string];
  store.setProgress(a1, { value: 20, status: 'in_progress' });
  store.setProgress(a1, { value: 50, status: 'in_progress' });
  store.revertLastProgress(a1);
  store.markKeyResultRemoved(a2);
  store.saveReview(a.id, { wentWell: '好', fellShort: '', nextSteps: '' });
  store.createObjective({ title: '乙', keyResults: [{ statement: 'b1' }] });
  const c = store.createObjective({ title: '丙', keyResults: [{ statement: 'c1' }] });
  store.saveReview(c.id, { wentWell: '', fellShort: '少', nextSteps: '' });
}

/** A single-OKR JSON with ids replaced by positions (ids are new after an import). */
function normalized(store: OkrStore, id: string): unknown {
  const doc = JSON.parse(renderJson(loadExportSource(store, id)!, new Date(0)));
  const kr = new Map<string, number>(doc.keyResults.map((k: any, i: number) => [k.id, i]));
  const entry = new Map<number, number>(doc.progressEntries.map((e: any, i: number) => [e.id, i]));
  doc.keyResults.forEach((k: any) => (k.id = kr.get(k.id)));
  doc.progressEntries.forEach((e: any) => {
    e.id = entry.get(e.id);
    e.krId = kr.get(e.krId);
    e.revertsEntryId = e.revertsEntryId === null ? null : entry.get(e.revertsEntryId);
  });
  doc.review?.snapshot.forEach((s: any) => (s.krId = kr.get(s.krId)));
  return doc;
}

describe('#50 full backup', () => {
  let dir: string;
  let source: { db: Database; store: OkrStore };
  let target: { db: Database; store: OkrStore };
  let savePath: string | null;
  let openPath: string | null;
  const handlers = new Map<string, Handler>();
  const invoke = async <T>(channel: string, payload?: unknown) =>
    (await handlers.get(channel)!({}, payload)) as IpcResult<T>;

  function wire(store: OkrStore): void {
    handlers.clear();
    registerClosedLoopHandlers(
      { handle: (c: string, fn: Handler) => void handlers.set(c, fn) } as never,
      {
        store,
        exportService: new ExportService({
          loadSource: (id) => loadExportSource(store, id),
          loadAllSources: () =>
            store
              .listObjectives()
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((o) => loadExportSource(store, o.id)!),
          appVersion: '0.2.0',
          showSaveDialog: async () => savePath,
          showItemInFolder: () => undefined,
          getDownloadsDir: () => dir,
          now: () => new Date('2026-10-15T07:58:00.000Z'),
        }),
        importService: new ImportService({
          showOpenDialog: async () => openPath,
          listExisting: () => store.listObjectiveSummaries(),
          write: (items) => store.importObjectives(items),
          isMemory: () => false,
        }),
        clipboard: { writeText: () => undefined },
      },
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-backup-'));
    source = open();
    target = open();
    savePath = join(dir, 'backup.json');
    openPath = savePath;
  });
  afterEach(() => {
    source.db.close();
    target.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('file name ClarityOKR-backup-YYYYMMDD-HHmm.json', () => {
    expect(buildBackupFileName(new Date(2026, 9, 15, 15, 58))).toBe(
      'ClarityOKR-backup-20261015-1558.json',
    );
  });

  it('AC1: back up N OKRs, import into an empty database, every OKR is the same (new ids only)', async () => {
    seed(source.store);
    wire(source.store);
    const saved = await invoke<any>(IPC_CHANNELS.EXPORT_BACKUP);
    expect(saved).toMatchObject({
      ok: true,
      data: { outcome: 'saved', count: 3, fileName: 'backup.json' },
    });
    const file = JSON.parse(readFileSync(savePath!, 'utf8'));
    expect(file).toMatchObject({ schemaVersion: 1, kind: 'backup', appVersion: '0.2.0' });
    expect(file.okrs.map((o: any) => o.objective.title)).toEqual(['甲', '乙', '丙']);

    wire(target.store);
    const preview = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK);
    expect(preview).toMatchObject({
      ok: true,
      data: { outcome: 'confirm', conflicts: [], backup: { appVersion: '0.2.0' } },
    });
    const token = (preview as any).data.token;
    const done = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_COMMIT, {
      token,
      onConflict: 'skip',
    });
    expect((done as any).data.imported).toHaveLength(3);

    const byTitle = (store: OkrStore) =>
      new Map(store.listObjectives().map((o) => [o.title, o.id] as const));
    const before = byTitle(source.store);
    const after = byTitle(target.store);
    for (const title of ['甲', '乙', '丙']) {
      expect(normalized(target.store, after.get(title)!)).toEqual(
        normalized(source.store, before.get(title)!),
      );
      expect(after.get(title)).not.toBe(before.get(title));
    }
  });

  it('AC2: no secret keys in the file', async () => {
    seed(source.store);
    wire(source.store);
    await invoke(IPC_CHANNELS.EXPORT_BACKUP);
    const text = readFileSync(savePath!, 'utf8');
    for (const key of ['apiKey', 'api_key', 'apikey', 'token', 'secret', 'password', 'baseUrl']) {
      expect(text.toLowerCase()).not.toContain(`"${key.toLowerCase()}"`);
    }
  });

  it('AC3: an empty history backs up as okrs: [] and importing it says there is nothing', async () => {
    wire(source.store);
    expect(await invoke(IPC_CHANNELS.EXPORT_BACKUP)).toMatchObject({
      ok: true,
      data: { outcome: 'saved', count: 0 },
    });
    expect(JSON.parse(readFileSync(savePath!, 'utf8')).okrs).toEqual([]);
    wire(target.store);
    expect(await invoke(IPC_CHANNELS.IMPORT_PICK)).toEqual({
      ok: true,
      data: { outcome: 'rejected', problem: { kind: 'empty_backup' } },
    });
  });

  it('AC4: one bad OKR refuses the whole file and names okrs[i].field; nothing written', async () => {
    seed(source.store);
    wire(source.store);
    await invoke(IPC_CHANNELS.EXPORT_BACKUP);
    const file = JSON.parse(readFileSync(savePath!, 'utf8'));
    file.okrs[2].keyResults[0].status = 'blocked';
    writeFileSync(savePath!, JSON.stringify(file));
    wire(target.store);
    const reply = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK);
    expect(reply).toMatchObject({
      ok: true,
      data: {
        outcome: 'rejected',
        problem: { kind: 'invalid', field: 'okrs[2].keyResults[0].status', okrIndex: 2 },
      },
    });
    expect(target.store.listObjectives()).toHaveLength(0);
  });

  it('B4: more than 10 KRs in a backup → 「第 n 个 OKR 有 count 个 KR，最多 10 个」, no field path', async () => {
    seed(source.store);
    wire(source.store);
    await invoke(IPC_CHANNELS.EXPORT_BACKUP);
    const file = JSON.parse(readFileSync(savePath!, 'utf8'));
    const kr = file.okrs[1].keyResults[0];
    file.okrs[1].keyResults = Array.from({ length: 11 }, (_, i) => ({
      ...kr,
      id: `${kr.id}-${i}`,
      position: i,
    }));
    writeFileSync(savePath!, JSON.stringify(file));
    wire(target.store);
    const reply = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK);
    expect(reply).toMatchObject({
      ok: true,
      data: {
        outcome: 'rejected',
        problem: {
          kind: 'invalid',
          field: '',
          reason: '第 2 个 OKR 有 11 个 KR，最多 10 个',
          okrIndex: 1,
        },
      },
    });
    expect(target.store.listObjectives()).toHaveLength(0);
  });

  /** N31: 500 OKRs, 3 KRs each, several progress records per KR and a review per OKR. */
  function seedLarge(store: OkrStore): void {
    const text = (label: string, i: number) =>
      `${label} ${i}：${'本季度推进情况说明。'.repeat(12)}`;
    for (let i = 0; i < 500; i++) {
      const o = store.createObjective({
        title: `目标 ${i}`,
        period: '2026-Q4',
        keyResults: [
          { statement: `关键结果 ${i}-1`, successMetric: '次数' },
          { statement: `关键结果 ${i}-2`, successMetric: '比例' },
          { statement: `关键结果 ${i}-3` },
        ],
      });
      for (const kr of o.keyResults) {
        for (const value of [10, 25, 40, 60]) {
          store.setProgress(kr.id, { value, status: value >= 40 ? 'at_risk' : 'in_progress' });
        }
        store.revertLastProgress(kr.id);
      }
      store.saveReview(o.id, {
        wentWell: text('做得好', i),
        fellShort: text('不足', i),
        nextSteps: text('下一步', i),
      });
    }
  }

  it('AC5 / N31: 500 OKRs with progress records and reviews back up in under 2 seconds', async () => {
    seedLarge(source.store);
    wire(source.store);
    const started = performance.now();
    const reply = await invoke(IPC_CHANNELS.EXPORT_BACKUP);
    const elapsed = performance.now() - started;
    expect(reply).toMatchObject({ ok: true, data: { outcome: 'saved', count: 500 } });
    const size = statSync(savePath!).size;
    // eslint-disable-next-line no-console
    console.log(
      `[N31] 500-OKR backup: ${(size / (1024 * 1024)).toFixed(2)} MB in ${Math.round(elapsed)} ms`,
    );
    expect(elapsed).toBeLessThan(2000);
  });

  describe('B5: size limits', () => {
    const MB = 1024 * 1024;
    /** A valid backup of the seed, padded with whitespace to at least `bytes`. */
    async function bigBackup(bytes: number, kindLast = false): Promise<string> {
      seed(source.store);
      wire(source.store);
      await invoke(IPC_CHANNELS.EXPORT_BACKUP);
      const file = JSON.parse(readFileSync(savePath!, 'utf8'));
      const { kind, ...rest } = file;
      const ordered = kindLast ? { ...rest, kind } : file;
      const body = JSON.stringify(ordered);
      const pad = ' '.repeat(Math.max(0, bytes - Buffer.byteLength(body)));
      // kindLast: the padding goes first, so the file start says nothing about the kind;
      // otherwise before the last brace, so the start of the file is unchanged
      const text = kindLast ? `{${pad}${body.slice(1)}` : `${body.slice(0, -1)}${pad}}`;
      const path = join(dir, 'big.json');
      writeFileSync(path, text);
      return path;
    }

    it('a backup over 5 MB imports in full', async () => {
      openPath = await bigBackup(6 * MB);
      wire(target.store);
      const preview = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK);
      expect(preview).toMatchObject({ ok: true, data: { outcome: 'confirm' } });
      const done = await invoke<ImportReply>(IPC_CHANNELS.IMPORT_COMMIT, {
        token: (preview as any).data.token,
        onConflict: 'skip',
      });
      expect((done as any).data.imported).toHaveLength(3);
      expect(target.store.listObjectives()).toHaveLength(3);
    });

    it('a backup with "kind" at the end of the file is still recognised', async () => {
      openPath = await bigBackup(6 * MB, true);
      const head = readFileSync(openPath, 'utf8').slice(0, 4096);
      expect(head).not.toMatch(/"kind"\s*:\s*"backup"/);
      wire(target.store);
      expect(await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK)).toMatchObject({
        ok: true,
        data: { outcome: 'confirm', backup: { appVersion: '0.2.0' } },
      });
    });

    it('a single OKR over 5 MB is rejected after parsing with the 5 MB wording', async () => {
      seed(source.store);
      const id = source.store.listObjectives()[0]!.id;
      const body = renderJson(loadExportSource(source.store, id)!, new Date(0));
      openPath = join(dir, 'single.json');
      writeFileSync(openPath, `${body.trimEnd().slice(0, -1)}${' '.repeat(6 * MB)}}`);
      wire(target.store);
      expect(await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK)).toMatchObject({
        ok: true,
        data: {
          outcome: 'rejected',
          problem: { kind: 'too_large', limitBytes: 5 * MB, backup: false },
        },
      });
      expect(target.store.listObjectives()).toHaveLength(0);
    });

    it('any file over 50 MB is rejected with the backup wording, unread', async () => {
      openPath = join(dir, 'huge.json');
      writeFileSync(openPath, Buffer.alloc(50 * MB + 1, 0x20));
      wire(target.store);
      expect(await invoke<ImportReply>(IPC_CHANNELS.IMPORT_PICK)).toMatchObject({
        ok: true,
        data: {
          outcome: 'rejected',
          problem: { kind: 'too_large', sizeBytes: 50 * MB + 1, limitBytes: 50 * MB, backup: true },
        },
      });
    });
  });

  it('conflicts with the history and inside the file (Q9-5); per-item choices, default skip (Q9-2)', async () => {
    seed(source.store);
    wire(source.store);
    await invoke(IPC_CHANNELS.EXPORT_BACKUP);
    const file = JSON.parse(readFileSync(savePath!, 'utf8'));
    file.okrs.push(structuredClone(file.okrs[1])); // 乙 twice in the same file
    writeFileSync(savePath!, JSON.stringify(file));

    // import into the source itself: all three exist already, plus the in-file duplicate
    const reply = await invoke<any>(IPC_CHANNELS.IMPORT_PICK);
    expect(reply.data.conflicts.map((c: any) => [c.index, c.source])).toEqual([
      [0, 'existing'],
      [1, 'existing'],
      [2, 'existing'],
      [3, 'existing'],
    ]);

    // into an empty database: only the in-file duplicate conflicts, the first copy is kept
    wire(target.store);
    const fresh = await invoke<any>(IPC_CHANNELS.IMPORT_PICK);
    expect(fresh.data.conflicts).toEqual([
      { index: 3, title: '乙', createdAt: file.okrs[1].objective.createdAt, source: 'in_file' },
    ]);
    const done = await invoke<any>(IPC_CHANNELS.IMPORT_COMMIT, {
      token: fresh.data.token,
      onConflict: 'skip',
      choices: { '3': 'copy' },
    });
    expect(done.data.imported.map((i: any) => i.title)).toEqual(['甲', '乙', '丙', '乙（导入）']);
  });

  it('choices are validated', async () => {
    wire(target.store);
    for (const choices of [[], { a: 'skip' }, { '1': 'replace' }, 'x']) {
      expect(
        await invoke(IPC_CHANNELS.IMPORT_COMMIT, { token: 't', onConflict: 'skip', choices }),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST', field: 'choices' } });
    }
  });
});
