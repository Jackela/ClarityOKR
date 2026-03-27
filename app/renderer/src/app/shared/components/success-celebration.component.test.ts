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
    const icon = fixture.debugElement.query(By.css('.celebration-icon'));
    expect(icon).toBeTruthy();
  });

  it('should trigger animation on show', () => {
    component.show = false;
    fixture.detectChanges();

    expect(component.isAnimating).toBe(false);

    component.show = true;
    fixture.detectChanges();

    expect(component.isAnimating).toBe(true);
  });

  it('should emit onClose event when close button clicked', () => {
    const closeSpy = jest.fn();
    component.onClose.subscribe(closeSpy);
    fixture.detectChanges();

    const closeButton = fixture.debugElement.query(By.css('.close-button'));
    if (closeButton) {
      closeButton.triggerEventHandler('click', {});
      expect(closeSpy).toHaveBeenCalled();
    }
  });

  it('should auto-hide after duration when autoHide is true', (done) => {
    jest.useFakeTimers();
    component.autoHide = true;
    component.duration = 1000;
    component.show = true;
    fixture.detectChanges();

    expect(component.show).toBe(true);

    jest.advanceTimersByTime(1000);

    expect(component.show).toBe(false);
    jest.useRealTimers();
    done();
  });

  it('should not auto-hide when autoHide is false', () => {
    jest.useFakeTimers();
    component.autoHide = false;
    component.duration = 1000;
    component.show = true;
    fixture.detectChanges();

    jest.advanceTimersByTime(2000);

    expect(component.show).toBe(true);
    jest.useRealTimers();
  });

  it('should apply animation class when animating', () => {
    component.show = true;
    component.isAnimating = true;
    fixture.detectChanges();

    const container = fixture.debugElement.query(By.css('.celebration-container'));
    expect(container.nativeElement.classList.contains('animating')).toBe(true);
  });
});
