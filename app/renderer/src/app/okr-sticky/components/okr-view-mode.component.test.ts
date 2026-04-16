import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OkrViewModeComponent } from './okr-view-mode.component';
import type { KeyResultViewModel } from './types';

describe('OkrViewModeComponent', () => {
  let fixture: ComponentFixture<OkrViewModeComponent>;
  let component: OkrViewModeComponent;

  const keyResults: KeyResultViewModel[] = [
    { id: 'kr-1', statement: '缩短迭代周期', metricLabel: '周期 <= 21 天', ownerLabel: '运营团队' },
    { id: 'kr-2', statement: '降低缺陷率', metricLabel: null, ownerLabel: null },
    { id: 'kr-3', statement: '提升覆盖率', metricLabel: '覆盖率 >= 80%', ownerLabel: '开发团队' },
    { id: 'kr-4', statement: '优化构建时间', metricLabel: null, ownerLabel: 'DevOps' },
    { id: 'kr-5', statement: '改进文档', metricLabel: '文档完整', ownerLabel: null },
    { id: 'kr-6', statement: '用户满意度', metricLabel: 'NPS >= 50', ownerLabel: '产品团队' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrViewModeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrViewModeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render key results list', () => {
    component.keyResults = keyResults.slice(0, 2);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('[data-testid="sticky-key-result"]');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('缩短迭代周期');
    expect(items[1].textContent).toContain('降低缺陷率');
  });

  it('should render metric and owner badges when present', () => {
    component.keyResults = [keyResults[0]];
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]');
    const badgeTexts = Array.from(badges).map((el) => (el as HTMLElement).textContent?.trim());
    expect(badgeTexts).toContain('周期 <= 21 天');
    expect(badgeTexts).toContain('运营团队');
  });

  it('should not render badges when metricLabel and ownerLabel are null', () => {
    component.keyResults = [keyResults[1]];
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]');
    expect(badges.length).toBe(0);
  });

  it('should apply stagger classes correctly', () => {
    component.keyResults = keyResults;
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.okr-view-mode__item'));
    expect(items[0].nativeElement.classList.contains('animate-stagger-1')).toBe(true);
    expect(items[1].nativeElement.classList.contains('animate-stagger-2')).toBe(true);
    expect(items[2].nativeElement.classList.contains('animate-stagger-3')).toBe(true);
    expect(items[3].nativeElement.classList.contains('animate-stagger-4')).toBe(true);
    expect(items[4].nativeElement.classList.contains('animate-stagger-5')).toBe(true);
    expect(items[5].nativeElement.classList.contains('animate-stagger-5')).toBe(true);
  });

  it('should track by key result id', () => {
    const kr = keyResults[0];
    expect(component.trackByKeyResultId(0, kr)).toBe('kr-1');
  });
});
