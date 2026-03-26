// ============================================
// Angular Testing Environment Setup for Vitest
// ============================================

// 1. Import Zone.js core and testing extensions
import 'zone.js';
import 'zone.js/testing';

// 2. Import Angular compiler (required for JIT compilation)
import '@angular/compiler';

// 3. Import TestBed and platform utilities
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// 4. Initialize Angular testing environment
// This must be called before any tests run
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

// 5. Verify Zone.js is properly loaded
if (typeof (globalThis as { Zone?: unknown }).Zone === 'undefined') {
  throw new Error(
    'Zone.js is not loaded! Component tests require Zone.js to be properly initialized.',
  );
}
