import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SkeletonComponent } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;
  let component: SkeletonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render skeleton container', () => {
    fixture.detectChanges();
    const container = fixture.debugElement.query(By.css('.skeleton-container'));
    expect(container).toBeTruthy();
  });

  it('should have aria-busy attribute', () => {
    fixture.detectChanges();
    const container = fixture.debugElement.query(By.css('.skeleton-container'));
    expect(container.nativeElement.getAttribute('aria-busy')).toBe('true');
  });

  it('should render text skeleton by default', () => {
    fixture.detectChanges();
    const lines = fixture.debugElement.queryAll(By.css('.skeleton-line'));
    expect(lines.length).toBe(3); // Default 3 lines
  });

  it('should render correct number of lines', () => {
    component.type = 'text';
    component.lines = 5;
    fixture.detectChanges();

    const lines = fixture.debugElement.queryAll(By.css('.skeleton-line'));
    expect(lines.length).toBe(5);
  });

  it('should render circle skeleton', () => {
    component.type = 'circle';
    component.size = 50;
    fixture.detectChanges();

    const circle = fixture.debugElement.query(By.css('.skeleton-circle'));
    expect(circle).toBeTruthy();
    expect(circle.nativeElement.style.width).toBe('50px');
    expect(circle.nativeElement.style.height).toBe('50px');
  });

  it('should render card skeleton', () => {
    component.type = 'card';
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.skeleton-card'));
    expect(card).toBeTruthy();
  });

  it('should render options skeleton', () => {
    component.type = 'options';
    component.count = 4;
    fixture.detectChanges();

    const optionCards = fixture.debugElement.queryAll(By.css('.skeleton-option-card'));
    expect(optionCards.length).toBe(4);
  });

  it('should set aria-label correctly', () => {
    component.ariaLabel = 'Loading user profile';
    fixture.detectChanges();

    const container = fixture.debugElement.query(By.css('.skeleton-container'));
    expect(container.nativeElement.getAttribute('aria-label')).toBe('Loading user profile');
  });

  it('should apply last line width correctly', () => {
    component.type = 'text';
    component.lines = 2;
    component.lastLineWidth = 40;
    fixture.detectChanges();

    const lines = fixture.debugElement.queryAll(By.css('.skeleton-line'));
    expect(lines[1].nativeElement.style.width).toBe('40%');
  });

  describe('types', () => {
    const types: Array<'text' | 'card' | 'circle' | 'options' | 'custom'> = [
      'text',
      'card',
      'circle',
      'options',
      'custom',
    ];

    types.forEach((type) => {
      it(`should render ${type} type correctly`, () => {
        component.type = type;
        fixture.detectChanges();

        // Should not throw error for any type
        expect(() => fixture.detectChanges()).not.toThrow();
      });
    });
  });
});
