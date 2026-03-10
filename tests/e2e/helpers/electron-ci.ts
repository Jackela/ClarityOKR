/**
 * CI 环境专用的 Electron 配置
 */

export interface ElectronCIConfig {
  args: string[];
  env: Record<string, string>;
}

export function getElectronCIConfig(): ElectronCIConfig {
  const isCI = !!process.env.CI;

  // 基础参数（适用于所有环境）
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];

  // CI 环境特有参数
  if (isCI) {
    args.push(
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // 在某些 CI 环境中需要
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
    );
  }

  const env: Record<string, string> = {
    ELECTRON_DISABLE_SANDBOX: '1',
  };

  if (isCI) {
    env.ELECTRON_ENABLE_LOGGING = '1';
    env.ELECTRON_ENABLE_STACK_DUMPING = '1';
  }

  return { args, env };
}

// 获取优化的启动选项
export function getElectronLaunchOptions() {
  const ci = getElectronCIConfig();

  return {
    args: ci.args,
    env: {
      ...process.env,
      ...ci.env,
    },
  };
}
