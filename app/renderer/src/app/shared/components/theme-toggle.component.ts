import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../pipes/translate.pipe';
import type { ThemePreference } from '../../core/services/theme.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ThemeService } from '../../core/services/theme.service';

/**
 * Segmented control for switching between light, dark, and system themes.
 *
 * @example
 * <clarityokr-theme-toggle></clarityokr-theme-toggle>
 */
@Component({
  selector: 'clarityokr-theme-toggle',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="theme-toggle"
      role="radiogroup"
      [attr.aria-label]="'common.theme' | translate"
    >
      @for (option of options; track option.value) {
        <button
          type="button"
          class="theme-toggle__option"
          role="radio"
          [attr.aria-checked]="theme.userPreference() === option.value"
          [class.theme-toggle__option--active]="theme.userPreference() === option.value"
          (click)="setTheme(option.value)"
        >
          <span class="theme-toggle__icon" aria-hidden="true">{{ option.icon }}</span>
          <span class="theme-toggle__label">{{ option.labelKey | translate }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-full);
        border: 1px solid var(--color-border);
      }

      .theme-toggle__option {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-2) var(--space-3);
        border: none;
        border-radius: var(--radius-full);
        background: transparent;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition:
          background-color var(--duration-fast) var(--ease-snappy),
          color var(--duration-fast) var(--ease-snappy),
          transform var(--duration-micro) var(--ease-snappy);
      }

      .theme-toggle__option:hover {
        color: var(--color-text-primary);
      }

      .theme-toggle__option:active {
        transform: scale(0.97);
      }

      .theme-toggle__option--active {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-sm);
      }

      .theme-toggle__icon {
        font-size: var(--font-size-sm);
        line-height: 1;
      }

      .theme-toggle__label {
        line-height: 1;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .theme-toggle__option {
          transition: none;
        }
      }
    `,
  ],
})
export class ThemeToggleComponent {
  readonly options: Array<{ value: ThemePreference; icon: string; labelKey: string }> = [
    { value: 'light', icon: '☀️', labelKey: 'theme.light' },
    { value: 'dark', icon: '🌙', labelKey: 'theme.dark' },
    { value: 'system', icon: '💻', labelKey: 'theme.system' },
  ];

  constructor(public readonly theme: ThemeService) {}

  setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
  }
}
