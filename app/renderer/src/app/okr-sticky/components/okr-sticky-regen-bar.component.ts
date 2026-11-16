import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { COPY } from '../../closed-loop/copy';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import { focusRegenButton } from './okr-sticky-regen-focus';

/**
 * Selection footer for regenerating some key results. The host is the existing
 * `div.regen-bar` so the DOM tag, class and test id stay the same. Sticky /
 * flex layout lives on `:host` because an encapsulated `.regen-bar` selector
 * would not match this host.
 */
@Component({
  selector: 'div[clarityokr-sticky-regen-bar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './okr-sticky-regen-bar.component.html',
  styleUrls: ['./okr-sticky-regen-bar.component.scss', './okr-sticky-regen.scss'],
})
export class OkrStickyRegenBarComponent {
  readonly t = COPY;
  readonly regen = inject(RegenerateFlow);

  @Input({ required: true }) activeIds: readonly string[] = [];

  cancel(): void {
    this.regen.stopSelecting();
    focusRegenButton();
  }

  confirm(): void {
    this.regen.askSelected(this.activeIds);
  }
}
