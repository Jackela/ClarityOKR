import { Injectable } from '@angular/core';
import {
  IPC_CHANNELS,
  ipcFail,
  type IpcResult,
  type KrIdRequest,
  type OkrIdRequest,
  type OkrDetail,
  type OkrListReply,
  type PinReply,
  type ProgressChangeReply,
  type ReplaceProgressRequest,
  type SetPeriodReply,
  type SetPeriodRequest,
  type SetProgressRequest,
} from '@clarityokr/contracts';

function isIpcResult(value: unknown): value is IpcResult<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { ok?: unknown; error?: unknown };
  return record.ok === true || (record.ok === false && typeof record.error === 'object');
}

/**
 * Typed client for the closed-loop IPC channels. It only talks to whitelisted channels
 * through the preload bridge and never throws: a missing bridge, a rejected invoke or a
 * malformed reply all come back as an `INTERNAL` failure with a generic message.
 */
@Injectable({ providedIn: 'root' })
export class ClosedLoopApi {
  list(): Promise<IpcResult<OkrListReply>> {
    return this.call(IPC_CHANNELS.OKR_LIST, undefined);
  }

  open(request: OkrIdRequest): Promise<IpcResult<OkrDetail>> {
    return this.call(IPC_CHANNELS.OKR_OPEN, request);
  }

  pin(request: OkrIdRequest): Promise<IpcResult<PinReply>> {
    return this.call(IPC_CHANNELS.OKR_PIN, request);
  }

  setPeriod(request: SetPeriodRequest): Promise<IpcResult<SetPeriodReply>> {
    return this.call(IPC_CHANNELS.OKR_SET_PERIOD, request);
  }

  setProgress(request: SetProgressRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_SET_PROGRESS, request);
  }

  revertProgress(request: KrIdRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_REVERT_PROGRESS, request);
  }

  replaceProgress(request: ReplaceProgressRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_REPLACE_PROGRESS, request);
  }

  private async call<T>(channel: string, payload: unknown): Promise<IpcResult<T>> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return ipcFail('INTERNAL', 'The IPC bridge is not available');
    try {
      const reply = await bridge.invoke(channel, payload);
      return isIpcResult(reply) ? (reply as IpcResult<T>) : ipcFail('INTERNAL', 'Malformed reply');
    } catch {
      return ipcFail('INTERNAL', 'The request failed');
    }
  }
}
