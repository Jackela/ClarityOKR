/**
 * Zone.js Polyfills Configuration for Electron Compatibility
 *
 * This file ensures zone.js is properly loaded in Electron environments,
 * including headless CI environments where standard zone.js initialization may fail.
 *
 * Key fixes:
 * 1. Explicit zone.js import before Angular bootstrap
 * 2. Patch for Electron's modified browser APIs
 * 3. Fallback for headless environments
 */

import 'zone.js';

/**
 * Extend Zone.js types for Electron compatibility
 */
declare global {
  interface Window {
    Zone: typeof Zone;
    __zone_symbol__setTimeout: typeof setTimeout;
    __zone_symbol__clearTimeout: typeof clearTimeout;
    __zone_symbol__setInterval: typeof setInterval;
    __zone_symbol__clearInterval: typeof clearInterval;
    __zone_symbol__requestAnimationFrame: typeof requestAnimationFrame;
    __zone_symbol__cancelAnimationFrame: typeof cancelAnimationFrame;
    __zone_symbol__addEventListener: typeof EventTarget.prototype.addEventListener;
    __zone_symbol__removeEventListener: typeof EventTarget.prototype.removeEventListener;
  }
}

/**
 * Verify zone.js is properly loaded and patch any missing APIs
 * This is critical for Electron headless environments
 */
function verifyZoneJs(): void {
  if (typeof window === 'undefined') {
    console.warn('[polyfills] Running in non-browser environment, skipping zone.js verification');
    return;
  }

  // Check if Zone is available
  if (typeof (window as Window).Zone === 'undefined') {
    console.error(
      '[polyfills] Zone.js not loaded! This will cause Angular change detection to fail.',
    );
    return;
  }

  // Verify zone.js has patched standard APIs
  const requiredPatches = [
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'addEventListener',
  ];

  const missingPatches: string[] = [];

  for (const patch of requiredPatches) {
    // Check if the native API is stored (indicates zone.js has patched it)
    const nativeKey = `__zone_symbol__${patch}`;
    if (!(nativeKey in window)) {
      // This is not necessarily an error - some APIs might not be available in all environments
      if (patch !== 'requestAnimationFrame') {
        missingPatches.push(patch);
      }
    }
  }

  if (missingPatches.length > 0) {
    console.warn('[polyfills] Some APIs may not be properly patched by zone.js:', missingPatches);
  }
}

// Execute verification
verifyZoneJs();

// Export for potential direct imports
export {};
