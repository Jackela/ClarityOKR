import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Period } from '@clarityokr/contracts';

import { PeriodPickerComponent } from './period-picker.component';

@Component({
  standalone: true,
  imports: [PeriodPickerComponent],
  template: `<clarityokr-period-picker
    [value]="value"
    [now]="now"
    [disabled]="disabled"
    (periodChange)="changes.push($event)"
  />`,
})
class Host {
  value: Period | null = null;
  now = new Date('2026-10-12T10:00:00');
  disabled = false;
  changes: (string | null)[] = [];
}

describe('PeriodPickerComponent', () => {
  let fixture: ComponentFixture<Host>;
  const trigger = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('[data-testid="period-picker"]');
  const options = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="option"]'));
  const key = (el: Element, k: string): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('shows 不设置周期 in secondary style when there is no period', () => {
    expect(trigger().textContent).toContain('不设置周期');
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().querySelector('.period--none')).not.toBeNull();
  });

  it('shows the stored period', () => {
    fixture.componentInstance.value = '2026-Q3';
    fixture.componentInstance.now = new Date('2026-10-12T10:00:00');
    fixture.detectChanges();
    expect(trigger().textContent).toContain('2026-Q3');
    expect(trigger().getAttribute('aria-label')).toBe('周期：2026-Q3');
  });

  it('offers exactly 10 entries with the current quarter marked (T12)', () => {
    key(trigger(), 'Enter');
    expect(options().map((o) => o.textContent!.replace(/[\s✓]+/g, ''))).toEqual([
      '不设置',
      '2025-Q4',
      '2026-Q1',
      '2026-Q2',
      '2026-Q3',
      '2026-Q4（当前季度）',
      '2027-Q1',
      '2027-Q2',
      '2027-Q3',
      '2027-Q4',
    ]);
  });

  it('opens focusing the selected quarter and selects with Enter, emitting the period', () => {
    fixture.componentInstance.value = '2026-Q3';
    fixture.detectChanges();
    key(trigger(), 'ArrowDown');
    expect(document.activeElement).toBe(options()[4]);
    expect(options()[4]!.getAttribute('aria-selected')).toBe('true');
    key(options()[4]!, 'ArrowDown');
    options()[5]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.changes).toEqual(['2026-Q4']);
    expect(document.activeElement).toBe(trigger());
  });

  it('选「不设置」 emits null', () => {
    fixture.componentInstance.value = '2026-Q3';
    fixture.detectChanges();
    key(trigger(), 'Enter');
    options()[0]!.click();
    expect(fixture.componentInstance.changes).toEqual([null]);
  });

  it('Esc closes and returns to the capsule without emitting', () => {
    key(trigger(), 'Enter');
    key(options()[1]!, 'Escape');
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('keeps an out-of-window stored period as an extra, selected first entry', () => {
    fixture.componentInstance.value = '2019-Q2';
    fixture.detectChanges();
    key(trigger(), 'Enter');
    expect(options()).toHaveLength(11);
    expect(options()[0]!.textContent).toContain('2019-Q2');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('is disabled while the note is busy', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    trigger().click();
    fixture.detectChanges();
    expect(options()).toHaveLength(0);
  });
});
