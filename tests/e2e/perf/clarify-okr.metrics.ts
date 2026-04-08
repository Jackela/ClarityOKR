import { workerTest as test, expect } from '../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../fixtures';
import { ClarificationPage, OkrStickyPage, waitForStickyWindow } from '../page-objects';
import { waitForElement, forceClick, waitForStateChange } from '../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Performance Budgets & Thresholds
// ============================================================================

/**
 * Performance budgets define acceptable time thresholds for various operations.
 * These values are based on industry standards and user experience research:
 * - < 100ms: Instant
 * - < 300ms: Fast
 * - < 1000ms: Acceptable
 * - > 1000ms: Slow (needs optimization)
 */
export const PERFORMANCE_BUDGETS = {
  /** Time to First Paint - should be < 1 second for good UX */
  timeToFirstPaint: {
    budget: 1000,
    warning: 800,
    unit: 'ms',
    description: 'Time until app becomes visible',
  },
  /** Clarification step transition - should feel instant */
  clarificationStepTransition: {
    budget: 500,
    warning: 300,
    unit: 'ms',
    description: 'Time between selecting an option and seeing next question',
  },
  /** OKR Generation Time - includes LLM call */
  okrGenerationTime: {
    budget: 5000,
    warning: 3000,
    unit: 'ms',
    description: 'Time from clicking generate to showing results',
  },
  /** Edit Mode Switch - should feel instant */
  editModeSwitch: {
    budget: 300,
    warning: 200,
    unit: 'ms',
    description: 'Time to switch between view and edit modes',
  },
  /** Sticky Window Open - includes window creation */
  stickyWindowOpen: {
    budget: 1000,
    warning: 600,
    unit: 'ms',
    description: 'Time to open the sticky note window',
  },
} as const;

/** Budget categories for summary reporting */
type BudgetCategory = keyof typeof PERFORMANCE_BUDGETS;

// ============================================================================
// Performance Metrics Collection
// ============================================================================

/**
 * Single performance measurement result
 */
interface PerformanceMeasurement {
  /** Metric name */
  name: string;
  /** Measured duration in milliseconds */
  duration: number;
  /** Timestamp when measurement was taken */
  timestamp: number;
  /** Additional context/metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Collection of metrics for a test run
 */
interface PerformanceMetrics {
  /** Test name */
  testName: string;
  /** Test run timestamp */
  runTimestamp: string;
  /** Individual measurements */
  measurements: PerformanceMeasurement[];
  /** Summary statistics */
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warning: number;
  };
}

/**
 * Performance collector for accumulating metrics during a test
 */
class PerformanceCollector {
  private measurements: PerformanceMeasurement[] = [];
  private startTimes = new Map<string, number>();

  /**
   * Start timing a metric
   */
  start(name: string): void {
    this.startTimes.set(name, performance.now());
  }

  /**
   * End timing a metric and record the result
   */
  end(name: string, metadata?: Record<string, unknown>): number {
    const startTime = this.startTimes.get(name);
    if (startTime === undefined) {
      throw new Error(`Timer "${name}" was not started`);
    }

    const duration = performance.now() - startTime;
    this.measurements.push({
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    });
    this.startTimes.delete(name);
    return duration;
  }

  /**
   * Measure a function's execution time
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    this.start(name);
    try {
      const result = await fn();
      this.end(name, metadata);
      return result;
    } catch (error) {
      this.end(name, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Get all recorded measurements
   */
  getMeasurements(): PerformanceMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements = [];
    this.startTimes.clear();
  }
}

// ============================================================================
// Baseline Comparison
// ============================================================================

/**
 * Baseline data structure for historical comparison
 */
interface BaselineData {
  /** Baseline creation timestamp */
  createdAt: string;
  /** Baseline version/commit */
  version?: string;
  /** Average metrics by category */
  averages: Record<BudgetCategory, number>;
  /** Number of runs averaged */
  sampleSize: number;
}

/**
 * Baseline comparison result
 */
interface BaselineComparison {
  /** Metric category */
  category: BudgetCategory;
  /** Current value */
  current: number;
  /** Baseline value */
  baseline: number;
  /** Percentage change from baseline */
  percentChange: number;
  /** Whether the change is acceptable */
  acceptable: boolean;
}

