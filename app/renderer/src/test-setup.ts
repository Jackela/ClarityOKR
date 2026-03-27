// ============================================
// Angular Testing Environment Setup for Vitest
// ============================================

// Import Zone.js - must be first
import 'zone.js';

// Import Angular compiler (required for JIT compilation)
import '@angular/compiler';

// Import TestBed and platform utilities
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// Initialize Angular testing environment
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
