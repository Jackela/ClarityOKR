import { firstValueFrom } from 'rxjs';
import { IpcLlmGatewayFactory } from './ipc-llm-gateway.service';
import { LlmGatewayService } from './llm-gateway.service';
import { TelemetryService } from '../../services/telemetry.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';

describe.each(['production observable gateway', 'service gateway'])(
  'Actual %s transport contract',
  (kind) => {
    let telemetry: TelemetryService;
    let invoke: jest.Mock;
    let gateway: LlmGatewayService;
    const context = { turns: [{ questionId: 'q1', optionId: 'a', timestamp: '2026-10-09' }] };
    const choice = { questionId: 'q1', optionId: 'a' };
    beforeEach(() => {
      telemetry = new TelemetryService();
      invoke = jest.fn();
      Object.defineProperty(window, 'clarifyOkr', { configurable: true, value: { invoke } });
      gateway =
        kind === 'service gateway'
          ? new LlmGatewayService(telemetry)
          : new IpcLlmGatewayFactory(telemetry).create();
    });
    afterEach(() => {
      Reflect.deleteProperty(window, 'clarifyOkr');
    });

    it('defers IPC until subscription and preserves history and last choice', async () => {
      const response = { question: { id: 'q2', text: 'Next?', options: [] } };
      invoke.mockResolvedValue(response);
      const request = gateway.getNextQuestion(context, choice);
      expect(invoke).not.toHaveBeenCalled();
      expect(await firstValueFrom(request)).toEqual(response);
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LLM_NEXT_QUESTION, {
        context,
        lastChoice: choice,
      });
      expect(telemetry.snapshot().counters['next-question:success']).toBe(1);
      invoke.mockRejectedValue(new Error('offline'));
      await expect(firstValueFrom(gateway.getNextQuestion(context, choice))).rejects.toThrow(
        'offline',
      );
      expect(telemetry.snapshot().counters['next-question:success']).toBe(1);
    });

    it('records success, timeout and other failures without changing rejected results', async () => {
      const response = { okr: { objective: 'Synthetic' }, session: { id: 'synthetic' } };
      invoke.mockResolvedValueOnce(response);
      expect(await firstValueFrom(gateway.generateDraft(context))).toEqual(response);
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LLM_GENERATE_DRAFT, { context });
      invoke.mockRejectedValueOnce(new Error('TIMEOUT waiting for response'));
      await expect(firstValueFrom(gateway.generateDraft(context))).rejects.toThrow('TIMEOUT');
      invoke.mockRejectedValueOnce(new Error('connection refused'));
      await expect(firstValueFrom(gateway.generateDraft(context))).rejects.toThrow(
        'connection refused',
      );
      expect(telemetry.snapshot().counters).toEqual({
        'draft:success': 1,
        'draft:timeout': 1,
        'draft:error': 1,
      });
    });

    it('reports a missing preload bridge before attempting IPC', () => {
      Reflect.deleteProperty(window, 'clarifyOkr');
      expect(() => gateway.getNextQuestion(context, choice)).toThrow('bridge');
      expect(() => gateway.generateDraft(context)).toThrow('bridge');
      expect(telemetry.snapshot().counters).toEqual({});
    });
  },
);
