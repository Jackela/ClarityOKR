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
        [confirmDisabled]="disabled"
        [confirmNote]="note"
        (cancelled)="cancelled = cancelled + 1; open = false"
        (confirmed)="confirmed = confirmed + 1; open = false"
      />
    }
  `,
})
class Host {
  open = false;
  danger = true;
  disabled = false;
  note = '';
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

  describe('modal behaviour', () => {
    const key = (init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };

    it('everything behind it is inert, and comes back when it closes', () => {
      expect(q('#opener').hasAttribute('inert')).toBe(true);
      expect(q('.scrim').closest('[inert]')).toBeNull();
      q('[data-testid="dialog-cancel"]').click();
      fixture.detectChanges();
      expect(q('#opener').hasAttribute('inert')).toBe(false);
      expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    });

    it('a press on the scrim keeps the focus in the dialog (mousedown is cancelled)', () => {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      q('[data-testid="dialog-scrim"]').dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(q('[data-testid="dialog-cancel"]'));
      expect(fixture.componentInstance.cancelled).toBe(0);
    });

    it('a press on a button is left alone', () => {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      q('[data-testid="dialog-confirm"]').dispatchEvent(down);
      expect(down.defaultPrevented).toBe(false);
    });

    it('Esc still cancels when the focus fell out of the box (e.g. to <body>)', () => {
      (document.activeElement as HTMLElement).blur();
      expect(document.activeElement).toBe(document.body);
      expect(key({ key: 'Escape' }).defaultPrevented).toBe(true);
      expect(fixture.componentInstance.cancelled).toBe(1);
    });

    it('Tab from outside the box comes back to the first button, Shift+Tab to the last', () => {
      (document.activeElement as HTMLElement).blur();
      key({ key: 'Tab' });
      expect(document.activeElement).toBe(q('[data-testid="dialog-cancel"]'));
      (document.activeElement as HTMLElement).blur();
      key({ key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(q('[data-testid="dialog-confirm"]'));
    });

    it('the listener is gone after it closes', () => {
      q('[data-testid="dialog-cancel"]').click();
      fixture.detectChanges();
      key({ key: 'Escape' });
      expect(fixture.componentInstance.cancelled).toBe(1);
    });
  });

  describe('a confirm answer that is not available yet', () => {
    beforeEach(() => {
      fixture.componentInstance.disabled = true;
      fixture.componentInstance.note = '正在保存，请稍候。';
      fixture.detectChanges();
    });

    it('is aria-disabled (still focusable), explained beside the buttons, and does nothing', () => {
      const confirm = q('[data-testid="dialog-confirm"]');
      expect(confirm.getAttribute('aria-disabled')).toBe('true');
      expect((confirm as HTMLButtonElement).disabled).toBe(false);
      expect(q('[data-testid="dialog-note"]').textContent).toBe('正在保存，请稍候。');
      expect(q('[data-testid="dialog-note"]').getAttribute('role')).toBe('status');
      expect(confirm.getAttribute('aria-describedby')).toBe(q('[data-testid="dialog-note"]').id);
      confirm.click();
      expect(fixture.componentInstance.confirmed).toBe(0);
      confirm.focus();
      expect(document.activeElement).toBe(confirm);
    });

    it('works again when it becomes available, and the note goes away', () => {
      fixture.componentInstance.disabled = false;
      fixture.componentInstance.note = '';
      fixture.detectChanges();
      expect(q('[data-testid="dialog-note"]')).toBeNull();
      expect(q('[data-testid="dialog-confirm"]').getAttribute('aria-disabled')).toBeNull();
      q('[data-testid="dialog-confirm"]').click();
      expect(fixture.componentInstance.confirmed).toBe(1);
    });
  });
});
