import { OkrStickyService } from './okr-sticky.service';
import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { OKRDocument } from '@clarityokr/contracts';

const time = '2026-10-09T00:00:00.000Z';
const document: OKRDocument = {
  id: 'synthetic-okr',
  sourceSessionId: 'session',
  objective: 'Original objective',
  keyResults: [
    { id: 'a', statement: 'First result' },
    { id: 'b', statement: 'Second result', owner: 'Team', successMetric: '90%' },
  ],
  generatedAt: time,
  regenerationPolicy: 'append',
  manualEdits: [],
};
const session = {
  id: 'session',
  initialIntent: 'Synthetic intent',
  status: 'completed',
  createdAt: time,
  updatedAt: time,
  steps: [],
  selectedOptions: [],
  confidence: 1,
};

describe('Actual sticky service transport, projection and persistence ownership', () => {
  let invoke: jest.Mock;
  let unsubscribe: jest.Mock;
  let broadcast: (event: unknown, payload: unknown) => void;
  let service: OkrStickyService;
  async function create(latest: unknown = null) {
    invoke.mockResolvedValueOnce(latest);
    service = new OkrStickyService(new Logger());
    await Promise.resolve();
    await Promise.resolve();
  }
  beforeEach(async () => {
    invoke = jest.fn();
    unsubscribe = jest.fn();
    Object.defineProperty(window, 'clarifyOkr', {
      configurable: true,
      value: {
        invoke,
        on: (_channel: string, listener: typeof broadcast) => {
          broadcast = listener;
          return unsubscribe;
        },
      },
    });
    await create();
  });
  afterEach(() => {
    service.ngOnDestroy();
    Reflect.deleteProperty(window, 'clarifyOkr');
  });

  it('hydrates persisted identity, saves acknowledged server content, regenerates and copies that identity', async () => {
    service.ngOnDestroy();
    await create(document);
    expect(service.hasStickyNote()).toBe(true);
    expect(service.currentViewModel()?.keyResults[0]).toMatchObject({
      metricLabel: null,
      ownerLabel: null,
    });
    const persisted = {
      ...document,
      objective: 'Server edited',
      lastEditedAt: time,
      manualEdits: [
        {
          id: 'edit',
          fieldPath: 'objective',
          previousValue: 'Original objective',
          newValue: 'Server edited',
          editedAt: time,
        },
      ],
    };
    invoke.mockResolvedValueOnce(persisted);
    await service.saveEdits({ objective: 'Server edited', keyResults: document.keyResults });
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.OKR_UPDATE, {
      id: document.id,
      objective: 'Server edited',
      keyResults: document.keyResults,
    });
    expect(service.getCurrentViewModel()).toMatchObject({
      objective: 'Server edited',
      hasManualEdits: true,
      lastEditedAt: time,
    });
    invoke.mockResolvedValueOnce({ ...persisted, regenerationPolicy: 'overwrite' });
    await service.regenerate('overwrite');
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.OKR_REGENERATE, {
      sessionId: 'session',
      policy: 'overwrite',
    });
    invoke.mockResolvedValueOnce(false);
    await expect(service.copy()).rejects.toThrow('Clipboard');
    invoke.mockResolvedValueOnce(true);
    await service.copy();
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.CLIPBOARD_EXPORT, { okrId: document.id });
    invoke.mockResolvedValueOnce(undefined);
    await service.reopenSticky();
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.STICKY_REOPEN, undefined);
  });

  it('accepts canonical envelope/direct broadcasts and rejects invalid data without replacing current content', async () => {
    expect(service.viewModel()).toBeNull();
    broadcast(undefined, { okr: document, session });
    expect(service.viewModel()?.objective).toBe(document.objective);
    broadcast(undefined, { ...document, objective: 'Direct broadcast' });
    expect(service.viewModel()?.objective).toBe('Direct broadcast');
    broadcast(undefined, { okr: { ...document, objective: 'Wrapped broadcast' } });
    expect(service.viewModel()?.objective).toBe('Wrapped broadcast');
    broadcast(undefined, { invalid: true });
    expect(service.viewModel()?.objective).toBe('Wrapped broadcast');
    invoke.mockResolvedValueOnce({ okr: document, session });
    expect((await service.generate('session', 'Synthetic intent')).objective).toBe(
      document.objective,
    );
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.LLM_GENERATE_DRAFT, {
      sessionId: 'session',
      context: undefined,
    });
    invoke.mockResolvedValueOnce({ okr: { ...document, keyResults: [] }, session });
    await expect(service.generate('session', 'Synthetic')).rejects.toThrow();
    expect(service.viewModel()?.objective).toBe(document.objective);
    expect(() => service.project({ ...document, keyResults: [] })).toThrow('Key Results');
  });

  it('keeps local view edits separate from persisted identity and enforces no-document guards', async () => {
    service.addKeyResult();
    expect(service.viewModel()).toBeNull();
    for (const operation of [
      () => service.copy(),
      () => service.regenerate('append'),
      () => service.saveEdits({ objective: 'Edit', keyResults: document.keyResults }),
    ]) {
      await expect(operation()).rejects.toThrow('No OKR');
    }
    broadcast(undefined, document);
    service.addKeyResult();
    expect(service.viewModel()?.keyResults).toHaveLength(3);
    expect(service.viewModel()?.keyResults[2].id.length).toBeGreaterThan(0);
    service.updateViewModel(null);
    expect(service.hasStickyNote()).toBe(false);
    service.clear();
    expect(service.getCurrentViewModel()).toBeNull();
    service.ngOnDestroy();
    service.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(window, 'clarifyOkr');
    await create();
    await expect(service.generate('session', 'Synthetic')).rejects.toThrow('bridge');
    await expect(service.reopenSticky()).rejects.toThrow('bridge');
  });
});
