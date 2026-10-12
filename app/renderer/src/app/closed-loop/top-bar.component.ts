import { ChangeDetectionStrategy, Component } from '@angular/core';

import { COPY } from './copy';
import { ExportMenuComponent } from './export-menu.component';

/**
 * Top bar of the sticky window (spec §1.2a / §2.5): 40px, the whole bar is a drag area and the
 * controls in it are `no-drag`. This slice holds the title and the export entry; 「⋯」 and
 * 「隐藏」 come with the window work (D2).
 */
@Component({
  selector: 'clarityokr-top-bar',
  standalone: true,
  imports: [ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" data-testid="top-bar">
      <span class="bar__title">{{ t.topBarTitle }}</span>
      <clarityokr-export-menu />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: none;
      }
      .bar {
        -webkit-app-region: drag;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
        height: 40px;
        padding: 0 8px 0 16px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-bg-primary);
      }
      .bar__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-secondary);
        user-select: none;
      }
    `,
  ],
})
export class TopBarComponent {
  readonly t = COPY.export;
}
