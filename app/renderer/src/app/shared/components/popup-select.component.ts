import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';

export interface PopupOption {
  /** Opaque value; `null` is a legal value ("not set"). */
  value: string | null;
  label: string;
  icon?: string;
}

/**
 * Trigger button + popup list used for the status menu (`menu` / `menuitemradio`) and the
 * quarter picker (`listbox` / `option`). Keyboard (spec §2.6): Enter / Space / ↓ open and
 * focus the current item, ↑ ↓ Home End move, Enter / Space select, Esc closes and returns to
 * the trigger, Tab closes. The trigger content is projected.
 */
@Component({
  selector: 'clarityokr-popup-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      [class]="'trigger trigger--' + variant"
      [attr.data-tone]="tone"
      [attr.aria-haspopup]="mode"
      [attr.aria-expanded]="open"
      [attr.aria-label]="ariaLabel"
      [attr.aria-disabled]="disabled ? 'true' : null"
      [attr.data-testid]="testId"
      (click)="onTriggerClick()"
      (keydown)="onTriggerKeydown($event)"
    >
      <ng-content></ng-content>
    </button>
    @if (open) {
      <div
        class="popup"
        [class.popup--up]="openUp"
        [attr.role]="mode"
        [attr.aria-label]="ariaLabel"
      >
        @for (option of options; track $index) {
          <button
            type="button"
            #item
            class="popup__item"
            tabindex="-1"
            [attr.role]="mode === 'menu' ? 'menuitemradio' : 'option'"
            [attr.aria-checked]="mode === 'menu' ? option.value === value : null"
            [attr.aria-selected]="mode === 'listbox' ? option.value === value : null"
            [attr.data-testid]="testId ? testId + '-option-' + $index : null"
            (click)="choose(option)"
            (keydown)="onItemKeydown($event, $index)"
          >
            @if (option.icon) {
              <span class="popup__icon" aria-hidden="true">{{ option.icon }}</span>
            }
            <span class="popup__label">{{ option.label }}</span>
            @if (option.value === value) {
              <span class="popup__check" aria-hidden="true">✓</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-block;
      }
      .trigger {
        font: inherit;
        cursor: pointer;
      }
      .trigger--pill,
      .trigger--capsule {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 0;
        border-radius: var(--radius-full);
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-xs);
        line-height: 16px;
      }
      .trigger--pill {
        position: relative;
        min-height: 24px;
        padding: 4px 8px;
        background: var(--status-bg, var(--color-bg-secondary));
        color: var(--status-fg, var(--color-text-secondary));
      }
      /* The visual pill is 24px; the hit area extends 4px up and down (32px). */
      .trigger--pill::after {
        content: '';
        position: absolute;
        inset: -4px 0;
      }
      .trigger--pill[data-tone='not_started'] {
        --status-bg: var(--status-not_started-bg);
        --status-fg: var(--status-not_started-fg);
      }
      .trigger--pill[data-tone='in_progress'] {
        --status-bg: var(--status-in_progress-bg);
        --status-fg: var(--status-in_progress-fg);
      }
      .trigger--pill[data-tone='at_risk'] {
        --status-bg: var(--status-at_risk-bg);
        --status-fg: var(--status-at_risk-fg);
      }
      .trigger--pill[data-tone='done'] {
        --status-bg: var(--status-done-bg);
        --status-fg: var(--status-done-fg);
      }
      .trigger--capsule {
        min-height: 28px;
        padding: 0 10px;
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .trigger[aria-disabled='true'] {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .popup {
        position: absolute;
        z-index: var(--z-popover);
        top: calc(100% + 4px);
        left: 0;
        min-width: 200px;
        padding: 4px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-bg-elevated);
        box-shadow: var(--shadow-lg);
      }
      .popup--up {
        top: auto;
        bottom: calc(100% + 4px);
      }
      .popup__item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-primary);
        font: inherit;
        font-size: var(--font-size-sm);
        text-align: left;
        cursor: pointer;
      }
      .popup__item:hover {
        background: var(--color-bg-secondary);
      }
      .popup__icon {
        width: 16px;
        text-align: center;
      }
      .popup__label {
        flex: 1;
      }
    `,
  ],
})
export class PopupSelectComponent {
  @Input() options: readonly PopupOption[] = [];
  @Input() value: string | null = null;
  @Input() mode: 'menu' | 'listbox' = 'menu';
  @Input() ariaLabel = '';
  /** Look of the trigger: a status pill, a period capsule or an unstyled button. */
  @Input() variant: 'pill' | 'capsule' | 'plain' = 'plain';
  /** Colour set of a `pill` (a key result status). */
  @Input() tone: string | null = null;
  @Input() disabled = false;
  @Input() testId?: string;
  @Output() selected = new EventEmitter<string | null>();

  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;

  open = false;
  openUp = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly document = inject(DOCUMENT);

  focus(): void {
    this.trigger.nativeElement.focus();
  }

  onTriggerClick(): void {
    if (this.disabled) return;
    if (this.open) this.close(false);
    else this.openPopup(false);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open) this.openPopup(true);
      else this.focusItem(this.currentIndex());
    } else if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.close(true);
    } else if (event.key === 'Tab' && this.open) {
      this.close(false);
    }
  }

  onItemKeydown(event: KeyboardEvent, index: number): void {
    const last = this.options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusItem(index === last ? 0 : index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusItem(index === 0 ? last : index - 1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(last);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
      default:
        break;
    }
  }

  choose(option: PopupOption): void {
    this.close(true);
    this.selected.emit(option.value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  private currentIndex(): number {
    const index = this.options.findIndex((option) => option.value === this.value);
    return index < 0 ? 0 : index;
  }

  private openPopup(focusItem: boolean): void {
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    const view = this.document.defaultView;
    const needed = Math.min(this.options.length, 10) * 36 + 16;
    this.openUp = !!view && rect.bottom + needed > view.innerHeight && rect.top > needed;
    this.open = true;
    this.cdr.markForCheck();
    if (focusItem) {
      this.cdr.detectChanges();
      this.focusItem(this.currentIndex());
    }
  }

  private close(restoreFocus: boolean): void {
    this.open = false;
    this.cdr.markForCheck();
    if (restoreFocus) this.trigger.nativeElement.focus();
  }

  private focusItem(index: number): void {
    const items = this.host.nativeElement.querySelectorAll<HTMLElement>('.popup__item');
    items[index]?.focus();
  }
}
