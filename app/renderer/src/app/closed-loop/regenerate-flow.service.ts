import { Injectable, inject, signal } from '@angular/core';
import type { ClosedLoopErrorCode, RegenerateKrsRequest } from '@clarityokr/contracts';

import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { EditModeStore } from '../okr-sticky/state/edit-mode.store';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { bannerFor, type RegenerateBanner } from './regenerate-logic';

export interface RegenerateConfirm {
  scope: 'all' | 'some';
  /** The selected ids (scope `some`). */
  ids: string[];
}

export type RegenerateResult =
  | { kind: 'done'; banner: RegenerateBanner }
  | { kind: 'failed'; code: ClosedLoopErrorCode | 'UNKNOWN'; request: RegenerateKrsRequest };

/**
 * State of the §3.7 regeneration on the note tab: selection mode, the confirm dialog, the run
 * (which rows show skeletons) and the result / failure banner. All writes go through the main
 * process (`okr:regenerate-krs`); nothing in the list changes unless it succeeded.
 */
@Injectable({ providedIn: 'root' })
export class RegenerateFlow {
  readonly selecting = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly confirm = signal<RegenerateConfirm | null>(null);
  /** Rows being regenerated (`'all'` for a full one); null when idle. */
  readonly running = signal<ReadonlySet<string> | 'all' | null>(null);
  readonly result = signal<RegenerateResult | null>(null);
  /** Key results added by the last regeneration (the 「新增」 tag). */
  readonly newIds = signal<ReadonlySet<string>>(new Set());

  private readonly api = inject(ClosedLoopApi);
  private readonly store = inject(ClosedLoopStore);
  private readonly sticky = inject(OkrStickyService);
  private readonly editor = inject(EditModeStore);

  isRunning(): boolean {
    return this.running() !== null;
  }

  startSelecting(): void {
    if (this.isRunning()) return;
    this.dismiss();
    this.selected.set(new Set());
    this.selecting.set(true);
  }

  stopSelecting(): void {
    this.selecting.set(false);
    this.selected.set(new Set());
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  selectAll(ids: readonly string[]): void {
    this.selected.set(new Set(ids));
  }

  askAll(): void {
    if (this.isRunning()) return;
    this.dismiss();
    this.confirm.set({ scope: 'all', ids: [] });
  }

  askSelected(activeOrder: readonly string[]): void {
    const chosen = activeOrder.filter((id) => this.selected().has(id));
    if (chosen.length === 0 || this.isRunning()) return;
    this.confirm.set({ scope: 'some', ids: chosen });
  }

  cancelConfirm(): void {
    this.confirm.set(null);
  }

  /** 「重新生成」 in the dialog. */
  async confirmed(okrId: string): Promise<void> {
    const confirm = this.confirm();
    if (!confirm) return;
    this.confirm.set(null);
    this.stopSelecting();
    await this.run(confirm.scope === 'all' ? { okrId } : { okrId, krIds: confirm.ids });
  }

  async retry(): Promise<void> {
    const result = this.result();
    if (result?.kind !== 'failed') return;
    await this.run(result.request);
  }

  /** 「知道了」, or the user acted on the list again. */
  dismiss(): void {
    this.result.set(null);
    this.newIds.set(new Set());
  }

  private async run(request: RegenerateKrsRequest): Promise<void> {
    if (this.isRunning()) return;
    this.dismiss();
    this.running.set(request.krIds ? new Set(request.krIds) : 'all');
    this.store.regenerating.set(true);
    this.store.operationBusy.set(true);
    try {
      const reply = await this.api.regenerateKrs(request);
      if (!reply.ok) {
        this.result.set({ kind: 'failed', code: reply.error.code, request });
        return;
      }
      const { detail, summary } = reply.data;
      if (this.store.currentId() === detail.objective.id) {
        this.store.detail.set(detail);
        this.store.detailState.set('ready');
        this.sticky.openFromDetail(detail);
      }
      // New text: the undo history of the old text no longer applies (spec §3.9a).
      this.editor.clearHistory();
      this.newIds.set(new Set(summary.addedIds));
      this.result.set({ kind: 'done', banner: bannerFor(summary) });
    } catch {
      this.result.set({ kind: 'failed', code: 'UNKNOWN', request });
    } finally {
      this.running.set(null);
      this.store.regenerating.set(false);
      this.store.operationBusy.set(false);
    }
  }
}
