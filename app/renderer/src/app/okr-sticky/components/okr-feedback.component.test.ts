import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OkrFeedbackComponent } from './okr-feedback.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../shared/services/i18n.service';

describe('OkrFeedbackComponent', () => {
  let fixture: ComponentFixture<OkrFeedbackComponent>;
  let component: OkrFeedbackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrFeedbackComponent, TranslatePipe],
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

    fixture = TestBed.createComponent(OkrFeedbackComponent);
    component = fixture.componentInstance;
    component.sessionId = 'session-123';
    component.okrId = 'okr-456';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render question and two thumb buttons', () => {
    fixture.detectChanges();
    const thumbs = fixture.nativeElement.querySelectorAll('.okr-feedback__thumb');
    expect(thumbs.length).toBe(2);

    const thumbUp = fixture.nativeElement.querySelector('[data-testid="feedback-thumb-up"]');
    const thumbDown = fixture.nativeElement.querySelector('[data-testid="feedback-thumb-down"]');
    expect(thumbUp).not.toBeNull();
    expect(thumbDown).not.toBeNull();
  });

  it('should show comment section after selecting a rating', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feedback-comment"]')).toBeNull();

    component.selectRating('positive');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="feedback-comment"]')).not.toBeNull();
    expect(component.selectedRating()).toBe('positive');
  });

  it('should set aria-pressed on selected thumb', () => {
    component.selectRating('negative');
    fixture.detectChanges();

    const thumbDown = fixture.nativeElement.querySelector('[data-testid="feedback-thumb-down"]');
    expect(thumbDown.getAttribute('aria-pressed')).toBe('true');

    const thumbUp = fixture.nativeElement.querySelector('[data-testid="feedback-thumb-up"]');
    expect(thumbUp.getAttribute('aria-pressed')).toBe('false');
  });

  it('should enable submit after rating selection', () => {
    fixture.detectChanges();
    let submitButton = fixture.nativeElement.querySelector('[data-testid="feedback-submit"]');
    expect(submitButton).toBeNull(); // section hidden before rating

    component.selectRating('positive');
    fixture.detectChanges();

    submitButton = fixture.nativeElement.querySelector('[data-testid="feedback-submit"]');
    expect(submitButton).not.toBeNull();
    expect(submitButton.disabled).toBe(false);
  });

  it('should emit submitFeedback and show success after submit', () => {
    const spy = jest.fn();
    component.submitFeedback.subscribe(spy);

    component.selectRating('positive');
    component.commentText = 'Great work!';
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('[data-testid="feedback-submit"]'));
    submitButton.triggerEventHandler('click', {});

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-123',
        okrId: 'okr-456',
        rating: 'positive',
        comment: 'Great work!',
      }),
    );
    expect(component.isSubmitted()).toBe(true);

    fixture.detectChanges();
    const success = fixture.nativeElement.querySelector('[data-testid="feedback-success"]');
    expect(success).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="feedback-comment"]')).toBeNull();
  });

  it('should reset state when reset() is called', () => {
    component.selectRating('negative');
    component.commentText = 'Could be better';
    component.isSubmitted.set(true);

    component.reset();

    expect(component.selectedRating()).toBeNull();
    expect(component.commentText).toBe('');
    expect(component.isSubmitted()).toBe(false);
  });

  it('should ignore selectRating when already submitted', () => {
    component.selectRating('positive');
    component.isSubmitted.set(true);

    component.selectRating('negative');
    expect(component.selectedRating()).toBe('positive');
  });

  it('should ignore submit when no rating selected', () => {
    const spy = jest.fn();
    component.submitFeedback.subscribe(spy);

    component.submit();
    expect(spy).not.toHaveBeenCalled();
  });
});
