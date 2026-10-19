import { Injectable, inject } from '@angular/core';
import type { Period } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

export interface GoReviewRequest {
  okrId: string;
  period: Period;
}

export type GoReviewHandler = (request: GoReviewRequest) => Promise<void> | void;

/**
 * #84 review: one place that answers 「去复盘」, whichever window hosts the note. The sticky
 * shell (which has the review page) registers itself and handles it in place. Without it — the
 * main-window results panel — the request is handed to the main process, which brings the
 * sticky shell forward and lets it open the quarter's review there.
 */
@Injectable({ providedIn: 'root' })
export class ReminderNavigator {
  private readonly api = inject(ClosedLoopApi);
  private handler: GoReviewHandler | null = null;

  /** Returns the function that unregisters it. */
  register(handler: GoReviewHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = null;
    };
  }

  async goReview(request: GoReviewRequest): Promise<void> {
    if (this.handler) {
      await this.handler(request);
      return;
    }
    await this.api.goReviewElsewhere?.(request.okrId);
  }
}
