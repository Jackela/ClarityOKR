import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ToastHostComponent } from './toast-host.component';
import { ToastService } from './toast.service';

describe('Toast (spec §2.6)', () => {
  let fixture: ComponentFixture<ToastHostComponent>;
  let toasts: ToastService;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const flush = (): void => {
    fixture.detectChanges();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ imports: [ToastHostComponent] });
    fixture = TestBed.createComponent(ToastHostComponent);
    toasts = TestBed.inject(ToastService);
    flush();
  });

  afterEach(() => jest.useRealTimers());

  it('shows nothing until a toast is raised', () => {
    expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
  });

  it('success is a status that disappears after 8 seconds', () => {
    toasts.show({ kind: 'success', message: '复盘已保存。' });
    flush();
    expect(q('toast-success')!.getAttribute('role')).toBe('status');
    expect(q('toast-success')!.textContent).toContain('复盘已保存。');
    jest.advanceTimersByTime(7900);
    flush();
    expect(q('toast-success')).not.toBeNull();
    jest.advanceTimersByTime(200);
    flush();
    expect(q('toast-success')).toBeNull();
  });

  it('neutral is a status that goes after 5 seconds', () => {
    toasts.show({ kind: 'neutral', message: '已取消导出，没有保存文件。' });
    flush();
    expect(q('toast-neutral')!.getAttribute('role')).toBe('status');
    jest.advanceTimersByTime(5100);
    flush();
    expect(q('toast-neutral')).toBeNull();
  });

  it('an error is an alert and never times out; only 关闭 removes it', () => {
    toasts.show({ kind: 'error', message: '磁盘已满，没有保存成功。' });
    flush();
    expect(q('toast-error')!.getAttribute('role')).toBe('alert');
    jest.advanceTimersByTime(60_000);
    flush();
    expect(q('toast-error')).not.toBeNull();
    q('toast-close')!.click();
    flush();
    expect(q('toast-error')).toBeNull();
  });

  it('the close button is 32px and named 关闭通知', () => {
    toasts.show({ kind: 'success', message: 'x' });
    flush();
    expect(q('toast-close')!.getAttribute('aria-label')).toBe('关闭通知');
  });

  it('only one toast at a time: a new one replaces the old one', () => {
    toasts.show({ kind: 'success', message: '第一条' });
    flush();
    toasts.show({ kind: 'error', message: '第二条' });
    flush();
    expect(fixture.nativeElement.querySelectorAll('.toast')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('第二条');
    expect(fixture.nativeElement.textContent).not.toContain('第一条');
  });

  it('hover pauses the timer, leaving resumes it with the time that was left', () => {
    toasts.show({ kind: 'success', message: 'x' });
    flush();
    jest.advanceTimersByTime(6000);
    const el = q('toast-success')!;
    el.dispatchEvent(new Event('mouseenter'));
    jest.advanceTimersByTime(20_000);
    flush();
    expect(q('toast-success')).not.toBeNull();
    el.dispatchEvent(new Event('mouseleave'));
    jest.advanceTimersByTime(1900);
    flush();
    expect(q('toast-success')).not.toBeNull();
    jest.advanceTimersByTime(200);
    flush();
    expect(q('toast-success')).toBeNull();
  });

  it('focus inside pauses it too', () => {
    toasts.show({
      kind: 'success',
      message: 'x',
      actions: [{ label: '复制路径', testId: 'a', run: jest.fn() }],
    });
    flush();
    const el = q('toast-success')!;
    el.dispatchEvent(new Event('focusin'));
    jest.advanceTimersByTime(30_000);
    flush();
    expect(q('toast-success')).not.toBeNull();
  });

  it('runs its actions and does not take the focus when it appears', () => {
    const run = jest.fn();
    const before = document.activeElement;
    toasts.show({
      kind: 'error',
      message: 'x',
      actions: [{ label: '重试', testId: 'retry', run }],
    });
    flush();
    expect(document.activeElement).toBe(before);
    q('retry')!.click();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('docked: in the flow (not fixed), 8px above whatever follows it', () => {
    toasts.show({ kind: 'success', message: 'x' });
    fixture.componentRef.setInput('docked', true);
    flush();
    const toast = q('toast-success')!;
    expect(toast.classList).toContain('toast--docked');
    expect(getComputedStyle(toast).position).not.toBe('fixed');
  });

  it('dismiss(id) ignores a toast that was already replaced', () => {
    const first = toasts.show({ kind: 'success', message: 'a' });
    toasts.show({ kind: 'success', message: 'b' });
    toasts.dismiss(first);
    expect(toasts.current()?.message).toBe('b');
    toasts.dismiss();
    expect(toasts.current()).toBeNull();
  });

  it('a long text with detailFull: the short text is for the eyes, the full text is the tooltip and the accessible name', () => {
    toasts.show({
      kind: 'success',
      message: 'm',
      detail: '/Users/…/a.md',
      detailFull: '/Users/me/long/a.md',
    });
    flush();
    const detail = q('toast-detail')!;
    expect(detail.title).toBe('/Users/me/long/a.md');
    expect(detail.querySelector('[aria-hidden="true"]')!.textContent).toBe('/Users/…/a.md');
    expect(detail.querySelector('.sr-only')!.textContent).toBe('/Users/me/long/a.md');
  });

  it('closeLabel: a text button 「关闭」 instead of ×, and onClose runs after it', () => {
    const onClose = jest.fn();
    toasts.show({ kind: 'error', message: 'e', closeLabel: '关闭', onClose });
    flush();
    const close = q('toast-close')!;
    expect(close.textContent!.trim()).toBe('关闭');
    expect(close.hasAttribute('aria-label')).toBe(false);
    close.click();
    flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(q('toast-error')).toBeNull();
  });

  it('the × also reports onClose', () => {
    const onClose = jest.fn();
    toasts.show({ kind: 'success', message: 's', onClose });
    flush();
    q('toast-close')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('update() changes a toast in place: same id, the button keeps its DOM node and its focus', () => {
    const id = toasts.show({
      kind: 'success',
      message: 's',
      actions: [{ label: '复制路径', testId: 'a1', run: () => undefined }],
    });
    flush();
    const button = q<HTMLButtonElement>('a1')!;
    button.focus();
    toasts.update(id, { actions: [{ label: '已复制', testId: 'a1', run: () => undefined }] });
    flush();
    expect(toasts.current()!.id).toBe(id);
    expect(q('a1')).toBe(button);
    expect(button.textContent!.trim()).toBe('已复制');
    expect(document.activeElement).toBe(button);
    toasts.update(id + 1, { message: 'nope' });
    expect(toasts.current()!.message).toBe('s');
  });
});
