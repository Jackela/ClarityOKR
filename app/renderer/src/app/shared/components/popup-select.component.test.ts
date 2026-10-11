import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { PopupSelectComponent, type PopupOption } from './popup-select.component';

const OPTIONS: PopupOption[] = [
  { value: null, label: '不设置' },
  { value: 'a', label: '甲', icon: '○' },
  { value: 'b', label: '乙' },
];

@Component({
  standalone: true,
  imports: [PopupSelectComponent],
  template: `
    <button data-testid="outside">outside</button>
    <clarityokr-popup-select
      [options]="options"
      [value]="value"
      [mode]="mode"
      [disabled]="disabled"
      variant="pill"
      tone="done"
      ariaLabel="选择"
      testId="sel"
      (selected)="picked.push($event)"
    >
      <span class="label">当前</span>
    </clarityokr-popup-select>
  `,
})
class Host {
  options = OPTIONS;
  value: string | null = 'a';
  mode: 'menu' | 'listbox' = 'menu';
  disabled = false;
  picked: (string | null)[] = [];
}

describe('PopupSelectComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const root = (): HTMLElement => fixture.nativeElement;
  const trigger = (): HTMLButtonElement => root().querySelector('[data-testid="sel"]')!;
  const items = (): HTMLButtonElement[] => Array.from(root().querySelectorAll('.popup__item'));
  const key = (el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders a closed trigger with menu semantics and the projected content', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('选择');
    expect(trigger().getAttribute('data-tone')).toBe('done');
    expect(trigger().textContent).toContain('当前');
    expect(items()).toHaveLength(0);
  });

  it('opens on click and exposes menuitemradio items with the checked one', () => {
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(items().map((i) => i.getAttribute('role'))).toEqual(Array(3).fill('menuitemradio'));
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(items()[1]!.textContent).toContain('✓');
    trigger().click();
    fixture.detectChanges();
    expect(items()).toHaveLength(0);
  });

  it('uses option semantics in listbox mode', () => {
    host.mode = 'listbox';
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(root().querySelector('[role="listbox"]')).not.toBeNull();
    expect(items().map((i) => i.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(items()[0]!.getAttribute('aria-checked')).toBeNull();
  });

  it.each(['Enter', ' ', 'ArrowDown'])('opens with %j and focuses the current item', (k) => {
    key(trigger(), k);
    expect(items()).toHaveLength(3);
    expect(document.activeElement).toBe(items()[1]);
  });

  it('moves with arrows (wrapping), Home and End', () => {
    key(trigger(), 'Enter');
    key(items()[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2]!, 'Home');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0]!, 'End');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('selects with Enter / click, emits the value (null is a value) and returns focus', () => {
    key(trigger(), 'Enter');
    items()[2]!.click();
    fixture.detectChanges();
    expect(host.picked).toEqual(['b']);
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());

    key(trigger(), 'Enter');
    items()[0]!.click();
    expect(host.picked).toEqual(['b', null]);
  });

  it('closes on Escape and returns focus to the trigger without emitting', () => {
    key(trigger(), 'Enter');
    const event = key(items()[1]!, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
    expect(host.picked).toEqual([]);
    // Escape on the trigger of an open popup also closes it
    trigger().click();
    fixture.detectChanges();
    key(trigger(), 'Escape');
    expect(items()).toHaveLength(0);
  });

  it('closes on Tab (from the item and from the trigger) without trapping focus', () => {
    key(trigger(), 'Enter');
    const tab = key(items()[1]!, 'Tab');
    expect(tab.defaultPrevented).toBe(false);
    expect(items()).toHaveLength(0);
    trigger().click();
    fixture.detectChanges();
    key(trigger(), 'Tab');
    expect(items()).toHaveLength(0);
  });

  it('closes when the user clicks outside', () => {
    trigger().click();
    fixture.detectChanges();
    (root().querySelector('[data-testid="outside"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(items()).toHaveLength(0);
  });

  it('does nothing while disabled and marks the trigger aria-disabled', () => {
    host.disabled = true;
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    trigger().click();
    key(trigger(), 'Enter');
    expect(items()).toHaveLength(0);
  });

  it('opens upwards when there is no room below', () => {
    trigger().getBoundingClientRect = () =>
      ({ top: 700, bottom: 724, left: 0, right: 10, width: 10, height: 24 }) as DOMRect;
    Object.defineProperty(window, 'innerHeight', { value: 740, configurable: true });
    trigger().click();
    fixture.detectChanges();
    expect(root().querySelector('.popup--up')).not.toBeNull();
  });
});
