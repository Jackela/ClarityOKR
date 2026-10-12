import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { TextFieldComponent } from './text-field.component';

@Component({
  standalone: true,
  imports: [TextFieldComponent],
  template: `<clarityokr-text-field
    id="f"
    label="目标"
    [value]="value"
    [maxLength]="max"
    [emptyError]="empty"
    [readonly]="readonly"
    testId="f"
    (valueChange)="value = $event; changes = changes + 1"
  />`,
})
class Host {
  value = '';
  max = 200;
  empty = '';
  readonly = false;
  changes = 0;
}

describe('TextFieldComponent (spec §3.9a)', () => {
  let fixture: ComponentFixture<Host>;
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const type = (text: string): void => {
    const area = q<HTMLTextAreaElement>('f');
    area.value = text;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const text = (id: string): string => q(id).textContent!.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('has a real label tied to the textarea and an always-visible counter n/limit', () => {
    const label = root().querySelector('label')!;
    expect(label.textContent!.trim()).toBe('目标');
    expect(label.getAttribute('for')).toBe(q('f').id);
    expect(text('f-count')).toBe('0/200');
    type('提升交付效率');
    expect(text('f-count')).toBe('6/200');
  });

  it('the counter says an emoji counts as one, in title and aria-label', () => {
    type('😀');
    const count = q('f-count');
    const expected = '已输入 1 个字符，上限 200；一个 emoji 算 1 个字符';
    expect(count.getAttribute('title')).toBe(expected);
    expect(count.getAttribute('aria-label')).toBe(expected);
  });

  it('over the limit: the content is kept whole, the border/counter/error row turn to error', () => {
    const long = 'a'.repeat(236);
    type(long);
    expect(fixture.componentInstance.value).toBe(long); // not truncated
    expect(q<HTMLTextAreaElement>('f').value).toBe(long);
    expect(text('f-count')).toBe('⚠ 236/200');
    expect(q('f-count').classList).toContain('field__count--over');
    expect(text('f-error')).toContain('超出 36 个字符，请删减后再保存。');
    expect(q('f').getAttribute('aria-invalid')).toBe('true');
    expect(q('f').getAttribute('aria-describedby')).toContain(q('f-error').id);
    expect(q('f').classList).toContain('field__input--invalid');
  });

  it('exactly at the limit is fine: no error, no ⚠', () => {
    type('a'.repeat(200));
    expect(text('f-count')).toBe('200/200');
    expect(text('f-error')).toBe('');
    expect(q('f').getAttribute('aria-invalid')).toBeNull();
  });

  it('a stacked-combining cluster shows the special-symbols message, the real count and no red counter', () => {
    type('a' + '\u0301'.repeat(40));
    expect(text('f-error')).toContain('内容里的特殊符号过多，请删减后再保存。');
    expect(text('f-error')).not.toContain('超出');
    expect(text('f-count')).toBe('1/200');
    expect(q('f-count').classList).not.toContain('field__count--over');
    expect(q('f').getAttribute('aria-invalid')).toBe('true');
  });

  it('announces once when it goes over, nothing while it stays over, and a status when it is back', () => {
    type('a'.repeat(190));
    expect(text('f-alert')).toBe('');
    type('a'.repeat(203));
    expect(text('f-alert')).toBe('目标超出 3 个字符。');
    expect(q('f-alert').getAttribute('role')).toBe('alert');
    const node = q('f-alert');
    type('a'.repeat(210));
    // the message of the first crossing stays: no new announcement for more typing
    expect(text('f-alert')).toBe('目标超出 3 个字符。');
    expect(q('f-alert')).toBe(node);
    type('a'.repeat(200));
    expect(text('f-alert')).toBe('');
    expect(text('f-status')).toBe('目标已在字数范围内。');
    expect(q('f-status').getAttribute('role')).toBe('status');
  });

  it('announces the special-symbol case with its own wording', () => {
    type('a');
    type('a' + '\u0301'.repeat(40));
    expect(text('f-alert')).toBe('目标里的特殊符号过多。');
  });

  it('shows an empty-field error only when the parent asks for it and marks it invalid', () => {
    fixture.componentInstance.empty = '目标不能为空。';
    fixture.componentRef?.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(text('f-error')).toContain('目标不能为空。');
    expect(q('f').getAttribute('aria-invalid')).toBe('true');
  });

  it('is read-only while saving', () => {
    fixture.componentInstance.readonly = true;
    fixture.detectChanges();
    expect(q<HTMLTextAreaElement>('f').readOnly).toBe(true);
  });

  describe('IME composition', () => {
    const area = (): HTMLTextAreaElement => q<HTMLTextAreaElement>('f');
    const compose = (provisional: string): void => {
      area().value = provisional;
      area().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      fixture.detectChanges();
    };

    it('provisional text is not handed to the owner (never reaches an undo stack)', () => {
      area().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      compose('n');
      compose('ni');
      compose('nihao');
      expect(fixture.componentInstance.changes).toBe(0);
      expect(fixture.componentInstance.value).toBe('');
    });

    it('the count is shown while composing, in grapheme units', () => {
      area().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      compose('你好');
      expect(text('f-count')).toBe('2/200');
      compose('你好👨‍👩‍👧‍👦');
      expect(text('f-count')).toBe('3/200');
    });

    it('an over-limit text only shows its error after the composition ended', () => {
      fixture.componentInstance.max = 5;
      fixture.detectChanges();
      area().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      compose('一二三四五六七');
      expect(text('f-count')).toBe('7/5');
      expect(text('f-error')).toBe('');
      expect(q('f').getAttribute('aria-invalid')).toBeNull();
      expect(q('f-alert').textContent).toBe('');
      expect(q('f-count').classList).not.toContain('field__count--over');
      area().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      fixture.detectChanges();
      expect(fixture.componentInstance.value).toBe('一二三四五六七');
      expect(text('f-error')).toContain('超出 2 个字符');
      expect(q('f').getAttribute('aria-invalid')).toBe('true');
    });

    it('compositionend hands over the final text exactly once, even if an input event follows', () => {
      area().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      compose('你');
      compose('你好');
      area().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      area().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
      fixture.detectChanges();
      expect(fixture.componentInstance.changes).toBe(1);
      expect(fixture.componentInstance.value).toBe('你好');
      expect(text('f-count')).toBe('2/200');
    });

    it('normal typing afterwards is handed over again, also the same text as before (after undo)', () => {
      area().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      compose('你好');
      area().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      type('你好a');
      expect(fixture.componentInstance.changes).toBe(2);
      // the owner undid it; the user types the same text again
      fixture.componentInstance.value = '你好';
      fixture.detectChanges();
      type('你好a');
      expect(fixture.componentInstance.changes).toBe(3);
    });
  });
});
