/*
 * Card Component - ClarityOKR Design System
 * -----------------------------------------
 * Reusable card component for content containers.
 *
 * Usage:
 *   <clarityokr-card>
 *     <h3>Card Title</h3>
 *     <p>Card content goes here</p>
 *   </clarityokr-card>
 *
 *   <clarityokr-card variant="elevated" padding="lg">
 *     Content with elevated style and large padding
 *   </clarityokr-card>
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type CardVariant = 'default' | 'elevated' | 'outlined';
export type CardPadding = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'clarityokr-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="card"
      [class.card--elevated]="variant === 'elevated'"
      [class.card--outlined]="variant === 'outlined'"
      [class.card--padding-sm]="padding === 'sm'"
      [class.card--padding-md]="padding === 'md'"
      [class.card--padding-lg]="padding === 'lg'"
      [class.card--padding-xl]="padding === 'xl'"
    >
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .card {
        background: var(--color-surface);
        border-radius: var(--radius-2xl);
        transition: box-shadow var(--transition-fast);
      }

      /* Variants */
      .card--default {
        box-shadow: var(--shadow-xs);
      }

      .card--elevated {
        box-shadow: var(--shadow-xl);
      }

      .card--outlined {
        border: 1px solid var(--color-primary-alpha-25);
        box-shadow: none;
      }

      /* Padding sizes */
      .card--padding-sm {
        padding: var(--space-lg);
      }

      .card--padding-md {
        padding: var(--space-xl);
      }

      .card--padding-lg {
        padding: var(--space-2xl);
      }

      .card--padding-xl {
        padding: var(--space-2xl) var(--space-4xl);
      }
    `,
  ],
})
export class CardComponent {
  @Input() variant: CardVariant = 'elevated';
  @Input() padding: CardPadding = 'lg';
}
