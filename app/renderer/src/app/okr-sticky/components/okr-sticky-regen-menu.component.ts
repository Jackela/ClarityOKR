import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { COPY } from '../../closed-loop/copy';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import {
  PopupSelectComponent,
  type PopupOption,
} from '../../shared/components/popup-select.component';

/**
 * Regenerating menu (↻). `display: contents` so the existing
 * `clarityokr-popup-select.regen-menu` stays the layout root.
 */
@Component({
  selector: 'clarityokr-sticky-regen-menu',
  standalone: true,
  imports: [PopupSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './okr-sticky-regen-menu.component.html',
  styleUrls: ['./okr-sticky-regen.scss'],
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class OkrStickyRegenMenuComponent {
  readonly t = COPY;
  readonly regen = inject(RegenerateFlow);
  readonly regenOptions: readonly PopupOption[] = [
    { value: 'some', label: COPY.regen.selectSome },
    { value: 'all', label: COPY.regen.all },
  ];

  @Input({ required: true }) busy = false;

  disabled(): boolean {
    return this.busy || this.regen.isRunning() || this.regen.selecting();
  }

  onMenu(value: string | null): void {
    if (this.disabled()) return;
    if (value === 'all') {
      this.regen.askAll();
    } else if (value === 'some') {
      this.regen.startSelecting();
      setTimeout(() =>
        (typeof document === 'undefined' ? undefined : document)
          ?.querySelector<HTMLElement>('[data-testid="kr-select"]')
          ?.focus(),
      );
    }
  }
}
