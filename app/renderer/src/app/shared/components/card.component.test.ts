import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render with default elevated variant', () => {
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.card'));
    expect(card.nativeElement.classList.contains('card--elevated')).toBe(true);
  });

  it('should apply variant class correctly', () => {
    component.variant = 'outlined';
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.card'));
    expect(card.nativeElement.classList.contains('card--outlined')).toBe(true);
  });

  it('should apply padding class correctly', () => {
    component.padding = 'sm';
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.card'));
    expect(card.nativeElement.classList.contains('card--padding-sm')).toBe(true);
  });

  it('should transclude content', () => {
    const testContent = 'Test card content';
    fixture.nativeElement.innerHTML = testContent;
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.card'));
    expect(card.nativeElement.textContent).toContain(testContent);
  });

  describe('variants', () => {
    const variants: Array<'default' | 'elevated' | 'outlined'> = [
      'default',
      'elevated',
      'outlined',
    ];

    variants.forEach((variant) => {
      it(`should render ${variant} variant correctly`, () => {
        component.variant = variant;
        fixture.detectChanges();
        const card = fixture.debugElement.query(By.css('.card'));
        expect(card.nativeElement.classList.contains(`card--${variant}`)).toBe(true);
      });
    });
  });

  describe('padding options', () => {
    const paddings: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

    paddings.forEach((padding) => {
      it(`should render ${padding} padding correctly`, () => {
        component.padding = padding;
        fixture.detectChanges();
        const card = fixture.debugElement.query(By.css('.card'));
        expect(card.nativeElement.classList.contains(`card--padding-${padding}`)).toBe(true);
      });
    });
  });
});
