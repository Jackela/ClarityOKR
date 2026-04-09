/**
 * Xvfb 配置和检测
 * 用于 CI 环境中的虚拟显示
 */

import type { ChildProcess } from 'child_process';
import { spawn, execSync } from 'child_process';

let xvfbProcess: ChildProcess | null = null;

export interface XvfbConfig {
  displayNum: number;
  width: number;
  height: number;
  depth: number;
}

export function getXvfbConfig(): XvfbConfig {
  return {
    displayNum: 99, // :99
    width: 1280,
    height: 720,
    depth: 24,
  };
}

export async function startXvfb(): Promise<string | null> {
  // 如果 DISPLAY 已设置，说明 Xvfb 已在运行
  if (process.env.DISPLAY) {
    console.log(`[Xvfb] Using existing DISPLAY=${process.env.DISPLAY}`);
    return process.env.DISPLAY;
  }

  const config = getXvfbConfig();
  const display = `:${config.displayNum}`;

  try {
    xvfbProcess = spawn(
      'Xvfb',
      [
        display,
        '-screen',
        '0',
        `${config.width}x${config.height}x${config.depth}`,
        '-ac', // 禁用访问控制
        '+extension',
        'RANDR',
        '+extension',
        'GLX',
        '-noreset',
        '-nolisten',
        'tcp',
      ],
      {
        detached: true,
        stdio: 'ignore',
      },
    );

    // 等待 Xvfb 启动
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Xvfb start timeout'));
      }, 5000);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      xvfbProcess!.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      // 简单等待，实际应该检查 X 是否可用
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 1000);
    });

    process.env.DISPLAY = display;
    console.log(`[Xvfb] Started on ${display}`);

    return display;
  } catch (e) {
    console.error('[Xvfb] Failed to start:', e);
    return null;
  }
}

export async function stopXvfb(): Promise<void> {
  if (xvfbProcess) {
    xvfbProcess.kill();
    xvfbProcess = null;
    console.log('[Xvfb] Stopped');
  }
}

// 检查 Xvfb 是否可用
export function isXvfbAvailable(): boolean {
  try {
    // 简单检查 Xvfb 命令是否存在
    execSync('which Xvfb', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
