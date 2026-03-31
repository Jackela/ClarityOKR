import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  let fixture: ComponentFixture<LoadingSpinnerComponent>;
  let component: LoadingSpinnerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingSpinnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingSpinnerComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render spinner element', () => {
    fixture.detectChanges();
    const spinner = fixture.debugElement.query(By.css('.spinner-container'));
    expect(spinner).toBeTruthy();
  });

  it('should render with default medium size', () => {
    fixture.detectChanges();
    const spinner = fixture.debugElement.query(By.css('.spinner'));
    expect(spinner.nativeElement.classList.contains('spinner--md')).toBe(true);
  });

  it('should apply size class correctly', () => {
    component.size = 'lg';
    fixture.detectChanges();
    const spinner = fixture.debugElement.query(By.css('.spinner'));
    expect(spinner.nativeElement.classList.contains('spinner--lg')).toBe(true);
  });

  it('should display message when provided', () => {
    component.message = 'Loading data...';
    fixture.detectChanges();

    const messageElement = fixture.debugElement.query(By.css('.spinner__message'));
    expect(messageElement).toBeTruthy();
    expect(messageElement.nativeElement.textContent).toBe('Loading data...');
  });

  it('should have aria-live attribute for accessibility', () => {
    fixture.detectChanges();
    const spinner = fixture.debugElement.query(By.css('.spinner-container'));
    expect(spinner.nativeElement.getAttribute('aria-live')).toBe('polite');
  });

  describe('sizes', () => {
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

    sizes.forEach((size) => {
      it(`should render ${size} size correctly`, () => {
        component.size = size;
        fixture.detectChanges();
        const spinner = fixture.debugElement.query(By.css('.spinner'));
        expect(spinner.nativeElement.classList.contains(`spinner--${size}`)).toBe(true);
      });
    });
  });
});
