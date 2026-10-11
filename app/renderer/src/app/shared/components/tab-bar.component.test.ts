import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { TabBarComponent } from './tab-bar.component';

@Component({
  standalone: true,
  imports: [TabBarComponent],
  template: `<clarityokr-tab-bar
    [tabs]="tabs"
    [selected]="selected"
    label="页面切换"
    (selectedChange)="selected = $event; changes.push($event)"
  />`,
})
class Host {
  tabs = [
    { id: 'note', label: '便签' },
    { id: 'review', label: '复盘' },
    { id: 'history', label: '历史' },
  ];
  selected = 'note';
  changes: string[] = [];
}

describe('TabBarComponent', () => {
  let fixture: ComponentFixture<Host>;
  const tabs = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
  const press = (index: number, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    tabs()[index]!.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('is a labelled tablist whose tabs point at their panels', () => {
    const list = fixture.nativeElement.querySelector('[role="tablist"]');
    expect(list.getAttribute('aria-label')).toBe('页面切换');
    expect(tabs().map((t) => t.id)).toEqual(['tab-note', 'tab-review', 'tab-history']);
    expect(tabs().map((t) => t.getAttribute('aria-controls'))).toEqual([
      'panel-note',
      'panel-review',
      'panel-history',
    ]);
  });

  it('only the selected tab is in the Tab order', () => {
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });

  it('activates on click, but not for the already selected tab', () => {
    tabs()[2]!.click();
    fixture.detectChanges();
    tabs()[2]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.changes).toEqual(['history']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('moves with ← → (wrapping), Home and End, activating and focusing the new tab', () => {
    press(0, 'ArrowRight');
    expect(fixture.componentInstance.selected).toBe('review');
    expect(document.activeElement).toBe(tabs()[1]);
    press(1, 'ArrowLeft');
    expect(fixture.componentInstance.selected).toBe('note');
    press(0, 'ArrowLeft');
    expect(fixture.componentInstance.selected).toBe('history');
    press(2, 'ArrowRight');
    expect(fixture.componentInstance.selected).toBe('note');
    press(0, 'End');
    expect(fixture.componentInstance.selected).toBe('history');
    press(2, 'Home');
    expect(fixture.componentInstance.selected).toBe('note');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('leaves other keys alone', () => {
    expect(press(0, 'a').defaultPrevented).toBe(false);
    expect(press(0, 'Tab').defaultPrevented).toBe(false);
    expect(fixture.componentInstance.changes).toEqual([]);
  });
});
