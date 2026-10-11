import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'neutral' | 'error';

export interface ToastAction {
  label: string;
  testId?: string;
  run: () => void;
}

export interface Toast {
  /** Bumped for every toast so a replacement is a new DOM node (and a new announcement). */
  id: number;
  kind: ToastKind;
  message: string;
  /** Second, smaller line (e.g. a path). */
  detail?: string;
  actions: ToastAction[];
  /** `null` = stays until closed (errors). */
  autoDismissMs: number | null;
}

export type ToastInput = Omit<Toast, 'id' | 'actions' | 'autoDismissMs'> &
  Partial<Pick<Toast, 'actions' | 'autoDismissMs'>>;

/** Auto-dismiss times (spec §2.6, §6.3). */
export const TOAST_MS = { success: 8000, neutral: 5000 } as const;

/** One toast at a time: a new one replaces the old one (spec §2.6). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  private counter = 0;

  show(input: ToastInput): number {
    const id = ++this.counter;
    const autoDismissMs =
      input.autoDismissMs !== undefined
        ? input.autoDismissMs
        : input.kind === 'error'
          ? null
          : TOAST_MS[input.kind];
    this.current.set({ ...input, id, actions: input.actions ?? [], autoDismissMs });
    return id;
  }

  /** Closes the toast; with an id only if that toast is still the current one. */
  dismiss(id?: number): void {
    const current = this.current();
    if (current && (id === undefined || current.id === id)) this.current.set(null);
  }
}
