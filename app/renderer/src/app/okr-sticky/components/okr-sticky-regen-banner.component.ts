import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from '@angular/core';

import { COPY } from '../../closed-loop/copy';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import { type RegenerateBanner } from '../../closed-loop/regenerate-logic';
import { StickyRegenLive } from './okr-sticky-regen-live';
import { focusRegenButton } from './okr-sticky-regen-focus';

/**
 * Regeneration result banner (done / failed). `display: contents` so this host
 * does not add a box around the existing `.regen-banner` root.
 */
@Component({
  selector: 'clarityokr-sticky-regen-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './okr-sticky-regen-banner.component.html',
  styleUrls: ['./okr-sticky-regen.scss'],
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class OkrStickyRegenBannerComponent {
  readonly t = COPY;
  readonly regen = inject(RegenerateFlow);
  private readonly live = inject(StickyRegenLive);

  @Output() readonly viewRemoved = new EventEmitter<void>();

  doneBanner(): RegenerateBanner | null {
    const result = this.regen.result();
    return result?.kind === 'done' ? result.banner : null;
  }

  failedCode(): string {
    const result = this.regen.result();
    return result?.kind === 'failed' ? result.code : '';
  }

  async retry(): Promise<void> {
    this.live.setRunning();
    await this.regen.retry();
    this.live.clear();
  }

  dismiss(): void {
    this.regen.dismiss();
    focusRegenButton();
  }
}
