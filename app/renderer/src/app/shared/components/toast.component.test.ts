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

  it('sits 56px higher when a bottom bar is showing', () => {
    toasts.show({ kind: 'success', message: 'x' });
    fixture.componentRef.setInput('raised', true);
    flush();
    expect(q('toast-success')!.classList).toContain('toast--raised');
  });

  it('dismiss(id) ignores a toast that was already replaced', () => {
    const first = toasts.show({ kind: 'success', message: 'a' });
    toasts.show({ kind: 'success', message: 'b' });
    toasts.dismiss(first);
    expect(toasts.current()?.message).toBe('b');
    toasts.dismiss();
    expect(toasts.current()).toBeNull();
  });
});
