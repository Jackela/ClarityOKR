/**
 * ARIA utilities for accessibility
 */

let idCounter = 0;

/**
 * Generate unique ID for ARIA attributes
 */
export const generateAriaId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

/**
 * Reset ID counter (useful for testing)
 */
export const resetAriaIdCounter = (): void => {
  idCounter = 0;
};

/**
 * Join class names, filtering out falsy values
 */
export const classNames = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ');

/**
 * Format percentage for ARIA values
 */
export const formatAriaPercent = (value: number, total: number): number =>
  Math.round((value / total) * 100);
