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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render progress element', () => {
    fixture.detectChanges();
    const progress = fixture.debugElement.query(By.css('.progress-indicator'));
    expect(progress).toBeTruthy();
  });

  it('should display current step and total steps', () => {
    component.currentStep = 2;
    component.totalSteps = 5;
    fixture.detectChanges();

    const stepText = fixture.debugElement.query(By.css('.step-text'));
    expect(stepText.nativeElement.textContent).toContain('2');
    expect(stepText.nativeElement.textContent).toContain('5');
  });

  it('should calculate progress percentage correctly', () => {
    component.currentStep = 3;
    component.totalSteps = 4;
    fixture.detectChanges();

    expect(component.progressPercentage).toBe(75);
  });

  it('should clamp progress to 0 when currentStep is negative', () => {
    component.currentStep = -1;
    component.totalSteps = 5;
    fixture.detectChanges();

    expect(component.progressPercentage).toBe(0);
  });

  it('should clamp progress to 100 when currentStep exceeds totalSteps', () => {
    component.currentStep = 10;
    component.totalSteps = 5;
    fixture.detectChanges();

    expect(component.progressPercentage).toBe(100);
  });

  it('should render step indicators', () => {
    component.totalSteps = 4;
    fixture.detectChanges();

    const stepIndicators = fixture.debugElement.queryAll(By.css('.step-indicator'));
    expect(stepIndicators.length).toBe(4);
  });

  it('should mark completed steps correctly', () => {
    component.currentStep = 2;
    component.totalSteps = 4;
    fixture.detectChanges();

    const stepIndicators = fixture.debugElement.queryAll(By.css('.step-indicator'));
    expect(stepIndicators[0].nativeElement.classList.contains('completed')).toBe(true);
    expect(stepIndicators[1].nativeElement.classList.contains('completed')).toBe(true);
    expect(stepIndicators[2].nativeElement.classList.contains('active')).toBe(true);
    expect(stepIndicators[3].nativeElement.classList.contains('pending')).toBe(true);
  });
});
