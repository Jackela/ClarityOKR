import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ActionLogWriter } from '../../../../app/main/src/persistence/action-log-writer';

describe('ActionLogWriter', () => {
  let tempDir: string;
  let writer: ActionLogWriter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'action-log-test-'));
    writer = new ActionLogWriter(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends entries to the action log', async () => {
    const entry = {
      id: 'entry-1',
      actionType: 'generate' as const,
      sessionId: 'session-1',
      payloadSummary: 'Generated OKR',
      occurredAt: new Date().toISOString(),
    };

    await writer.append(entry);
    const all = await writer.all();

    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('entry-1');
  });

  it('returns empty array when no entries exist', async () => {
    const all = await writer.all();
    expect(all).toEqual([]);
  });

  it('appends multiple entries in order', async () => {
    await writer.append({
      id: 'entry-1',
      actionType: 'generate',
      sessionId: 'session-1',
      payloadSummary: 'First',
      occurredAt: new Date().toISOString(),
    });

    await writer.append({
      id: 'entry-2',
      actionType: 'edit',
      sessionId: 'session-1',
      payloadSummary: 'Second',
      occurredAt: new Date().toISOString(),
    });

    const all = await writer.all();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('entry-1');
    expect(all[1].id).toBe('entry-2');
  });
});