const BASELINE_FILE = join(process.cwd(), 'test-results', 'performance-baseline.json');
const RESULTS_FILE = join(process.cwd(), 'test-results', 'performance-results.json');

/**
 * Load existing baseline data
 */
function loadBaseline(): BaselineData | null {
  if (!existsSync(BASELINE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as BaselineData;
  } catch {
    return null;
  }
}

/**
 * Save baseline data
 */
function saveBaseline(data: BaselineData): void {
  const dir = join(process.cwd(), 'test-results');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Compare current metrics against baseline
 */
function compareToBaseline(
  current: Record<BudgetCategory, number>,
  baseline: BaselineData | null,
  threshold = 20, // 20% regression threshold
): BaselineComparison[] {
  if (!baseline) {
    return Object.entries(current).map(([category, value]) => ({
      category: category as BudgetCategory,
      current: value,
      baseline: value,
      percentChange: 0,
      acceptable: true,
    }));
  }

  return Object.entries(current).map(([category, value]) => {
    const baselineValue = baseline.averages[category as BudgetCategory];
    const percentChange = ((value - baselineValue) / baselineValue) * 100;
    return {
      category: category as BudgetCategory,
      current: value,
      baseline: baselineValue,
      percentChange,
      acceptable: percentChange < threshold,
    };
  });
}

// ============================================================================
// Reporting
// ============================================================================

/**
 * Generate performance report
 */
function generateReport(metrics: PerformanceMetrics, comparisons: BaselineComparison[]): string {
  const lines: string[] = [];
  lines.push('\n╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║               PERFORMANCE TEST REPORT                            ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝\n');

  lines.push(`Test: ${metrics.testName}`);
  lines.push(`Run Date: ${metrics.runTimestamp}\n`);

  // Summary
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│ SUMMARY                                                         │');
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  lines.push(`│ Total Tests:  ${metrics.summary.totalTests.toString().padEnd(47)}│`);
  lines.push(`│ Passed:       ${metrics.summary.passed.toString().padEnd(47)}│`);
  lines.push(`│ Failed:       ${metrics.summary.failed.toString().padEnd(47)}│`);
  lines.push(`│ Warnings:     ${metrics.summary.warning.toString().padEnd(47)}│`);
  lines.push('└─────────────────────────────────────────────────────────────────┘\n');

  // Detailed metrics
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│ METRICS                                                         │');
  lines.push('├─────────────────────────────────────────────────────────────────┤');

  for (const m of metrics.measurements) {
    const budget = PERFORMANCE_BUDGETS[m.name as BudgetCategory];
    if (budget) {
      const status =
        m.duration > budget.budget ? 'FAIL' : m.duration > budget.warning ? 'WARN' : 'PASS';
      const statusIcon = status === 'PASS' ? '✓' : status === 'WARN' ? '⚠' : '✗';
      const durationStr = `${m.duration.toFixed(2)}${budget.unit}`;
      const budgetStr = `${budget.budget}${budget.unit}`;
      lines.push(
        `│ ${statusIcon} ${m.name.padEnd(30)} ${durationStr.padStart(10)} / ${budgetStr.padEnd(8)} ${status.padEnd(7)}│`,
      );
    }
  }

  lines.push('└─────────────────────────────────────────────────────────────────┘\n');

  // Baseline comparison
  if (comparisons.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────────┐');
    lines.push('│ BASELINE COMPARISON                                             │');
    lines.push('├─────────────────────────────────────────────────────────────────┤');

    for (const comp of comparisons) {
      const changeStr = `${comp.percentChange >= 0 ? '+' : ''}${comp.percentChange.toFixed(1)}%`;
      const status = comp.acceptable ? '✓' : '✗';
      lines.push(
        `│ ${status} ${comp.category.padEnd(30)} ${changeStr.padStart(10)} ${
          comp.acceptable ? 'OK' : 'REGRESSION'.padEnd(12)
        }│`,
      );
    }

    lines.push('└─────────────────────────────────────────────────────────────────┘\n');
  }

  return lines.join('\n');
}

/**
 * Save metrics to file for historical tracking
 */
function saveMetrics(metrics: PerformanceMetrics): void {
  const dir = join(process.cwd(), 'test-results');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let allMetrics: PerformanceMetrics[] = [];
  if (existsSync(RESULTS_FILE)) {
    try {
      allMetrics = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
    } catch {
      allMetrics = [];
    }
  }

  allMetrics.push(metrics);
  // Keep only last 50 runs
  if (allMetrics.length > 50) {
    allMetrics = allMetrics.slice(-50);
  }

  writeFileSync(RESULTS_FILE, JSON.stringify(allMetrics, null, 2));
}

// ============================================================================
// Mock Configurations
// ============================================================================

const getMockConfig = (): MockResponseConfig => ({
  nextQuestion: (callNumber) => {
    if (callNumber <= 2) {
      return {
        question: {
          id: `q${callNumber + 1}`,
          text: '请选择下一步细化方向',
          options: [
            { id: 'opt-a', label: '提高效率', value: 'efficiency' },
            { id: 'opt-b', label: '优化流程', value: 'process' },
          ],
        },
      };
    }
    return null;
  },
  draft: {
    draft: {
      objectives: [
        {
          id: 'obj-001',
          title: '提高团队开发效率',
          description: '通过优化流程和工具，提升团队整体产出',
          keyResults: [
            {
              id: 'kr-001',
              statement: '代码审查时间缩短至2天内',
              target: '2天',
              measurement: 'time',
            },
            {
              id: 'kr-002',
              statement: '自动化测试覆盖率提升至80%',
              target: '80%',
              measurement: 'percentage',
            },
            {
              id: 'kr-003',
              statement: '发布频率提升至每周2次',
              target: '2次/周',
              measurement: 'frequency',
            },
          ],
        },
      ],
    },
  },
});

// ============================================================================
// Test Setup
// ============================================================================

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Clarify OKR Performance Metrics', () => {
  test('Time to First Paint - app startup', async ({ mainWindow }) => {
    const collector = new PerformanceCollector();

    collector.start('timeToFirstPaint');

    // Navigate to the app
    await mainWindow.goto('about:blank');
    await mainWindow.goto(`file://${process.cwd()}/app/renderer/dist/index.html`);

    // Wait for the app to become visible (intent input is the first interactive element)
    await mainWindow.waitForSelector('[data-testid="intent-input"]', {
      state: 'visible',
      timeout: 10000,
    });

    const duration = collector.end('timeToFirstPaint');
    const budget = PERFORMANCE_BUDGETS.timeToFirstPaint;

    // Generate metrics
    const metrics: PerformanceMetrics = {
      testName: 'Time to First Paint',
      runTimestamp: new Date().toISOString(),
      measurements: collector.getMeasurements(),
      summary: {
        totalTests: 1,
        passed: duration <= budget.budget ? 1 : 0,
        failed: duration > budget.budget ? 1 : 0,
        warning: duration > budget.warning && duration <= budget.budget ? 1 : 0,
      },
    };

    // Compare with baseline
    const baseline = loadBaseline();
    const current = { timeToFirstPaint: duration } as Record<BudgetCategory, number>;
    const comparisons = compareToBaseline(current, baseline);

    // Report
    console.log(generateReport(metrics, comparisons));
    saveMetrics(metrics);

    // Assert
    expect(duration).toBeLessThanOrEqual(budget.budget);
  });

  test('Clarification Step Transition - option selection', async ({ mainWindow, mockServer }) => {
    const collector = new PerformanceCollector();

    mockServer.setResponses(getMockConfig());

    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();

    // Start clarification
    await clarification.startClarification('提高团队开发效率');
    await clarification.waitForQuestion();

    // Measure transition time for multiple selections
    const transitions: number[] = [];

    for (let i = 0; i < 3; i++) {
      await clarification.waitForOptions();
      const currentQuestion = await clarification.getCurrentQuestion();

      collector.start('clarificationStepTransition');

      await clarification.selectFirstOption();
      await clarification.waitForQuestionChange(currentQuestion);

      const duration = collector.end('clarificationStepTransition', { iteration: i });
      transitions.push(duration);
    }

    const avgDuration = transitions.reduce((a, b) => a + b, 0) / transitions.length;
    const budget = PERFORMANCE_BUDGETS.clarificationStepTransition;

    const metrics: PerformanceMetrics = {
      testName: 'Clarification Step Transition',
      runTimestamp: new Date().toISOString(),
      measurements: [
        ...collector.getMeasurements(),
        { name: 'avgStepTransition', duration: avgDuration, timestamp: Date.now() },
      ],
      summary: {
        totalTests: transitions.length,
        passed: transitions.filter((d) => d <= budget.budget).length,
        failed: transitions.filter((d) => d > budget.budget).length,
        warning: transitions.filter((d) => d > budget.warning && d <= budget.budget).length,
      },
    };

    const baseline = loadBaseline();
    const current = { clarificationStepTransition: avgDuration } as Record<BudgetCategory, number>;
    const comparisons = compareToBaseline(current, baseline);

    console.log(generateReport(metrics, comparisons));
    saveMetrics(metrics);

    expect(avgDuration).toBeLessThanOrEqual(budget.budget);
  });

  test('OKR Generation Time - from click to display', async ({ mainWindow, mockServer }) => {
    const collector = new PerformanceCollector();

    mockServer.setResponses(getMockConfig());

    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();

    // Complete clarification flow
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForQuestion();

    // Measure generation time
    collector.start('okrGenerationTime');

    await clarification.generateOKR();
    await clarification.waitForOkrSummary(30000);

    const duration = collector.end('okrGenerationTime');
    const budget = PERFORMANCE_BUDGETS.okrGenerationTime;

    const metrics: PerformanceMetrics = {
      testName: 'OKR Generation Time',
      runTimestamp: new Date().toISOString(),
      measurements: collector.getMeasurements(),
      summary: {
        totalTests: 1,
        passed: duration <= budget.budget ? 1 : 0,
        failed: duration > budget.budget ? 1 : 0,
        warning: duration > budget.warning && duration <= budget.budget ? 1 : 0,
      },
    };

    const baseline = loadBaseline();
    const current = { okrGenerationTime: duration } as Record<BudgetCategory, number>;
    const comparisons = compareToBaseline(current, baseline);

    console.log(generateReport(metrics, comparisons));
    saveMetrics(metrics);

    expect(duration).toBeLessThanOrEqual(budget.budget);
  });

  test('Edit Mode Switch - view to edit and back', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const collector = new PerformanceCollector();

    mockServer.setResponses(getMockConfig());

    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();

    // Complete flow and open sticky
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForOkrSummary(30000);
    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    const stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    // Measure edit mode switch (view -> edit)
    collector.start('editModeSwitch');
    await forceClick(stickyWindowPage, '[data-testid="edit-button"]');
    await waitForElement(stickyWindowPage, '[data-testid="save-button"]', { timeout: 5000 });
    const switchToEditDuration = collector.end('editModeSwitch', { direction: 'view-to-edit' });

    // Measure edit mode switch (edit -> view)
    collector.start('editModeSwitch');
    await forceClick(stickyWindowPage, '[data-testid="cancel-button"]');
    await waitForElement(stickyWindowPage, '[data-testid="edit-button"]', { timeout: 5000 });
    const switchToViewDuration = collector.end('editModeSwitch', { direction: 'edit-to-view' });

    const avgDuration = (switchToEditDuration + switchToViewDuration) / 2;
    const budget = PERFORMANCE_BUDGETS.editModeSwitch;

    const metrics: PerformanceMetrics = {
      testName: 'Edit Mode Switch',
      runTimestamp: new Date().toISOString(),
      measurements: [
        { name: 'switchToEdit', duration: switchToEditDuration, timestamp: Date.now() },
        { name: 'switchToView', duration: switchToViewDuration, timestamp: Date.now() },
        { name: 'editModeSwitch', duration: avgDuration, timestamp: Date.now() },
      ],
      summary: {
        totalTests: 2,
        passed: avgDuration <= budget.budget ? 2 : 0,
        failed: avgDuration > budget.budget ? 2 : 0,
        warning: avgDuration > budget.warning && avgDuration <= budget.budget ? 2 : 0,
      },
    };

    const baseline = loadBaseline();
    const current = { editModeSwitch: avgDuration } as Record<BudgetCategory, number>;
    const comparisons = compareToBaseline(current, baseline);

    console.log(generateReport(metrics, comparisons));
    saveMetrics(metrics);

    expect(avgDuration).toBeLessThanOrEqual(budget.budget);
  });

  test('Sticky Window Open - from click to visible', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const collector = new PerformanceCollector();

    mockServer.setResponses(getMockConfig());

    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();

    // Complete flow
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForOkrSummary(30000);

    // Measure sticky window open time
    collector.start('stickyWindowOpen');

    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');
    const stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    const duration = collector.end('stickyWindowOpen');
    const budget = PERFORMANCE_BUDGETS.stickyWindowOpen;

    const metrics: PerformanceMetrics = {
      testName: 'Sticky Window Open',
      runTimestamp: new Date().toISOString(),
      measurements: collector.getMeasurements(),
      summary: {
        totalTests: 1,
        passed: duration <= budget.budget ? 1 : 0,
        failed: duration > budget.budget ? 1 : 0,
        warning: duration > budget.warning && duration <= budget.budget ? 1 : 0,
      },
    };

    const baseline = loadBaseline();
    const current = { stickyWindowOpen: duration } as Record<BudgetCategory, number>;
    const comparisons = compareToBaseline(current, baseline);

    console.log(generateReport(metrics, comparisons));
    saveMetrics(metrics);

    expect(duration).toBeLessThanOrEqual(budget.budget);
  });
});

