import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  IPC_CHANNELS,
  WIZARD_DRAFT_FORMAT,
  type DraftGetReply,
  type DraftRow,
  type IpcResult,
} from '@clarityokr/contracts';

import { LocalLogFile } from '../../../app/main/src/core/local-log-file.js';
import { registerDraftHandlers } from '../../../app/main/src/drafts/draft-handlers.js';
import { SessionDraftStore } from '../../../app/main/src/drafts/session-draft-store.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }
  async invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`no handler: ${channel}`);
    return (await handler({ sender: { id: 1 } }, payload)) as IpcResult<T>;
  }
}

/**
 * #124: a damaged wizard draft must produce a single wizard-draft-fallback line even when
 * draft-get runs again (restore bar → 「恢复」) after the trimmed row was persisted.
 */
describe('#124 wizard-draft-fallback logged once per damaged draft', () => {
  let dir: string;
  let drafts: SessionDraftStore;
  let ipc: FakeIpcMain;
  let logPath: string;

  const damagedRow = (): DraftRow => ({
    kind: 'wizard',
    step: 3,
    intent: '提高团队效率',
    format: WIZARD_DRAFT_FORMAT,
    sessionId: 's-124',
    steps: [
      {
        prompt: {
          id: 'q1',
          question: 'Q1',
          sequence: 0,
          context: '目标',
          options: [
            { id: 'a', label: 'A', scopeTag: 'llm' },
            { id: 'b', label: 'B', scopeTag: 'llm' },
          ],
        },
        selectedOptionId: 'a',
      },
      { prompt: { id: 'q2', question: 'broken' }, selectedOptionId: 'missing' },
    ],
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fallback-log-'));
    const draftsDir = join(dir, 'drafts');
    logPath = join(dir, 'logs', 'main.log');
    drafts = new SessionDraftStore({ dir: draftsDir });
    ipc = new FakeIpcMain();
    registerDraftHandlers(ipc as never, {
      drafts,
      store: {
        getObjective: () => null,
        getReview: () => null,
        listObjectivesBySession: () => [],
      },
      log: new LocalLogFile(logPath),
      windowOf: () => 'main',
    });
    drafts.report('main', [damagedRow()]);
    drafts.writeAll();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const fallbackCount = (): number =>
    readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('wizard-draft-fallback')).length;

  it('draft-get twice (bar + 恢复) writes a single fallback line', async () => {
    const first = await ipc.invoke<DraftGetReply>(IPC_CHANNELS.APP_DRAFT_GET);
    expect(first.ok && first.data.rows).toHaveLength(1);
    expect(fallbackCount()).toBe(1);

    const second = await ipc.invoke<DraftGetReply>(IPC_CHANNELS.APP_DRAFT_GET);
    expect(second.ok && second.data.rows).toHaveLength(1);
    expect(fallbackCount()).toBe(1);
  });

  it('replace persists the trimmed wizard so a fresh store also skips a second log', async () => {
    await ipc.invoke<DraftGetReply>(IPC_CHANNELS.APP_DRAFT_GET);
    expect(fallbackCount()).toBe(1);

    const again = new SessionDraftStore({ dir: join(dir, 'drafts') });
    const ipc2 = new FakeIpcMain();
    registerDraftHandlers(ipc2 as never, {
      drafts: again,
      store: {
        getObjective: () => null,
        getReview: () => null,
        listObjectivesBySession: () => [],
      },
      log: new LocalLogFile(logPath),
      windowOf: () => 'main',
    });
    await ipc2.invoke<DraftGetReply>(IPC_CHANNELS.APP_DRAFT_GET);
    expect(fallbackCount()).toBe(1);
  });
});
