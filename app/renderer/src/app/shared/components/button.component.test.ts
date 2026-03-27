import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  let fixture: ComponentFixture<ButtonComponent>;
  let component: ButtonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render button with default variant (primary)', () => {
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button'));
    expect(button.nativeElement.classList.contains('btn-primary')).toBe(true);
  });

  it('should apply variant class correctly', () => {
    component.variant = 'secondary';
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button'));
    expect(button.nativeElement.classList.contains('btn-secondary')).toBe(true);
  });

  it('should apply size class correctly', () => {
    component.size = 'lg';
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button'));
    expect(button.nativeElement.classList.contains('btn-lg')).toBe(true);
  });

  it('should disable button when disabled input is true', () => {
    component.disabled = true;
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button'));
    expect(button.nativeElement.disabled).toBe(true);
    expect(button.nativeElement.classList.contains('btn-disabled')).toBe(true);
  });

  it('should set data-testid attribute', () => {
    component.testId = 'submit-button';
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button'));
    expect(button.nativeElement.getAttribute('data-testid')).toBe('submit-button');
  });

  it('should emit onClick event when clicked', () => {
    const clickSpy = jest.fn();
    component.onClick.subscribe(clickSpy);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('button'));
    button.triggerEventHandler('click', {});

    expect(clickSpy).toHaveBeenCalled();
  });

  it('should not emit onClick when disabled', () => {
    component.disabled = true;
    const clickSpy = jest.fn();
    component.onClick.subscribe(clickSpy);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('button'));
    button.triggerEventHandler('click', {});

    expect(clickSpy).not.toHaveBeenCalled();
  });

  describe('variants', () => {
    const variants: Array<'primary' | 'secondary' | 'danger' | 'ghost'> = [
      'primary',
      'secondary',
      'danger',
      'ghost',
    ];

    variants.forEach((variant) => {
      it(`should render ${variant} variant correctly`, () => {
        component.variant = variant;
        fixture.detectChanges();
        const button = fixture.debugElement.query(By.css('button'));
        expect(button.nativeElement.classList.contains(`btn-${variant}`)).toBe(true);
      });
    });
  });

  describe('sizes', () => {
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

    sizes.forEach((size) => {
      it(`should render ${size} size correctly`, () => {
        component.size = size;
        fixture.detectChanges();
        const button = fixture.debugElement.query(By.css('button'));
        expect(button.nativeElement.classList.contains(`btn-${size}`)).toBe(true);
      });
    });
  });
});
