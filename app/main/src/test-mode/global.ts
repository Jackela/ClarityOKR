import { Logger } from '../core/logger.js';
import type { TestModeDependencies } from './types.js';
import { TestMode } from './test-mode-impl.js';

let globalTestMode: TestMode | null = null;

export function initializeTestMode(deps: TestModeDependencies): TestMode {
  globalTestMode = new TestMode(deps);

  if (process.env.NODE_ENV === 'test' || process.env.CI || process.env.E2E_TEST) {
    interface TestGlobal {
      testMode: TestMode;
    }
    (global as unknown as TestGlobal).testMode = globalTestMode;
    Logger.info('[testMode] Exposed to global.testMode for E2E access');
  }

  return globalTestMode;
}

export function getTestMode(): TestMode | null {
  return globalTestMode;
}

export function isTestModeEnabled(): boolean {
  return globalTestMode !== null;
}
