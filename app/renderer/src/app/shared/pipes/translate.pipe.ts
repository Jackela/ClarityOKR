/**
 * Translate Pipe - Template translation for ClarityOKR
 *
 * Angular pipe for translating keys in templates.
 * Supports interpolation parameters and reactive locale changes.
 *
 * @usage
 * ```html
 * <!-- Simple translation -->
 * <h1>{{ 'clarification.wizard.title' | translate }}</h1>
 *
 * <!-- With interpolation -->
 * <p>{{ 'clarification.wizard.ready.description' | translate:{ count: questionCount } }}</p>
 *
 * <!-- In attribute -->
 * <button [attr.aria-label]="'common.close' | translate">×</button>
 * ```
 *
 * @module shared/pipes/translate
 */

import { Pipe, type PipeTransform } from '@angular/core';
import type { InterpolationParams } from '../services/i18n.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { I18nService } from '../services/i18n.service.js';

/**
 * Pipe for translating message keys in templates.
 *
 * This pipe uses the I18nService to translate keys into the current locale.
 * It is pure for performance but will re-execute when locale changes
 * due to the service's signal-based reactivity.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <span>{{ 'common.save' | translate }}</span>
 *
 * <!-- With parameters -->
 * <span>{{ 'okr.sticky.editMode.charCount' | translate:{ current: 50, max: 200 } }}</span>
 * ```
 */
@Pipe({
  name: 'translate',
  standalone: true,
  pure: true,
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  /**
   * Transform a translation key into the localized string.
   *
   * @param key - The translation key (supports dot notation)
   * @param params - Optional interpolation parameters
   * @returns The translated string
   */
  transform(key: string, params?: InterpolationParams): string {
    // Access the signal to ensure reactivity on locale changes
    this.i18n.currentLocale();
    return this.i18n.translate(key, params);
  }
}
