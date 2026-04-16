import { computed, Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Manages the application's visual theme (light / dark / system).
 *
 * - Reads system preference via matchMedia
 * - Reads persisted user choice from localStorage
 * - Syncs active theme to <html data-theme> for CSS selectors
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'clarityokr-theme';
  private readonly systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  readonly userPreference = signal<ThemePreference>(this.loadPreference());
  private readonly systemPreference = signal<boolean>(this.systemDark.matches);

  readonly resolvedTheme = computed(() => {
    const pref = this.userPreference();
    if (pref !== 'system') return pref;
    return this.systemPreference() ? 'dark' : 'light';
  });

  constructor() {
    // Apply initial resolved theme immediately to avoid flash
    this.applyTheme(this.resolvedTheme());

    // Listen to OS-level changes when in system mode
    this.systemDark.addEventListener('change', (event) => {
      this.systemPreference.set(event.matches);
      this.applyTheme(this.resolvedTheme());
    });
  }

  setPreference(preference: ThemePreference): void {
    this.userPreference.set(preference);
    this.applyTheme(this.resolvedTheme());
    try {
      localStorage.setItem(this.STORAGE_KEY, preference);
    } catch {
      // localStorage may be unavailable in some Electron contexts
    }
  }

  toggle(): void {
    const current = this.resolvedTheme();
    this.setPreference(current === 'dark' ? 'light' : 'dark');
  }

  private loadPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // localStorage may be unavailable in some Electron contexts
    }
    return 'system';
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }
}
