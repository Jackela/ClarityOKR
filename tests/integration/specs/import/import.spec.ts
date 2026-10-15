import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import {
  ALLOWED_CHANNELS,
  IMPORT_MAX_BYTES,
  IPC_CHANNELS,
  isAllowedChannel,
  type ImportReply,
  type IpcResult,
} from '@clarityokr/contracts';
import { renderJson } from '../../../../app/main/src/export/export-document.js';
import { ImportService, copyTitle } from '../../../../app/main/src/import/import-service.js';
import { parseImportFile } from '../../../../app/main/src/import/import-document.js';
import { registerClosedLoopHandlers } from '../../../../app/main/src/ipc/closed-loop-handlers.js';
import { ExportService } from '../../../../app/main/src/export/export-service.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { loadExportSource } from '../../../../app/main/src/startup/closed-loop.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

/** A fixed clock that moves one second per call, so entries get distinct timestamps. */
function clock(start = Date.parse('2026-10-01T08:00:00.000Z')): () => Date {
  let t = start;
  return () => new Date((t += 1000));
}

function seed(store: OkrStore): string {
  const okr = store.createObjective({
    title: '提升团队交付节奏',
    period: '2026-Q4',
    keyResults: [
      { statement: '每周发布一次', successMetric: '发布次数' },
      { statement: '缺陷率下降', successMetric: null },
      { statement: '会被移除的 KR' },
    ],
  });
  const [a, b, c] = okr.keyResults.map((k) => k.id) as [string, string, string];
  store.pinObjective(okr.id);
  store.setProgress(a, { value: 20, status: 'in_progress' });
  store.setProgress(a, { value: 40, status: 'in_progress' });
  store.replaceLastProgress(a, { value: 30, status: 'at_risk' });
  store.revertLastProgress(a);
  store.setProgress(b, { value: null, status: 'done' });
  store.setProgress(c, { value: 10, status: 'in_progress' });
  store.saveReview(okr.id, { wentWell: '节奏稳定', fellShort: '', nextSteps: '继续' });
  store.markKeyResultRemoved(c);
  return okr.id;
}

const exportText = (store: OkrStore, id: string, at = new Date('2026-10-15T00:00:00Z')) =>
  renderJson(loadExportSource(store, id)!, at);

