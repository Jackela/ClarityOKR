// Known flaky tests configuration
// These tests may require additional retries due to timing or environmental factors

/**
 * List of known flaky test file patterns
 * Each pattern is matched against the test file path
 */
export const flakyTests = [
  // Debug tests - often use delays and timeouts that can vary
  'debug/dom-investigation.spec.ts',
  'debug/error-flow-debug.spec.ts',
  
  // Clarification boundary cases - complex state transitions
  'clarification/boundary-cases.spec.ts',
  
  // Tests with complex multi-step flows
  'clarification/interview-flow.spec.ts',
] as const;

/**
 * Check if a test file is marked as flaky
 * @param testFile - The test file path to check
 * @returns true if the test is marked as flaky
 */
export function isFlakyTest(testFile: string): boolean {
  return flakyTests.some(flaky => testFile.includes(flaky));
}

/**
 * Get the recommended retry count for a test file
 * @param testFile - The test file path
 * @returns Recommended number of retries
 */
export function getRetryCount(testFile: string): number {
  if (isFlakyTest(testFile)) {
    return 3; // Extra retries for known flaky tests
  }
  // Use CI default (2) or local default (0)
  return process.env.CI ? 2 : 0;
}

/**
 * Test categories with different retry strategies
 */
export const testCategories = {
  /** Critical tests that should never be flaky */
  critical: {
    retry: 0,
    timeout: 60000,
  },
  /** Standard tests with default retry configuration */
  standard: {
    retry: process.env.CI ? 2 : 0,
    timeout: 90000,
  },
  /** Known flaky tests with extra retries */
  flaky: {
    retry: 3,
    timeout: 120000,
  },
  /** Slow tests with extended timeout */
  slow: {
    retry: process.env.CI ? 2 : 0,
    timeout: 180000,
  },
} as const;
