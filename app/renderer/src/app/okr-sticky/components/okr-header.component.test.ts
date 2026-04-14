import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { OkrHeaderComponent } from './okr-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../shared/services/i18n.service';

describe('OkrHeaderComponent', () => {
  let fixture: ComponentFixture<OkrHeaderComponent>;
  let component: OkrHeaderComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrHeaderComponent, TranslatePipe],
      providers: [
        {
          provide: I18nService,
          useValue: {
            currentLocale: () => 'zh-CN',
            translate: (key: string) => key,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrHeaderComponent);
    component = fixture.componentInstance;
    component.objective = '提升团队交付节奏';
    component.generatedAt = '2025-10-31T10:12:00.000Z';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render objective text', () => {
    fixture.detectChanges();
    const objectiveEl = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objectiveEl).not.toBeNull();
    expect(objectiveEl.textContent).toContain('提升团队交付节奏');
  });

  it('should render generatedAt date', () => {
    fixture.detectChanges();
    const badges = fixture.nativeElement.querySelectorAll('.okr-header__badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // DatePipe medium format for zh-CN includes year and time
    expect(badges[0].textContent).toContain('2025');
  });

  it('should conditionally render lastEditedAt badge', () => {
    fixture.componentRef.setInput('lastEditedAt', null);
    fixture.detectChanges();
    const badges = fixture.nativeElement.querySelectorAll('.okr-header__badge');
    expect(badges.length).toBe(1);

    fixture.componentRef.setInput('lastEditedAt', '2025-11-01T08:00:00.000Z');
    fixture.detectChanges();
    const updatedBadges = fixture.nativeElement.querySelectorAll('.okr-header__badge');
    expect(updatedBadges.length).toBe(2);
    expect(updatedBadges[1].textContent).toContain('2025');
  });

  it('should conditionally render manual edits badge', () => {
    fixture.componentRef.setInput('hasManualEdits', false);
    fixture.detectChanges();
    let manualEditBadge = fixture.nativeElement.querySelector('[data-testid="sticky-manual-edits"]');
    expect(manualEditBadge).toBeNull();

    fixture.componentRef.setInput('hasManualEdits', true);
    fixture.detectChanges();
    manualEditBadge = fixture.nativeElement.querySelector('[data-testid="sticky-manual-edits"]');
    expect(manualEditBadge).not.toBeNull();
  });
});
