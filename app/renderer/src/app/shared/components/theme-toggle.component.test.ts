import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ThemeToggleComponent } from './theme-toggle.component';
import { ThemeService } from '../../core/services/theme.service';

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let component: ThemeToggleComponent;
  let themeService: ThemeService;

  const mockMatchMedia = (matches: boolean) =>
    jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(false),
    });

    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    component = fixture.componentInstance;
    themeService = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render three theme options', () => {
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css('.theme-toggle__option'));
    expect(buttons.length).toBe(3);
  });

  it('should have radiogroup role on container', () => {
    fixture.detectChanges();
    const container = fixture.debugElement.query(By.css('.theme-toggle'));
    expect(container.nativeElement.getAttribute('role')).toBe('radiogroup');
  });

  it('should mark active option based on current preference', () => {
    themeService.setPreference('dark');
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.theme-toggle__option'));
    const darkButton = buttons[1];
    expect(darkButton.nativeElement.getAttribute('aria-checked')).toBe('true');
    expect(darkButton.nativeElement.classList.contains('theme-toggle__option--active')).toBe(true);
  });

  it('should update preference when an option is clicked', () => {
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css('.theme-toggle__option'));

    buttons[1].triggerEventHandler('click', {});
    expect(themeService.userPreference()).toBe('dark');

    buttons[0].triggerEventHandler('click', {});
    expect(themeService.userPreference()).toBe('light');

    buttons[2].triggerEventHandler('click', {});
    expect(themeService.userPreference()).toBe('system');
  });
});
