/**
 * CI 环境检测和适配
 */

export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI
  );
}

export function isGitHubActions(): boolean {
  return !!process.env.GITHUB_ACTIONS;
}

export function getCIInfo(): {
  isCI: boolean;
  platform: string;
  workerCount: number;
  recommendedTimeout: number;
} {
  const ci = isCI();

  if (!ci) {
    return {
      isCI: false,
      platform: process.platform,
      workerCount: 4, // 本地默认 4 个 worker
      recommendedTimeout: 30000,
    };
  }

  // GitHub Actions 特有配置
  if (isGitHubActions()) {
    return {
      isCI: true,
      platform: process.env.RUNNER_OS || 'unknown',
      workerCount: 1, // GitHub Actions 中保守使用 1 个 worker
      recommendedTimeout: 60000,
    };
  }

  return {
    isCI: true,
    platform: process.platform,
    workerCount: 1,
    recommendedTimeout: 60000,
  };
}

// 根据环境获取最佳配置 - 修复flaky测试，移除重试掩盖问题
export function getOptimizedConfig(): {
  workers: number | undefined;
  timeout: number;
  retries: number;
  trace: 'retain-on-failure' | 'on-first-retry' | 'on' | 'off';
} {
  const ci = isCI();

  // 任务18.6: 移除重试掩盖问题，任务18.7: 减少超时到合理值
  return {
    workers: ci ? 1 : undefined,
    timeout: ci ? 60000 : 30000, // 从120s降低到60s
    retries: 0, // 移除重试，强制修复根本问题
    trace: ci ? 'retain-on-failure' : 'on-first-retry',
  };
}
