import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SuccessCelebrationComponent } from './success-celebration.component';

describe('SuccessCelebrationComponent', () => {
  let fixture: ComponentFixture<SuccessCelebrationComponent>;
  let component: SuccessCelebrationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuccessCelebrationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SuccessCelebrationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render celebration container', () => {
    fixture.detectChanges();
    const container = fixture.debugElement.query(By.css('.celebration-container'));
    expect(container).toBeTruthy();
  });

  it('should display title', () => {
    component.title = 'Success!';
    fixture.detectChanges();

    const title = fixture.debugElement.query(By.css('.celebration-title'));
    expect(title.nativeElement.textContent).toBe('Success!');
  });

  it('should display message when provided', () => {
    component.title = 'Done!';
    component.message = 'Your OKR has been created successfully.';
    fixture.detectChanges();

    const message = fixture.debugElement.query(By.css('.celebration-message'));
    expect(message.nativeElement.textContent).toBe('Your OKR has been created successfully.');
  });

  it('should render checkmark icon', () => {
    fixture.detectChanges();
    const checkmark = fixture.debugElement.query(By.css('.checkmark'));
    expect(checkmark).toBeTruthy();
  });

  it('should trigger animation on show', () => {
    fixture.detectChanges();

    // Component starts not dismissing
    expect(component.isDismissing).toBe(false);

    // Trigger dismiss
    component.dismiss();
    fixture.detectChanges();

    expect(component.isDismissing).toBe(true);
  });

  it('should emit dismissed event when dismiss button clicked', () => {
    jest.useFakeTimers();
    const closeSpy = jest.fn();
    component.dismissed.subscribe(closeSpy);
    fixture.detectChanges();

    const dismissButton = fixture.debugElement.query(By.css('.dismiss-button'));
    expect(dismissButton).toBeTruthy();
    dismissButton.triggerEventHandler('click', {});
    
    // Fast-forward past the animation delay
    jest.advanceTimersByTime(400);
    
    expect(closeSpy).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('should auto-dismiss after duration when autoDismiss is true', (done) => {
    jest.useFakeTimers();
    component.autoDismiss = true;
    component.duration = 1000;

    const dismissedSpy = jest.fn();
    component.dismissed.subscribe(dismissedSpy);

    // Re-initialize to start timer with new values
    component.ngOnInit();
    fixture.detectChanges();

    expect(dismissedSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1300); // Duration + animation time

    expect(dismissedSpy).toHaveBeenCalled();
    jest.useRealTimers();
    done();
  });

  it('should not auto-dismiss when autoDismiss is false', () => {
    jest.useFakeTimers();
    component.autoDismiss = false;
    component.duration = 1000;

    const dismissedSpy = jest.fn();
    component.dismissed.subscribe(dismissedSpy);

    // Re-initialize to check autoDismiss behavior
    component.ngOnInit();
    fixture.detectChanges();

    jest.advanceTimersByTime(2000);

    expect(dismissedSpy).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('should apply celebration--dismissing class when dismissing', () => {
    fixture.detectChanges();

    // Initially not dismissing
    expect(component.isDismissing).toBe(false);

    // Trigger dismiss
    component.dismiss();
    fixture.detectChanges();

    const container = fixture.debugElement.query(By.css('.celebration-container'));
    expect(container.nativeElement.classList.contains('celebration--dismissing')).toBe(true);
  });
});
