/**
 * Shared utility functions for animations
 */

/**
 * Easing function: ease-out cubic
 */
export const easeOut = (t: number): number => t * (2 - t);

/**
 * Easing function: ease-in-out cubic
 */
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/**
 * Easing function: bounce effect
 */
export const easeBounce = (t: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

/**
 * Clamp value between min and max
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Linear interpolation between two values
 */
export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * clamp(t, 0, 1);
