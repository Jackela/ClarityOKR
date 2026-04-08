import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Performance Tests for ClarityOKR
 *
 * Measures critical user journey timings:
 * - Time to First Paint (TTFP)
 * - Clarification step transitions
 * - OKR generation time
 * - Edit mode switch time
 * - Sticky window open time
 *
 * Performance Budgets:
 * - TTFP: < 2 seconds
 * - Step transition: < 500ms
 * - OKR generation: < 5 seconds
 * - Edit mode switch: < 300ms
 * - Sticky window open: < 1 second
 */

// Performance budgets (in milliseconds)
const BUDGETS = {
  timeToFirstPaint: 2000,
  stepTransition: 500,
  okrGeneration: 5000,
  editModeSwitch: 300,
  stickyWindowOpen: 1000,
};

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.ELECTRON_START_URL || 'http://localhost:4200',
  iterations: 3, // Number of runs for averaging
  warmupRuns: 1, // Initial runs to warm up caches
};

/**
 * Measure Time to First Paint
 */
test('Time to First Paint', async ({ page }, testInfo: TestInfo) => {
  const measurements: number[] = [];

  for (let i = 0; i < TEST_CONFIG.warmupRuns + TEST_CONFIG.iterations; i++) {
    await page.goto(TEST_CONFIG.baseUrl);

    // Wait for the main content to be visible
    const startTime = Date.now();
    await page.waitForSelector('main, .app-shell, #main-content', { timeout: 10000 });
    const endTime = Date.now();

    const paintTime = endTime - startTime;

    // Skip warmup runs
    if (i >= TEST_CONFIG.warmupRuns) {
      measurements.push(paintTime);
    }
  }

  const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
  const maxTime = Math.max(...measurements);
  const minTime = Math.min(...measurements);

  // Attach results to test report
  testInfo.attach('TTFP Results', {
    body: JSON.stringify(
      {
        average: avgTime,
        min: minTime,
        max: maxTime,
        measurements,
        budget: BUDGETS.timeToFirstPaint,
        withinBudget: avgTime < BUDGETS.timeToFirstPaint,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  console.log(`TTFP: ${avgTime}ms (budget: ${BUDGETS.timeToFirstPaint}ms)`);
  expect(avgTime).toBeLessThan(BUDGETS.timeToFirstPaint);
});

/**
 * Measure clarification step transition time
 */
test('Clarification Step Transition', async ({ page }, testInfo: TestInfo) => {
  // Navigate to app
  await page.goto(TEST_CONFIG.baseUrl);

  // Enter intent and start clarification
  await page.fill('[data-testid="intent-input"]', 'Improve team productivity');
  await page.click('button[type="submit"]');

  // Wait for first question
  await page.waitForSelector('[data-testid="clarification-option"]', { timeout: 10000 });

  const measurements: number[] = [];

  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    // Click first option
    const option = await page.locator('[data-testid="clarification-option"]').first();

    const startTime = Date.now();
    await option.click();

    // Wait for either next question or completion
    await Promise.race([
      page.waitForSelector('[data-testid="clarification-generate"]', { timeout: 10000 }),
      page.waitForSelector('[data-testid="prompt-question"]', { timeout: 10000 }),
    ]);

    const endTime = Date.now();
    measurements.push(endTime - startTime);

    // Go back if not at end
    const backButton = page.locator('.back-button');
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(200);
    }
  }

  const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  testInfo.attach('Step Transition Results', {
    body: JSON.stringify(
      {
        average: avgTime,
        measurements,
        budget: BUDGETS.stepTransition,
        withinBudget: avgTime < BUDGETS.stepTransition,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  console.log(`Step Transition: ${avgTime}ms (budget: ${BUDGETS.stepTransition}ms)`);
  expect(avgTime).toBeLessThan(BUDGETS.stepTransition);
});

/**
 * Measure OKR generation time
 */
test('OKR Generation Time', async ({ page }, testInfo: TestInfo) => {
  // Navigate to app
  await page.goto(TEST_CONFIG.baseUrl);

  // Enter intent and start
  await page.fill('[data-testid="intent-input"]', 'Launch new product feature');
  await page.click('button[type="submit"]');

  // Answer questions until we can generate
  let canGenerate = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!canGenerate && attempts < maxAttempts) {
    attempts++;

    try {
      // Check if generate button is available
      const generateButton = page.locator('[data-testid="clarification-generate"]').first();
      canGenerate = await generateButton.isVisible().catch(() => false);

      if (!canGenerate) {
        // Answer current question
        const options = await page.locator('[data-testid="clarification-option"]').all();
        if (options.length > 0) {
          await options[0].click();
          await page.waitForTimeout(500);
        }
      }
    } catch {
      break;
    }
  }

  if (!canGenerate) {
    test.skip();
    return;
  }

  // Measure generation time
  const measurements: number[] = [];

  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    const generateButton = page.locator('[data-testid="clarification-generate"]').first();

    const startTime = Date.now();
    await generateButton.click();

    // Wait for OKR to appear
    await page.waitForSelector('[data-testid="sticky-objective"]', { timeout: 30000 });

    const endTime = Date.now();
    measurements.push(endTime - startTime);

    // Reset for next iteration if needed
    if (i < TEST_CONFIG.iterations - 1) {
      // Navigate back to start
      await page.goto(TEST_CONFIG.baseUrl);
      await page.fill('[data-testid="intent-input"]', 'Launch new product feature');
      await page.click('button[type="submit"]');

      // Quick path through questions
      for (let j = 0; j < attempts; j++) {
        const option = await page.locator('[data-testid="clarification-option"]').first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
          await page.waitForTimeout(200);
        }
      }
    }
  }

  const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  testInfo.attach('Generation Time Results', {
    body: JSON.stringify(
      {
        average: avgTime,
        measurements,
        budget: BUDGETS.okrGeneration,
        withinBudget: avgTime < BUDGETS.okrGeneration,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  console.log(`OKR Generation: ${avgTime}ms (budget: ${BUDGETS.okrGeneration}ms)`);
  expect(avgTime).toBeLessThan(BUDGETS.okrGeneration);
});

/**
 * Measure edit mode switch time
 */
test('Edit Mode Switch Time', async ({ page }, testInfo: TestInfo) => {
  // Navigate to app and generate an OKR first
  await page.goto(TEST_CONFIG.baseUrl);

  // Enter intent and start
  await page.fill('[data-testid="intent-input"]', 'Improve code quality');
  await page.click('button[type="submit"]');

  // Quick path through clarification
  for (let i = 0; i < 3; i++) {
    const option = await page.locator('[data-testid="clarification-option"]').first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(200);
    }
  }

  // Generate OKR
  const generateButton = await page.locator('[data-testid="clarification-generate"]').first();
  if (await generateButton.isVisible().catch(() => false)) {
    await generateButton.click();
    await page.waitForSelector('[data-testid="sticky-objective"]', { timeout: 30000 });
  }

  // Measure edit mode switch
  const measurements: number[] = [];

  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    // Find edit button
    const editButton = page.locator('button:has-text("编辑"), button:has-text("Edit")').first();

    if (!(await editButton.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await editButton.click();

    // Wait for edit mode UI
    await page.waitForSelector('[data-testid="okr-edit-mode"], input[type="text"]', {
      timeout: 5000,
    });

    const endTime = Date.now();
    measurements.push(endTime - startTime);

    // Switch back to view mode
    const cancelButton = page.locator('button:has-text("取消"), button:has-text("Cancel")').first();
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      await page.waitForTimeout(200);
    }
  }

  const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  testInfo.attach('Edit Mode Switch Results', {
    body: JSON.stringify(
      {
        average: avgTime,
        measurements,
        budget: BUDGETS.editModeSwitch,
        withinBudget: avgTime < BUDGETS.editModeSwitch,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  console.log(`Edit Mode Switch: ${avgTime}ms (budget: ${BUDGETS.editModeSwitch}ms)`);
  expect(avgTime).toBeLessThan(BUDGETS.editModeSwitch);
});

/**
 * Measure sticky window open time
 */
test('Sticky Window Open Time', async ({ page, context }, testInfo: TestInfo) => {
  // Navigate to app and generate an OKR
  await page.goto(TEST_CONFIG.baseUrl);

  // Enter intent and start
  await page.fill('[data-testid="intent-input"]', 'Complete project milestone');
  await page.click('button[type="submit"]');

  // Quick path through clarification
  for (let i = 0; i < 3; i++) {
    const option = await page.locator('[data-testid="clarification-option"]').first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(200);
    }
  }

  // Generate OKR
  const generateButton = await page.locator('[data-testid="clarification-generate"]').first();
  if (await generateButton.isVisible().catch(() => false)) {
    await generateButton.click();
    await page.waitForSelector('[data-testid="sticky-objective"]', { timeout: 30000 });
  }

  // Measure sticky window open
  const measurements: number[] = [];

  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    // Look for sticky window button
    const stickyButton = page
      .locator('button:has-text("Sticky"), [data-testid="sticky-reopen"]')
      .first();

    if (!(await stickyButton.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await stickyButton.click();

    // Wait for new window or popup
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }),
      stickyButton.click(),
    ]);

    await newPage.waitForLoadState('networkidle');

    const endTime = Date.now();
    measurements.push(endTime - startTime);

    // Close the sticky window
    await newPage.close();

    // Small delay between iterations
    await page.waitForTimeout(500);
  }

  const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  testInfo.attach('Sticky Window Open Results', {
    body: JSON.stringify(
      {
        average: avgTime,
        measurements,
        budget: BUDGETS.stickyWindowOpen,
        withinBudget: avgTime < BUDGETS.stickyWindowOpen,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  console.log(`Sticky Window Open: ${avgTime}ms (budget: ${BUDGETS.stickyWindowOpen}ms)`);
  expect(avgTime).toBeLessThan(BUDGETS.stickyWindowOpen);
});

/**
 * Baseline comparison test
 * Compares current metrics against stored baseline
 */
test('Performance Regression Check', async ({ page }, testInfo: TestInfo) => {
  // Load baseline if exists
  let baseline: Record<string, number> = {};
  try {
    const baselineData = execSync('cat tests/e2e/perf/baseline.json', { encoding: 'utf8' });
    baseline = JSON.parse(baselineData);
  } catch {
    console.log('No baseline found, creating new baseline');
  }

  // Run quick TTFP measurement
  await page.goto(TEST_CONFIG.baseUrl);
  const startTime = Date.now();
  await page.waitForSelector('main, .app-shell, #main-content', { timeout: 10000 });
  const currentTTFP = Date.now() - startTime;

  // Compare with baseline (allow 20% regression)
  if (baseline.ttfp) {
    const allowedRegression = baseline.ttfp * 1.2;
    const regression = ((currentTTFP - baseline.ttfp) / baseline.ttfp) * 100;

    testInfo.attach('Regression Analysis', {
      body: JSON.stringify(
        {
          baseline: baseline.ttfp,
          current: currentTTFP,
          regressionPercent: regression.toFixed(2),
          withinThreshold: currentTTFP <= allowedRegression,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    expect(currentTTFP).toBeLessThanOrEqual(allowedRegression);
  }

  // Save new baseline
  const newBaseline = {
    ...baseline,
    ttfp: currentTTFP,
    updatedAt: new Date().toISOString(),
  };

  testInfo.attach('New Baseline', {
    body: JSON.stringify(newBaseline, null, 2),
    contentType: 'application/json',
  });
});

/**
 * Memory usage test
 */
test('Memory Usage', async ({ page }, testInfo: TestInfo) => {
  await page.goto(TEST_CONFIG.baseUrl);

  // Get initial memory
  const initialMetrics = await page.evaluate(() => {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  });

  // Perform actions that might leak memory
  for (let i = 0; i < 5; i++) {
    await page.fill('[data-testid="intent-input"]', `Test intent ${i}`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);

    // Go back
    await page.goto(TEST_CONFIG.baseUrl);
  }

  // Force garbage collection if available
  await page.evaluate(() => {
    if ('gc' in window) {
      (window as any).gc();
    }
  });

  await page.waitForTimeout(1000);

  // Get final memory
  const finalMetrics = await page.evaluate(() => {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  });

  const memoryGrowth = finalMetrics - initialMetrics;
  const memoryGrowthMB = memoryGrowth / (1024 * 1024);

  testInfo.attach('Memory Usage Results', {
    body: JSON.stringify(
      {
        initialBytes: initialMetrics,
        finalBytes: finalMetrics,
        growthBytes: memoryGrowth,
        growthMB: memoryGrowthMB.toFixed(2),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  // Expect less than 50MB growth
  expect(memoryGrowthMB).toBeLessThan(50);
});
