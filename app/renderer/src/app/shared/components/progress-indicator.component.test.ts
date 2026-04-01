import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ProgressIndicatorComponent } from './progress-indicator.component';

describe('ProgressIndicatorComponent', () => {
  let fixture: ComponentFixture<ProgressIndicatorComponent>;
  let component: ProgressIndicatorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressIndicatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProgressIndicatorComponent);
    component = fixture.componentInstance;
    component.current = 1;
    component.total = 5;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render progress container', () => {
    fixture.detectChanges();
    const progress = fixture.debugElement.query(By.css('.progress-container'));
    expect(progress).toBeTruthy();
  });

  it('should display current step and total steps', () => {
    component.current = 2;
    component.total = 5;
    fixture.detectChanges();

    const counter = fixture.debugElement.query(By.css('.progress-counter'));
    expect(counter.nativeElement.textContent).toContain('2');
    expect(counter.nativeElement.textContent).toContain('5');
  });

  it('should calculate progress percentage correctly', () => {
    component.current = 3;
    component.total = 4;

    expect(component.calculatePercentage()).toBe(50);
  });

  it('should clamp progress to 0 when current is 1', () => {
    component.current = 1;
    component.total = 5;

    expect(component.calculatePercentage()).toBe(0);
  });

  it('should clamp progress to 100 when current equals total', () => {
    component.current = 5;
    component.total = 5;

    expect(component.calculatePercentage()).toBe(100);
  });

  it('should render progress bar', () => {
    fixture.detectChanges();

    const progressBar = fixture.debugElement.query(By.css('.progress-bar'));
    expect(progressBar).toBeTruthy();
  });

  it('should render progress fill with correct width', () => {
    component.current = 2;
    component.total = 4;
    fixture.detectChanges();

    const progressFill = fixture.debugElement.query(By.css('.progress-fill'));
    expect(progressFill).toBeTruthy();
    expect(progressFill.nativeElement.style.width).toBe('25%');
  });

  it('should apply progress-fill--complete class when current equals total', () => {
    component.current = 4;
    component.total = 4;
    fixture.detectChanges();

    const progressFill = fixture.debugElement.query(By.css('.progress-fill'));
    expect(progressFill.nativeElement.classList.contains('progress-fill--complete')).toBe(true);
  });
});