// ============================================================================
// Baseline Management Test
// ============================================================================

test.describe('Performance Baseline Management', () => {
  test('update baseline from current metrics', async ({ mainWindow, mockServer }) => {
    const collector = new PerformanceCollector();

    mockServer.setResponses(getMockConfig());

    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();

    // Collect samples for all metrics
    const samples: Record<BudgetCategory, number[]> = {
      timeToFirstPaint: [],
      clarificationStepTransition: [],
      okrGenerationTime: [],
      editModeSwitch: [],
      stickyWindowOpen: [],
    };

    // Sample: Time to First Paint
    for (let i = 0; i < 3; i++) {
      collector.start('timeToFirstPaint');
      await mainWindow.goto('about:blank');
      await mainWindow.goto(`file://${process.cwd()}/app/renderer/dist/index.html`);
      await mainWindow.waitForSelector('[data-testid="intent-input"]', {
        state: 'visible',
        timeout: 10000,
      });
      samples.timeToFirstPaint.push(collector.end('timeToFirstPaint', { sample: i }));
    }

    // Sample: Clarification Step Transition
    await mainWindow.goto(`file://${process.cwd()}/app/renderer/dist/index.html`);
    await clarification.waitForReady();
    await clarification.startClarification('提高团队开发效率');
    await clarification.waitForQuestion();

    for (let i = 0; i < 3; i++) {
      await clarification.waitForOptions();
      const currentQuestion = await clarification.getCurrentQuestion();
      collector.start('clarificationStepTransition');
      await clarification.selectFirstOption();
      await clarification.waitForQuestionChange(currentQuestion);
      samples.clarificationStepTransition.push(
        collector.end('clarificationStepTransition', { sample: i }),
      );
    }

    // Calculate averages
    const averages = Object.entries(samples).reduce(
      (acc, [key, values]) => {
        acc[key as BudgetCategory] = values.reduce((a, b) => a + b, 0) / values.length;
        return acc;
      },
      {} as Record<BudgetCategory, number>,
    );

    // Save new baseline
    const baseline: BaselineData = {
      createdAt: new Date().toISOString(),
      version: process.env.GIT_COMMIT || 'unknown',
      averages,
      sampleSize: 3,
    };

    saveBaseline(baseline);

    console.log('\n✓ Baseline updated successfully:');
    console.log(JSON.stringify(averages, null, 2));

    expect(existsSync(BASELINE_FILE)).toBe(true);
  });
});

// ============================================================================
// Re-export utilities for external use
// ============================================================================

export { PerformanceCollector, loadBaseline, saveBaseline, compareToBaseline, generateReport };
