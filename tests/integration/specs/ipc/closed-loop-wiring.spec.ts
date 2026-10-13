import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS, type IpcResult } from '@clarityokr/contracts';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { wireClosedLoop } from '../../../../app/main/src/startup/closed-loop.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

describe('wireClosedLoop (Electron glue with fake dialog / shell / app)', () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let store: OkrStore;
  const handlers = new Map<string, Handler>();
  const ipcMain = { handle: (channel: string, fn: Handler) => void handlers.set(channel, fn) };
  const invoke = async <T>(channel: string, payload?: unknown) =>
    (await handlers.get(channel)!({}, payload)) as IpcResult<T>;

  beforeEach(() => {
    handlers.clear();
    dir = mkdtempSync(join(tmpdir(), 'okr-wire-'));
    db = new BetterSqlite3(':memory:');
    applySchema(db);
    store = new OkrStore(db);
    store.createObjective({
      id: 'o1',
      title: 'Wired',
      keyResults: [{ id: 'k1', statement: 'KR' }],
    });
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the focused window as dialog parent, filters by format, and writes the chosen file', async () => {
    const window = { id: 1 };
    const showSaveDialog = jest.fn(async (..._args: unknown[]) => ({
      canceled: false,
      filePath: join(dir, 'chosen.md'),
    }));
    const showItemInFolder = jest.fn();
    wireClosedLoop({
      ipcMain: ipcMain as never,
      store,
      storageMode: 'normal',
      dialog: { showSaveDialog } as never,
      shell: { showItemInFolder } as never,
      getDownloadsDir: () => dir,
      getFocusedWindow: () => window as never,
    });
    const result = await invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: 'o1', format: 'md' });
    expect(result).toMatchObject({ ok: true, data: { outcome: 'saved', fileName: 'chosen.md' } });
    expect(showSaveDialog).toHaveBeenCalledTimes(1);
    const [parent, options] = showSaveDialog.mock.calls[0] as [
      unknown,
      { defaultPath: string; filters: unknown },
    ];
    expect(parent).toBe(window);
    expect(options.defaultPath.startsWith(dir)).toBe(true);
    expect(options.filters).toEqual([{ name: 'Markdown', extensions: ['md'] }]);
    expect(readFileSync(join(dir, 'chosen.md'), 'utf8')).toContain('# Wired');

    expect((await invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: join(dir, 'chosen.md') })).ok).toBe(
      true,
    );
    expect(showItemInFolder).toHaveBeenCalledWith(join(dir, 'chosen.md'));
  });

  it('works without a focused window, and a cancelled dialog (canceled or empty path) is a cancel', async () => {
    const showSaveDialog = jest
      .fn(async (..._args: unknown[]) => ({
        canceled: true,
        filePath: undefined as string | undefined,
      }))
      .mockResolvedValueOnce({ canceled: true, filePath: undefined })
      .mockResolvedValueOnce({ canceled: false, filePath: '' });
    wireClosedLoop({
      ipcMain: ipcMain as never,
      store,
      storageMode: 'normal',
      dialog: { showSaveDialog } as never,
      shell: { showItemInFolder: jest.fn() } as never,
      getDownloadsDir: () => dir,
      getFocusedWindow: () => null,
    });
    expect(await invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: 'o1', format: 'json' })).toEqual({
      ok: true,
      data: { outcome: 'cancelled' },
    });
    expect(await invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: 'o1', format: 'json' })).toEqual({
      ok: true,
      data: { outcome: 'cancelled' },
    });
    // no parent window: the dialog was called with just the options object
    expect(showSaveDialog.mock.calls[0]).toHaveLength(1);
    expect((showSaveDialog.mock.calls[0]![0] as { filters: unknown }).filters).toEqual([
      { name: 'JSON', extensions: ['json'] },
    ]);
  });

  it('the restart rule uses the real storage mode and database; app:restart lives elsewhere (D2)', async () => {
    const { restartService } = wireClosedLoop({
      ipcMain: ipcMain as never,
      store,
      storageMode: 'memory',
      dialog: { showSaveDialog: jest.fn() } as never,
      shell: { showItemInFolder: jest.fn() } as never,
      clipboard: { writeText: jest.fn() } as never,
      getDownloadsDir: () => dir,
      getFocusedWindow: () => null,
    });
    const none = { wizard: false, textEdit: false, reviewDraft: false };
    expect(restartService.evaluate(none)).toMatchObject({
      needsConfirm: true,
      reasons: ['memory_data'],
    });
    store.deleteAllObjectives();
    expect(restartService.evaluate(none)).toMatchObject({ needsConfirm: false });
    // Registered by registerAppWindowHandlers (it needs the sender window).
    await expect(invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none })).rejects.toThrow();
  });
});
