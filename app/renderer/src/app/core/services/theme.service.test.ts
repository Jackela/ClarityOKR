import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let html: HTMLElement;

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

  beforeEach(() => {
    localStorage.clear();
    html = document.documentElement;
    html.removeAttribute('data-theme');
    html.style.colorScheme = '';

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(false),
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    html.removeAttribute('data-theme');
    html.style.colorScheme = '';
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to system preference when no localStorage value exists', () => {
    expect(service.userPreference()).toBe('system');
  });

  it('should read stored preference from localStorage', () => {
    localStorage.setItem('clarityokr-theme', 'dark');
    // Create a fresh instance directly to read localStorage on construction
    const freshService = new ThemeService();
    expect(freshService.userPreference()).toBe('dark');
  });

  it('should sync resolved theme to data-theme attribute', () => {
    service.setPreference('dark');
    expect(html.dataset.theme).toBe('dark');
  });

  it('should sync color-scheme style', () => {
    service.setPreference('light');
    expect(html.style.colorScheme).toBe('light');
  });

  it('should persist preference to localStorage', () => {
    service.setPreference('dark');
    expect(localStorage.getItem('clarityokr-theme')).toBe('dark');
  });

  it('should toggle between light and dark', () => {
    service.setPreference('light');
    service.toggle();
    expect(service.userPreference()).toBe('dark');
    expect(html.dataset.theme).toBe('dark');

    service.toggle();
    expect(service.userPreference()).toBe('light');
    expect(html.dataset.theme).toBe('light');
  });

  it('should resolve system preference based on matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(true),
    });

    const darkService = new ThemeService();
    darkService.setPreference('system');
    expect(darkService.resolvedTheme()).toBe('dark');
    expect(html.dataset.theme).toBe('dark');
  });
});
