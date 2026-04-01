/**
 * I18n Service - Internationalization for ClarityOKR
 *
 * Provides translation functionality with support for:
 * - Multiple locales (zh-CN, en-US)
 * - Nested key lookup (e.g., 'clarification.wizard.title')
 * - Variable interpolation (e.g., 'Hello {name}')
 * - Locale fallback chain
 *
 * @usage
 * ```typescript
 * // In component
 * constructor(private i18n: I18nService) {}
 *
 * // Simple translation
 * const title = this.i18n.translate('clarification.wizard.title');
 *
 * // With interpolation
 * const message = this.i18n.translate('clarification.wizard.ready.description', { count: 5 });
 * ```
 *
 * @usage
 * ```html
 * <!-- In template with pipe -->
 * <h1>{{ 'clarification.wizard.title' | translate }}</h1>
 *
 * <!-- With interpolation params -->
 * <p>{{ 'clarification.wizard.ready.description' | translate:{ count: 5 } }}</p>
 * ```
 *
 * @module shared/services/i18n
 */

import { Injectable, signal, type Signal } from '@angular/core';
import type zhCNMessages from '../i18n/messages.zh-CN.json';

/**
 * Type definition for message keys based on zh-CN messages structure
 */
export type MessageKey = Paths<typeof zhCNMessages>;

/**
 * Utility type to get all nested paths from an object type
 */
type Paths<T> = T extends object
  ? {
      [K in keyof T]-?: K extends string | number
        ? T[K] extends object
          ? `${K}` | `${K}.${Paths<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Interpolation parameters for translation
 */
export type InterpolationParams = Record<string, string | number>;

/**
 * Available locale codes
 */
export type LocaleCode = 'zh-CN' | 'en-US';

/**
 * Service for internationalization and localization.
 *
 * This service manages the current locale and provides translation
 * functionality with support for nested keys and variable interpolation.
 *
 * @example
 * ```typescript
 * // Set locale
 * i18n.setLocale('zh-CN');
 *
 * // Get translation
 * const text = i18n.translate('common.save'); // '保存'
 *
 * // With interpolation
 * const hint = i18n.translate('clarification.wizard.keyboardHint', { count: 5 });
 * // '提示：按数字键 1-5 快速选择'
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class I18nService {
  /**
   * Current locale signal - reactive access to current locale
   */
  readonly currentLocale: Signal<LocaleCode>;

  /**
   * Private locale signal
   */
  private readonly _locale = signal<LocaleCode>('zh-CN');

  /**
   * Message cache for loaded locales
   */
  private messages: Map<LocaleCode, Record<string, unknown>> = new Map();

  /**
   * Fallback locale when translation is missing
   */
  private readonly fallbackLocale: LocaleCode = 'zh-CN';

  constructor() {
    this.currentLocale = this._locale.asReadonly();
    // Load default locale
    this.loadLocale('zh-CN');
  }

  /**
   * Set the current locale and load its messages.
   *
   * @param locale - The locale code to set (e.g., 'zh-CN', 'en-US')
   * @returns Promise that resolves when locale is loaded
   *
   * @example
   * ```typescript
   * await i18n.setLocale('en-US');
   * console.log(i18n.currentLocale()); // 'en-US'
   * ```
   */
  async setLocale(locale: LocaleCode): Promise<void> {
    await this.loadLocale(locale);
    this._locale.set(locale);
  }

  /**
   * Translate a key with optional interpolation parameters.
   *
   * Supports nested keys using dot notation (e.g., 'clarification.wizard.title').
   * Falls back to the key itself if translation is not found.
   *
   * @param key - The translation key (supports dot notation for nesting)
   * @param params - Optional interpolation parameters
   * @returns The translated string
   *
   * @example
   * ```typescript
   * // Simple translation
   * const save = i18n.translate('common.save'); // '保存'
   *
   * // Nested key
   * const title = i18n.translate('clarification.wizard.generateOkr'); // '生成 OKR'
   *
   * // With interpolation
   * const hint = i18n.translate('clarification.wizard.keyboardHint', { count: 5 });
   * // '提示：按数字键 1-5 快速选择'
   * ```
   */
  translate(key: string, params?: InterpolationParams): string {
    const messages = this.messages.get(this._locale()) || {};
    const value = this.getNestedValue(messages, key);

    if (typeof value === 'string') {
      return this.interpolate(value, params);
    }

    // Try fallback locale
    if (this._locale() !== this.fallbackLocale) {
      const fallbackMessages = this.messages.get(this.fallbackLocale) || {};
      const fallbackValue = this.getNestedValue(fallbackMessages, key);
      if (typeof fallbackValue === 'string') {
        return this.interpolate(fallbackValue, params);
      }
    }

    // Return key as fallback
    return key;
  }

  /**
   * Get a nested value from an object using dot notation.
   *
   * @param obj - The object to search
   * @param path - The dot-notation path (e.g., 'a.b.c')
   * @returns The value at the path, or undefined if not found
   *
   * @private
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  /**
   * Interpolate template strings with values.
   *
   * Replaces {key} placeholders with corresponding values from params.
   *
   * @param template - The template string with {placeholders}
   * @param params - The values to interpolate
   * @returns The interpolated string
   *
   * @private
   *
   * @example
   * ```typescript
   * const result = this.interpolate('Hello {name}!', { name: 'World' });
   * // 'Hello World!'
   * ```
   */
  private interpolate(template: string, params?: InterpolationParams): string {
    if (!params) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = params[key];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Load messages for a locale.
   *
   * @param locale - The locale to load
   * @returns Promise that resolves when messages are loaded
   *
   * @private
   */
  private async loadLocale(locale: LocaleCode): Promise<void> {
    if (this.messages.has(locale)) {
      return;
    }

    try {
      const module = await import(`../i18n/messages.${locale}.json`);
      this.messages.set(locale, module.default || module);
    } catch (error) {
      console.warn(`[I18nService] Failed to load locale: ${locale}`, error);
      // If loading fails, use empty object - fallback will be used
      this.messages.set(locale, {});
    }
  }

  /**
   * Get the current locale code.
   *
   * @returns The current locale code
   */
  getLocale(): LocaleCode {
    return this._locale();
  }

  /**
   * Check if a translation key exists.
   *
   * @param key - The key to check
   * @returns True if the key exists in current or fallback locale
   */
  hasTranslation(key: string): boolean {
    const messages = this.messages.get(this._locale()) || {};
    const value = this.getNestedValue(messages, key);

    if (typeof value === 'string') {
      return true;
    }

    if (this._locale() !== this.fallbackLocale) {
      const fallbackMessages = this.messages.get(this.fallbackLocale) || {};
      const fallbackValue = this.getNestedValue(fallbackMessages, key);
      return typeof fallbackValue === 'string';
    }

    return false;
  }
}
