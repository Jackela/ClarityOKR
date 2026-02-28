import { Injectable } from '@angular/core';
import {
  generateOKRRequestSchema,
  generateOKRResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';
import type { GenerateOKRRequest, OKRDocument } from '@clarityokr/contracts';
import type { Observable } from 'rxjs';

import { getClarityBridge, getClarityBridgeOrUndefined } from '../../shared/bridge';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';

import { OkrProjectionService, type OkrStickyViewModel } from './okr-projection.service';
import { OkrStickyStore } from '../state/okr-sticky.store';

@Injectable({ providedIn: 'root' })
export class OkrStickyGatewayService {
  readonly viewModel$: Observable<OkrStickyViewModel | null>;
  readonly hasStickyNote$: Observable<boolean>;

  constructor(
    private readonly projection: OkrProjectionService,
    private readonly store: OkrStickyStore,
  ) {
    this.viewModel$ = this.store.viewModel$;
    this.hasStickyNote$ = this.store.hasStickyNote$;
    this.registerListeners();
    void this.hydrateFromMain();
  }

  async generate(sessionId: string, intentSummary: string): Promise<OkrStickyViewModel> {
    const bridge = getClarityBridge();
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
    const bridge = getClarityBridge();
    await bridge.invoke(IPC_CHANNELS.STICKY_REOPEN, undefined);
  }

  private registerListeners(): void {
    const bridge = getClarityBridgeOrUndefined();
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

      const okrPayload = payload as { okr?: unknown };
      const parsedDocument = okrDocumentSchema.safeParse(okrPayload.okr ?? payload);
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
    this.store.setViewModel(viewModel);
    return viewModel;
  }

  addKeyResult(): void {
    this.store.addKeyResult();
  }

  private async hydrateFromMain(): Promise<void> {
    const bridge = getClarityBridgeOrUndefined();
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
}
