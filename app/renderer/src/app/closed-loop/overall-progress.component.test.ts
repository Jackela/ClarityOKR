import { TestBed } from '@angular/core/testing';

import { OverallProgressComponent } from './overall-progress.component';

describe('OverallProgressComponent', () => {
  function render(value: number | null, total: number, filled: number) {
    const fixture = TestBed.createComponent(OverallProgressComponent);
    Object.assign(fixture.componentInstance, { value, total, filled });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {
      number: el.querySelector('[data-testid="overall-value"]')!.textContent!.trim(),
      summary: el.querySelector('[data-testid="overall-summary"]')!.textContent!.trim(),
      bar: el.querySelector('[role="progressbar"]')!,
      el,
    };
  }

  it('shows the number, "m of n filled" and a progressbar with value text', () => {
    const view = render(68, 3, 2);
    expect(view.number).toBe('68%');
    expect(view.summary).toBe('3 个关键结果中 2 个已填写进度');
    expect(view.bar.getAttribute('aria-valuenow')).toBe('68');
    expect(view.bar.getAttribute('aria-valuetext')).toBe('整体进度 68%');
    expect(view.el.textContent).toContain('整体进度');
  });

  it('with nothing filled shows "—", no valuenow, the unfilled text and no 0%', () => {
    const view = render(null, 4, 0);
    expect(view.number).toBe('—');
    expect(view.summary).toBe('还没有填写进度');
    expect(view.bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(view.bar.getAttribute('aria-valuetext')).toBe('整体进度未填写');
    expect(view.el.textContent).not.toContain('0%');
    expect(view.el.querySelector('.meter__fill')).toBeNull();
  });

  it('is read only: no button or input', () => {
    const view = render(10, 1, 1);
    expect(view.el.querySelector('button, input')).toBeNull();
  });
});