const counts = (db: Database) =>
  db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM objectives) o, (SELECT COUNT(*) FROM key_results) k,
              (SELECT COUNT(*) FROM progress_entries) p, (SELECT COUNT(*) FROM reviews) r`,
    )
    .get();

describe('#49 import', () => {
  let dir: string;
  let source: { db: Database; store: OkrStore };
  let target: { db: Database; store: OkrStore };
  let chosen: string | null;
  let memory: boolean;
  let service: ImportService;
  const handlers = new Map<string, Handler>();
  const invoke = async (channel: string, payload?: unknown) =>
    (await handlers.get(channel)!({}, payload)) as IpcResult<ImportReply>;

  const open = () => {
    const db = new BetterSqlite3(':memory:');
    applySchema(db);
    return { db, store: new OkrStore(db, clock()) };
  };
  const file = (name: string, content: string | Buffer) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    chosen = path;
    return path;
  };
  const pick = async () => {
    const r = await invoke(IPC_CHANNELS.IMPORT_PICK);
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-import-'));
    source = open();
    target = open();
    chosen = null;
    memory = false;
    handlers.clear();
    service = new ImportService({
      showOpenDialog: async () => chosen,
      listExisting: () => target.store.listObjectiveSummaries(),
      write: (items) => target.store.importObjectives(items),
      isMemory: () => memory,
    });
    registerClosedLoopHandlers(
      { handle: (channel: string, fn: Handler) => void handlers.set(channel, fn) } as never,
      {
        store: target.store,
        exportService: new ExportService({
          loadSource: (id) => loadExportSource(target.store, id),
          showSaveDialog: async () => null,
          showItemInFolder: () => undefined,
          getDownloadsDir: () => dir,
        }),
        importService: service,
        clipboard: { writeText: () => undefined },
      },
    );
  });
  afterEach(() => {
    source.db.close();
    target.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('round trip: export → import into an empty database → export is identical except exportedAt (AC1)', async () => {
    const id = seed(source.store);
    const original = exportText(source.store, id);
    file('okr.json', original);
    const reply = await pick();
    expect(reply).toMatchObject({ outcome: 'imported', skipped: [], memory: false });
    const imported = (reply as Extract<ImportReply, { outcome: 'imported' }>).imported;
    expect(imported).toHaveLength(1);
    expect(imported[0]!.okrId).not.toBe(id);
    const again = exportText(target.store, imported[0]!.okrId);
    // Ids are new by design (#49 scope): compare with ids replaced by their position.
    const strip = (t: string) => {
      const doc = JSON.parse(t);
      const kr = new Map<string, number>(doc.keyResults.map((k: any, i: number) => [k.id, i]));
      const entry = new Map<number, number>(
        doc.progressEntries.map((e: any, i: number) => [e.id, i]),
      );
      doc.exportedAt = null;
      doc.keyResults.forEach((k: any) => (k.id = kr.get(k.id)));
      doc.progressEntries.forEach((e: any) => {
        e.id = entry.get(e.id);
        e.krId = kr.get(e.krId);
        e.revertsEntryId = e.revertsEntryId === null ? null : entry.get(e.revertsEntryId);
      });
      doc.review?.snapshot.forEach((s: any) => (s.krId = kr.get(s.krId)));
      return doc;
    };
    expect(strip(again)).toEqual(strip(original));
    // new ids everywhere, and the references still line up
    const krIds = target.store.getObjective(imported[0]!.okrId)!.keyResults.map((k) => k.id);
    expect(krIds.some((k) => source.store.findKeyResult(k))).toBe(false);
    const entries = target.store.listProgressEntries(krIds[0]!);
    const latest = entries[entries.length - 1]!;
    expect(latest.kind).toBe('revert');
    expect(entries.map((e) => e.id)).toContain(latest.revertsEntryId);
    expect(service.hasSession()).toBe(false);
  });

  it('cancel writes nothing', async () => {
    chosen = null;
    expect(await pick()).toEqual({ outcome: 'cancelled' });
    expect(counts(target.db)).toEqual({ o: 0, k: 0, p: 0, r: 0 });
  });

  describe('bad files: a Chinese reason with the field, nothing written (AC2)', () => {
    let good: Record<string, unknown>;
    beforeEach(() => {
      good = JSON.parse(exportText(source.store, seed(source.store)));
    });
    const reject = async (content: string | Buffer) => {
      file('bad.json', content);
      const reply = await pick();
      expect(reply.outcome).toBe('rejected');
      expect(counts(target.db)).toEqual({ o: 0, k: 0, p: 0, r: 0 });
      expect(service.hasSession()).toBe(false);
      return (reply as Extract<ImportReply, { outcome: 'rejected' }>).problem;
    };
    const mutate = (fn: (doc: any) => void) => {
      const doc = structuredClone(good);
      fn(doc);
      return JSON.stringify(doc);
    };

    it('not JSON', async () => {
      expect(await reject('{ nope')).toEqual({ kind: 'not_json' });
      expect(await reject('[1,2]')).toEqual({ kind: 'not_json' });
    });
    it('wrong schemaVersion', async () => {
      expect(await reject(mutate((d) => (d.schemaVersion = 2)))).toEqual({
        kind: 'unsupported_version',
        version: '2',
      });
    });
    it('missing field', async () => {
      expect(await reject(mutate((d) => delete d.objective.title))).toMatchObject({
        kind: 'invalid',
        field: 'objective.title',
        reason: '缺失',
      });
    });
    it('illegal status', async () => {
      expect(await reject(mutate((d) => (d.keyResults[1].status = 'blocked')))).toMatchObject({
        field: 'keyResults[1].status',
      });
    });
    it('progress out of range, with the count of further problems', async () => {
      const problem = await reject(
        mutate((d) => {
          d.keyResults[2].progress = 150;
          d.keyResults[0].progress = -1;
        }),
      );
      expect(problem).toEqual({
        kind: 'invalid',
        field: 'keyResults[0].progress',
        reason: '超出 0–100',
        more: 1,
      });
    });
    it('krId pointing nowhere', async () => {
      expect(await reject(mutate((d) => (d.progressEntries[0].krId = 'ghost')))).toMatchObject({
        field: 'progressEntries[0].krId',
        reason: '指向的关键结果不存在',
      });
    });
    it('revertsEntryId pointing nowhere', async () => {
      const problem = await reject(
        mutate((d) => {
          const revert = d.progressEntries.find((e: any) => e.kind === 'revert');
          revert.revertsEntryId = 9999;
        }),
      );
      expect(problem).toMatchObject({ reason: '指向的进度记录不存在' });
    });
    it('review section over 2000 characters', async () => {
      expect(await reject(mutate((d) => (d.review.wentWell = '好'.repeat(2001))))).toMatchObject({
        field: 'review.wentWell',
        reason: '超过 2000 字',
      });
    });
    it('over 5 MB', async () => {
      const problem = await reject(Buffer.alloc(IMPORT_MAX_BYTES + 1, 0x20));
      expect(problem).toEqual({ kind: 'too_large', sizeBytes: IMPORT_MAX_BYTES + 1 });
    });
    it('a backup kind is not accepted yet', async () => {
      expect(await reject(mutate((d) => (d.kind = 'backup')))).toMatchObject({ field: 'kind' });
    });
    it('a file that cannot be read', async () => {
      chosen = join(dir, 'gone.json');
      expect(await pick()).toEqual({
        outcome: 'rejected',
        problem: { kind: 'read_failed', category: 'not_found' },
      });
    });
  });

  describe('conflicts (same title + createdAt): never overwrite (AC3)', () => {
    let text: string;
    beforeEach(async () => {
      text = exportText(source.store, seed(source.store));
      file('okr.json', text);
      await pick(); // the first import has no conflict
    });

    it('asks, with the conflict; skip writes nothing', async () => {
      const reply = await pick();
      expect(reply).toMatchObject({
        outcome: 'confirm',
        memory: false,
        conflicts: [{ index: 0, title: '提升团队交付节奏', source: 'existing' }],
      });
      const before = counts(target.db);
      const token = (reply as { token: string }).token;
      const done = await invoke(IPC_CHANNELS.IMPORT_COMMIT, { token, onConflict: 'skip' });
      expect(done).toMatchObject({ ok: true, data: { outcome: 'imported', imported: [] } });
      expect((done as any).data.skipped).toHaveLength(1);
      expect(counts(target.db)).toEqual(before);
      // the token was one-time
      expect(await invoke(IPC_CHANNELS.IMPORT_COMMIT, { token, onConflict: 'copy' })).toMatchObject(
        {
          ok: false,
          error: { code: 'NOT_FOUND' },
        },
      );
    });

    it('copy adds 「（导入）」 once; the original is untouched', async () => {
      const reply = (await pick()) as { token: string };
      const done = await invoke(IPC_CHANNELS.IMPORT_COMMIT, {
        token: reply.token,
        onConflict: 'copy',
      });
      expect(done).toMatchObject({
        ok: true,
        data: { outcome: 'imported', imported: [{ title: '提升团队交付节奏（导入）' }] },
      });
      const titles = target.store
        .listObjectiveSummaries()
        .map((o) => o.title)
        .sort();
      expect(titles).toEqual(['提升团队交付节奏', '提升团队交付节奏（导入）']);
      // only one stays pinned
      expect(target.store.listObjectiveSummaries().filter((o) => o.pinned)).toHaveLength(1);
      expect(copyTitle('甲（导入）')).toBe('甲（导入）');
      expect([...copyTitle('长'.repeat(200))].length).toBe(200);
    });

    it('discard forgets the file', async () => {
      const reply = (await pick()) as { token: string };
      expect(await invoke(IPC_CHANNELS.IMPORT_DISCARD, { token: reply.token })).toEqual({
        ok: true,
        data: { discarded: true },
      });
      expect(service.hasSession()).toBe(false);
    });
  });

  it('in-memory database: always confirm first (Q8-6)', async () => {
    memory = true;
    file('okr.json', exportText(source.store, seed(source.store)));
    const reply = await pick();
    expect(reply).toMatchObject({ outcome: 'confirm', conflicts: [], memory: true });
    expect(counts(target.db)).toMatchObject({ o: 0 });
    const done = await invoke(IPC_CHANNELS.IMPORT_COMMIT, {
      token: (reply as { token: string }).token,
      onConflict: 'skip',
    });
    expect(done).toMatchObject({ ok: true, data: { outcome: 'imported', memory: true } });
    expect(counts(target.db)).toMatchObject({ o: 1 });
  });

  it('a write that fails half way leaves nothing behind (AC4) and retry re-reads the same file (Q8-3)', async () => {
    const text = exportText(source.store, seed(source.store));
    file('okr.json', text);
    // the second OKR breaks a CHECK constraint after the first one's rows were inserted
    const broken = JSON.parse(text);
    broken.progressEntries[0].status = 'blocked';
    let fail = true;
    const failing = new ImportService({
      showOpenDialog: async () => chosen,
      listExisting: () => target.store.listObjectiveSummaries(),
      write: (items) =>
        target.store.importObjectives(fail ? [...items, { input: broken, title: 'x' }] : items),
      isMemory: () => false,
    });
    const first = await failing.pick();
    expect(first).toMatchObject({ outcome: 'write_failed', category: 'other' });
    expect(counts(target.db)).toEqual({ o: 0, k: 0, p: 0, r: 0 });

    fail = false;
    const token = (first as { token: string }).token;
    const retried = await failing.retry(token);
    expect(retried).toMatchObject({ outcome: 'imported' });
    expect(counts(target.db)).toMatchObject({ o: 1 });
    expect(await failing.retry(token)).toBeNull();
  });

  it('retry when the original file is gone: 「重新选择文件」 (Q8-3)', async () => {
    const text = exportText(source.store, seed(source.store));
    const path = file('okr.json', text);
    await pick();
    const conflict = (await pick()) as { token: string };
    unlinkSync(path);
    const reply = await invoke(IPC_CHANNELS.IMPORT_RETRY, { token: conflict.token });
    expect(reply).toEqual({ ok: true, data: { outcome: 'original_missing' } });
    expect(service.hasSession()).toBe(false);
  });

  it('no reply ever carries the file path, and requests are validated (AC5)', async () => {
    const path = file('okr.json', exportText(source.store, seed(source.store)));
    const replies = [await pick(), await pick()];
    for (const reply of replies) expect(JSON.stringify(reply)).not.toContain(dir);
    expect(path.startsWith(dir)).toBe(true);
    expect(
      await invoke(IPC_CHANNELS.IMPORT_COMMIT, { token: 't', onConflict: 'replace' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', field: 'onConflict' },
    });
    expect(await invoke(IPC_CHANNELS.IMPORT_RETRY, { token: 't', path })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', field: 'path', reason: 'unknown_field' },
    });
  });

  it('the four import channels are allowlisted; look-alikes are not (AC5)', () => {
    for (const ch of [
      IPC_CHANNELS.IMPORT_PICK,
      IPC_CHANNELS.IMPORT_COMMIT,
      IPC_CHANNELS.IMPORT_RETRY,
      IPC_CHANNELS.IMPORT_DISCARD,
    ]) {
      expect(ALLOWED_CHANNELS).toContain(ch);
    }
    for (const bad of ['clarityokr:import:path', 'clarityokr:import:read', 'clarityokr:import']) {
      expect(isAllowedChannel(bad)).toBe(false);
    }
  });

  it('parseImportFile accepts a BOM and rejects a missing schemaVersion', () => {
    const text = exportText(source.store, seed(source.store));
    expect(parseImportFile(Buffer.from(`\uFEFF${text}`)).ok).toBe(true);
    const doc = JSON.parse(text);
    delete doc.schemaVersion;
    expect(parseImportFile(Buffer.from(JSON.stringify(doc)))).toMatchObject({
      ok: false,
      problem: { field: 'schemaVersion' },
    });
  });
});
