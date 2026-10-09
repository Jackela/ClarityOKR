import { jest } from '@jest/globals';
import { clipboard } from 'electron';
import type { OKRDocument } from '@clarityokr/contracts';
import { ClipboardExporterService } from '@clarityokr/main/windows/clipboard-exporter';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import { SQLiteActionLogWriter } from '@clarityokr/main/persistence/sqlite-action-log-writer';

const time = '2026-10-09T00:00:00.000Z';
const document: OKRDocument = {
  id: 'synthetic-okr',
  sourceSessionId: 'synthetic',
  objective: ' Objective ',
  generatedAt: time,
  regenerationPolicy: 'append',
  manualEdits: [],
  keyResults: [
    { id: 'a', statement: ' First result ', successMetric: ' 0 defects ' },
    { id: 'b', statement: 'Second result' },
    { id: 'c', statement: 'Third result', successMetric: ' ' },
  ],
};
describe('Actual clipboard formatting and persisted copy action', () => {
  let db: ConnectionManager;
  let writer: SQLiteActionLogWriter;
  beforeEach(async () => {
    jest.mocked(clipboard.writeText).mockReset();
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    await new SqliteSessionRepository(db).save({
      id: 'synthetic',
      initialIntent: 'Synthetic intent',
      status: 'completed',
      createdAt: time,
      updatedAt: time,
      confidence: 1,
      steps: [],
      selectedOptions: [],
    });
    writer = new SQLiteActionLogWriter(db);
  });
  afterEach(() => db.close());
  it('copies deterministic markdown with optional metrics and records the actual persisted identity', async () => {
    expect(
      await new ClipboardExporterService(writer).exportOkrToClipboard(
        document,
        document.sourceSessionId,
      ),
    ).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(
      '## Objective\n- Objective\n\n## Key Results\n- First result (0 defects)\n- Second result\n- Third result',
    );
    expect(await writer.all()).toEqual([
      expect.objectContaining({
        actionType: 'copy',
        sessionId: 'synthetic',
        okrId: 'synthetic-okr',
      }),
    ]);
  });
  it('supports copy without an optional action writer or without a session log request', async () => {
    expect(await new ClipboardExporterService().exportOkrToClipboard(document, 'synthetic')).toBe(
      true,
    );
    expect(await new ClipboardExporterService(writer).exportOkrToClipboard(document)).toBe(true);
    expect(await writer.all()).toEqual([]);
  });
  it.each([null, { ...document, objective: '' }, { ...document, objective: '   ' }])(
    'rejects missing content before touching the OS (%p)',
    async (input) => {
      expect(
        await new ClipboardExporterService(writer).exportOkrToClipboard(
          input as unknown as OKRDocument,
          'synthetic',
        ),
      ).toBe(false);
      expect(clipboard.writeText).not.toHaveBeenCalled();
      expect(await writer.all()).toEqual([]);
    },
  );
  it.each([new Error('OS permission denied'), 'opaque OS failure'])(
    'reports a native clipboard failure and avoids a successful copy log (%p)',
    async (error) => {
      jest.mocked(clipboard.writeText).mockImplementation(() => {
        throw error;
      });
      expect(
        await new ClipboardExporterService(writer).exportOkrToClipboard(document, 'synthetic'),
      ).toBe(false);
      expect(await writer.all()).toEqual([]);
    },
  );
  it('does not report a successful audited copy when storage fails after the OS write', async () => {
    jest.mocked(clipboard.writeText).mockImplementation(() => db.close());
    expect(
      await new ClipboardExporterService(writer).exportOkrToClipboard(document, 'synthetic'),
    ).toBe(false);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});
