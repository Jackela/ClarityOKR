/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Injectable } from '@angular/core';
import {
  generateOKRRequestSchema,
  generateOKRResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';
import type { GenerateOKRRequest, OKRDocument } from '@clarityokr/contracts';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

import { OkrProjectionService, type OkrStickyViewModel } from './okr-projection.service';

@Injectable({ providedIn: 'root' })
export class OkrStickyGatewayService {
  private readonly viewModelSubject = new BehaviorSubject<OkrStickyViewModel | null>(null);

  readonly viewModel$: Observable<OkrStickyViewModel | null> = this.viewModelSubject.asObservable();
  readonly hasStickyNote$: Observable<boolean> = this.viewModel$.pipe(map((vm) => vm !== null));

  constructor(private readonly projection: OkrProjectionService) {
    this.registerListeners();
    void this.hydrateFromMain();
  }

  async generate(sessionId: string, intentSummary: string): Promise<OkrStickyViewModel> {
    const bridge = this.ensureBridge();
    const payload = generateOKRRequestSchema.parse({
      sessionId,
      intentSummary,
    } satisfies GenerateOKRRequest);
    // eslint-disable-next-line no-console
    console.info('[renderer] requesting OKR generation (LLM)', payload);
    const response = await bridge.invoke(IPC_CHANNELS.LLM_GENERATE_DRAFT, { context: undefined });
    const parsed = generateOKRResponseSchema.parse(response);

    return this.storeDocument(parsed.okr);
  }

  async reopenSticky(): Promise<void> {
    const bridge = this.ensureBridge();
    await bridge.invoke(IPC_CHANNELS.STICKY_REOPEN, undefined);
  }

  private registerListeners(): void {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    bridge.on(IPC_CHANNELS.OKR_GENERATE, (_event, payload) => {
      const parsedResponse = generateOKRResponseSchema.safeParse(payload);
      if (parsedResponse.success) {
        // eslint-disable-next-line no-console
        console.info('[renderer] received OKR payload via response', parsedResponse.data.okr.id);
        this.storeDocument(parsedResponse.data.okr);
        return;
      }

      const parsedDocument = okrDocumentSchema.safeParse(
        (payload as { okr?: unknown })?.okr ?? payload,
      );
      if (parsedDocument.success) {
        // eslint-disable-next-line no-console
        console.info('[renderer] received OKR document broadcast', parsedDocument.data.id);
        this.storeDocument(parsedDocument.data);
        return;
      }

      // eslint-disable-next-line no-console
      console.error(
        '[renderer] Failed to parse OKR payload from main process',
        parsedResponse.error,
      );
    });
  }

  private storeDocument(document: OKRDocument): OkrStickyViewModel {
    const viewModel = this.projection.project(document);
    this.viewModelSubject.next(viewModel);
    return viewModel;
  }

  addKeyResult(): void {
    const current = this.viewModelSubject.getValue();
    if (!current) return;
    const id =
      globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? (globalThis.crypto as { randomUUID: () => string }).randomUUID()
        : Math.random().toString(36).slice(2);
    const next = {
      ...current,
      keyResults: [
        ...current.keyResults,
        {
          id,
          statement: '新关键结果',
          metricLabel: null,
          ownerLabel: null,
        },
      ],
    } satisfies OkrStickyViewModel;
    this.viewModelSubject.next(next);
  }

  private async hydrateFromMain(): Promise<void> {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    try {
      const latest = await bridge.invoke(IPC_CHANNELS.OKR_LATEST, undefined);
      const parsed = okrDocumentSchema.safeParse(latest);
      if (parsed.success) {
        // eslint-disable-next-line no-console
        console.info('[renderer] hydrated sticky note from persisted OKR', parsed.data.id);
        this.storeDocument(parsed.data);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[renderer] failed to hydrate sticky note', error);
    }
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      throw new Error('ClarifyOKR bridge is unavailable.');
    }
    return bridge;
  }

  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
  }
}
