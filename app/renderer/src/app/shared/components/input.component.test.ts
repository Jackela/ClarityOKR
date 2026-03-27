import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { InputComponent } from './input.component';

describe('InputComponent', () => {
  let fixture: ComponentFixture<InputComponent>;
  let component: InputComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(InputComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render input element', () => {
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'));
    expect(input).toBeTruthy();
  });

  it('should apply placeholder correctly', () => {
    component.placeholder = 'Enter text...';
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'));
    expect(input.nativeElement.placeholder).toBe('Enter text...');
  });

  it('should disable input when disabled is true', () => {
    component.disabled = true;
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'));
    expect(input.nativeElement.disabled).toBe(true);
  });

  it('should apply invalid class when invalid is true', () => {
    component.invalid = true;
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'));
    expect(input.nativeElement.classList.contains('input-invalid')).toBe(true);
  });

  it('should display error message when provided', () => {
    component.invalid = true;
    component.errorMessage = 'This field is required';
    fixture.detectChanges();

    const errorElement = fixture.debugElement.query(By.css('.error-message'));
    expect(errorElement).toBeTruthy();
    expect(errorElement.nativeElement.textContent).toContain('This field is required');
  });

  it('should not display error message when invalid is false', () => {
    component.invalid = false;
    component.errorMessage = 'Error message';
    fixture.detectChanges();

    const errorElement = fixture.debugElement.query(By.css('.error-message'));
    expect(errorElement).toBeFalsy();
  });

  it('should set data-testid attribute', () => {
    component.testId = 'email-input';
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input'));
    expect(input.nativeElement.getAttribute('data-testid')).toBe('email-input');
  });

  it('should handle value changes', () => {
    const onChangeSpy = jest.fn();
    component.registerOnChange(onChangeSpy);

    component.value = 'test value';

    expect(onChangeSpy).toHaveBeenCalledWith('test value');
  });

  it('should write value via ControlValueAccessor', () => {
    component.writeValue('initial value');
    expect(component.value).toBe('initial value');
  });
});
