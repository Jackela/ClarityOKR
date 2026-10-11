import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { DialogComponent } from './dialog.component';

@Component({
  standalone: true,
  imports: [DialogComponent],
  template: `
    <button id="opener" type="button" (click)="open = true">open</button>
    @if (open) {
      <clarityokr-dialog
        title="放弃未保存的修改？"
        body="你写的内容还没有保存。"
        cancelLabel="继续编辑"
        confirmLabel="放弃"
        [danger]="danger"
        (cancelled)="cancelled = cancelled + 1; open = false"
        (confirmed)="confirmed = confirmed + 1; open = false"
      />
    }
  `,
})
class Host {
  open = false;
  danger = true;
  cancelled = 0;
  confirmed = 0;
}

describe('DialogComponent (spec §2.6, T8)', () => {
  let fixture: ComponentFixture<Host>;
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => root().querySelector(sel) as T;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    q('#opener').focus();
    q('#opener').click();
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('is a modal alertdialog named by its title and described by its body', () => {
    const box = q('[role="alertdialog"]');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)!.textContent).toBe(
      '放弃未保存的修改？',
    );
    expect(document.getElementById(box.getAttribute('aria-describedby')!)!.textContent).toBe(
      '你写的内容还没有保存。',
    );
  });

  it('a non-destructive confirmation is a plain dialog', () => {
    fixture.componentInstance.open = false;
    fixture.detectChanges();
    fixture.componentInstance.danger = false;
    q('#opener').click();
    fixture.detectChanges();
    expect(q('[role="dialog"]')).not.toBeNull();
    expect(q('[role="alertdialog"]')).toBeNull();
  });

  it('opens with the focus on the safe button (cancel), listed first', () => {
    const buttons = Array.from(root().querySelectorAll('.dialog__actions button'));
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['继续编辑', '放弃']);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Tab and Shift+Tab cycle inside the two buttons', () => {
    const [cancel, confirm] = Array.from(
      root().querySelectorAll<HTMLElement>('.dialog__actions button'),
    );
    const press = (shiftKey: boolean): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement!.dispatchEvent(event);
      return event;
    };
    confirm!.focus();
    expect(press(false).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(press(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);
    // between the buttons the browser's own Tab order is used
    cancel!.focus();
    expect(press(false).defaultPrevented).toBe(false);
  });

  it('Esc is cancel and puts the focus back on the opener', () => {
    q('[role="alertdialog"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.cancelled).toBe(1);
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(q('#opener'));
  });

  it('a click on the scrim does not close it', () => {
    q('[data-testid="dialog-scrim"]').click();
    fixture.detectChanges();
    expect(q('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.componentInstance.cancelled).toBe(0);
  });

  it('confirm emits confirmed', () => {
    q('[data-testid="dialog-confirm"]').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.confirmed).toBe(1);
  });
});
