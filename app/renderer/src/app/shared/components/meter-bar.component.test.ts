import { TestBed } from '@angular/core/testing';

import { MeterBarComponent } from './meter-bar.component';

describe('MeterBarComponent', () => {
  function render(setup: (c: MeterBarComponent) => void) {
    const fixture = TestBed.createComponent(MeterBarComponent);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const bar: HTMLElement = fixture.nativeElement.querySelector('[role="progressbar"]');
    const fill: HTMLElement | null = fixture.nativeElement.querySelector('.meter__fill');
    return { bar, fill };
  }

  it('exposes value, range and text for a filled bar', () => {
    const { bar, fill } = render((c) => {
      c.value = 65;
      c.label = '关键结果 1 进度';
      c.valueText = '65%，进行中';
      c.variant = 'in_progress';
    });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('65');
    expect(bar.getAttribute('aria-valuetext')).toBe('65%，进行中');
    expect(bar.getAttribute('aria-label')).toBe('关键结果 1 进度');
    expect(fill!.style.width).toBe('65%');
    expect(fill!.className).toContain('meter__fill--in_progress');
  });

  it('has no aria-valuenow and no fill when the value is missing', () => {
    const { bar, fill } = render((c) => {
      c.value = null;
      c.valueText = '未填写';
    });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.getAttribute('aria-valuetext')).toBe('未填写');
    expect(fill).toBeNull();
  });

  it('draws 0% as a present value with an empty-width fill', () => {
    const { bar, fill } = render((c) => (c.value = 0));
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(fill!.style.width).toBe('0%');
  });
});
