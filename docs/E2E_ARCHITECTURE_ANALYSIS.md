# ClarityOKR E2E 测试架构深度分析报告

**分析日期**: 2026-03-09  
**分析范围**: tests/e2e/ 目录  
**分析目标**: 识别 E2E 测试在 CI 中失败的根因并提出重构方案

---

## 执行摘要

经过对 4 轮修复尝试后仍在 CI 中失败的 E2E 测试进行深度分析，发现了 **5 大类 14 个具体架构问题**。核心问题在于**测试隔离不足**和**竞态条件**导致的状态污染，而非测试逻辑本身的问题。

---

## 1. 架构问题清单

### 1.1 Mock Server 架构问题 🔴 Critical

| # | 问题 | 位置 | 严重程度 | 描述 |
|---|------|------|----------|------|
| 1.1.1 | 固定端口冲突风险 | `fixtures/index.ts:91` | Critical | CI 环境强制使用端口 7777，但测试并行时可能冲突 |
| 1.1.2 | 竞态条件 - setResponses | `simple-mock-server.ts:166-167` | Critical | `setResponses()` 重置 `callCounter` 和 `requestLog`，但异步请求可能仍在处理中 |
| 1.1.3 | 固定延迟导致超时 | `simple-mock-server.ts:58` | High | 2000ms 固定延迟在 CI 慢环境中可能导致超时 |
| 1.1.4 | 请求日志竞争 | `simple-mock-server.ts:49-54` | Medium | 多个并发请求同时修改 `requestLog` 数组 |
| 1.1.5 | 缺少连接清理 | `simple-mock-server.ts:178-187` | Medium | `server.stop()` 不等待活跃连接关闭 |

### 1.2 状态隔离问题 🔴 Critical

| # | 问题 | 位置 | 严重程度 | 描述 |
|---|------|------|----------|------|
| 1.2.1 | 清理顺序竞态 | `interview-flow.spec.ts:11` + `fixtures/index.ts:107-114` | Critical | `cleanupPersistenceFiles()` 在 `beforeEach` 中调用，但 Electron 启动时可能已读取旧数据 |
| 1.2.2 | 全局状态污染 | `build-check.ts:14` | High | `buildChecked` 是模块级全局变量，影响测试独立性 |
| 1.2.3 | 无 Electron 内部清理 | N/A | High | 没有通过 Electron API 清理 renderer 状态 |
| 1.2.4 | 子窗口残留 | `okr-sticky.page.ts` | Medium | Sticky 窗口可能在前一个测试中残留 |
| 1.2.5 | 环境变量污染 | `fixtures/index.ts:114` | Medium | `process.env` 在测试间共享 |

### 1.3 Electron 生命周期管理问题 🟠 High

| # | 问题 | 位置 | 严重程度 | 描述 |
|---|------|------|----------|------|
| 1.3.1 | 应用关闭不彻底 | `fixtures/index.ts:125-127` | High | `app.close()` 可能没有清理所有子进程 |
| 1.3.2 | 窗口事件监听泄漏 | `fixtures/index.ts:118-119` | Medium | stderr/stdout 监听没有移除 |
| 1.3.3 | 高资源开销 | `fixtures/index.ts:107` | Medium | 每个测试都启动新 Electron 实例 |

### 1.4 Playwright 配置问题 🟡 Medium

| # | 问题 | 位置 | 严重程度 | 描述 |
|---|------|------|----------|------|
| 1.4.1 | 单 worker 限制 | `playwright.config.ts:34` | Medium | `workers: 1` 限制了执行效率，但没有解决根本问题 |
| 1.4.2 | Retry 导致状态累积 | `playwright.config.ts:32` | Medium | retries=1 可能在失败测试后留下脏状态 |
| 1.4.3 | 超时掩盖问题 | `playwright.config.ts:30` | Low | 120s 超时可能掩盖响应性问题 |

### 1.5 测试设计问题 🟡 Medium

| # | 问题 | 位置 | 严重程度 | 描述 |
|---|------|------|----------|------|
| 1.5.1 | forceClick 绕过 UI 状态 | `clarification.page.ts:215-222` | Medium | 强制启用禁用按钮可能导致不一致行为 |
| 1.5.2 | 混合测试策略 | 多个文件 | Medium | Page Objects 和 native-dom helpers 混用 |
| 1.5.3 | 固定等待时间 | `boundary-cases.spec.ts:119` | Low | `waitForTimeout(300)` 应替换为事件驱动等待 |

---

## 2. 根因分析

### 2.1 竞态条件序列图

```
测试 A                    测试 B
  |                         |
  |── cleanupPersistence()  |
  |                         |
  |── launch Electron ──────┼── 读取 data/*.json (竞态!)
  |                         |
  |── setResponses()        |
  |                         |
  |── API 请求 ─────────────┼── 到达 Mock Server (延迟处理)
  |                         |
  |── stop server           |
  |                         |
  |── 下一个测试 ───────────┼── callCounter 被重置，但请求未处理完
```

### 2.2 状态污染路径

1. **持久化数据污染**: `data/clarification-session.json` 和 `data/okr-document.json`
2. **内存状态污染**: Electron main process 的单例服务
3. **Mock Server 状态污染**: `callCounter` 和 `responseConfig`
4. **环境状态污染**: `process.env` 和全局变量

---

## 3. 重构方案

### 3.1 方案 A: 保守修复（推荐用于快速稳定 CI）

**核心思路**: 最小改动，解决关键竞态条件

```typescript
// fixtures/index.ts - 修复清理顺序
export const test = base.extend<E2EFixtures>({
  electronApp: [
    async ({ mockServer }, use, testInfo) => {
      // 1. 先清理持久化文件（在启动 Electron 之前）
      await cleanupPersistenceFiles();
      
      // 2. 等待确保文件系统操作完成
      await new Promise(r => setTimeout(r, 100));
      
      // 3. 启动 Electron
      const app = await electron.launch({...});
      
      // 4. 等待应用初始化完成
      await app.evaluate(() => {
        // 信号：app 已准备好
        return true;
      });
      
      try {
        await use(app);
      } finally {
        // 5. 强制清理所有窗口
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows().forEach(w => w.close());
        });
        await app.close();
        // 6. 再次清理持久化文件
        await cleanupPersistenceFiles();
      }
    },
    { scope: 'test' },
  ],
});
```

### 3.2 方案 B: 架构重构（推荐用于长期维护）

**核心思路**: 全局单例 Mock Server + 每个测试文件重用 Electron

#### 3.2.1 全局 Mock Server

```typescript
// global-setup.ts
import { SimpleMockServer } from './helpers/simple-mock-server';

let globalMockServer: SimpleMockServer;

export default async function globalSetup() {
  ensureBuildArtifacts();
  
  // 启动全局 mock server
  globalMockServer = new SimpleMockServer();
  const port = await getPort();
  await globalMockServer.start(port);
  
  // 将端口写入环境变量供测试使用
  process.env.MOCK_SERVER_PORT = String(port);
  
  return async () => {
    await globalMockServer.stop();
  };
}

export { globalMockServer };
```

#### 3.2.2 改进的 Fixtures

```typescript
// fixtures/index.ts
export const test = base.extend<E2EFixtures>({
  // 每个测试文件启动一次 Electron
  electronApp: [
    async ({}, use, testInfo) => {
      // 文件级别重用
    },
    { scope: 'worker' },  // 改为 worker 级别
  ],
  
  // 每个测试使用相同应用但清理状态
  mainWindow: [
    async ({ electronApp }, use) => {
      // 清理状态而不是重启应用
      await electronApp.evaluate(() => {
        // 调用内部清理 API
        (global as any).testMode.resetState();
      });
      
      const window = await electronApp.firstWindow();
      await use(window);
    },
    { scope: 'test' },
  ],
});
```

#### 3.2.3 动态端口分配

```typescript
// playwright.config.ts
export default defineConfig({
  workers: process.env.CI ? 2 : undefined,  // CI 中允许 2 个 worker
  
  // 每个 worker 使用不同端口
  use: {
    mockServerPort: ['7777', '7778', '7779'],  // 轮询分配
  },
});
```

### 3.3 方案对比

| 方案 | 实施难度 | CI 稳定性 | 执行速度 | 维护成本 | 推荐度 |
|------|----------|-----------|----------|----------|--------|
| A: 保守修复 | 低 | 高 | 慢 | 低 | ⭐⭐⭐⭐⭐ |
| B: 架构重构 | 高 | 很高 | 快 | 中 | ⭐⭐⭐⭐ |

---

## 4. 实施计划

### Phase 1: 紧急修复（1-2 天）🔴

#### 任务 1.1: 修复清理顺序竞态
- **文件**: `tests/e2e/fixtures/index.ts`
- **改动**: 将 `cleanupPersistenceFiles()` 移到 `electron.launch()` 之前
- **预期效果**: 消除测试 A 清理数据时测试 B 读取数据的竞态

#### 任务 1.2: 添加双重清理
- **文件**: `tests/e2e/fixtures/index.ts`
- **改动**: 在 `finally` 块中添加 Electron 内部清理 + 文件清理
- **预期效果**: 确保每个测试后状态完全重置

#### 任务 1.3: 修复 Mock Server 竞态
- **文件**: `tests/e2e/helpers/simple-mock-server.ts`
- **改动**: 
  - 将 `setResponses` 改为原子操作
  - 添加 `await this.pendingRequests` 确保请求处理完成
- **预期效果**: 消除 `callCounter` 重置时的竞态

### Phase 2: 架构改进（3-5 天）🟠

#### 任务 2.1: 实现全局 Mock Server
- **文件**: `tests/e2e/global-setup.ts`, `tests/e2e/fixtures/index.ts`
- **改动**: 在 globalSetup 中启动 mock server，测试共享
- **预期效果**: 减少 2-3 秒的测试启动时间

#### 任务 2.2: 添加 Electron 测试模式 API
- **文件**: `app/main/...` (需要修改主进程)
- **改动**: 添加 `testMode.resetState()` 内部 API
- **预期效果**: 允许快速状态重置而不重启应用

#### 任务 2.3: 改进 Electron 关闭逻辑
- **文件**: `tests/e2e/fixtures/index.ts`
- **改动**: 在 `app.close()` 前关闭所有窗口，移除事件监听
- **预期效果**: 防止子窗口和进程残留

### Phase 3: 质量提升（2-3 天）🟡

#### 任务 3.1: 统一测试策略
- **文件**: 所有测试文件
- **改动**: 统一使用 Page Objects，移除 `forceClick`
- **预期效果**: 提高测试可维护性

#### 任务 3.2: 增强可观测性
- **文件**: `tests/e2e/helpers/debug-utils.ts` (新建)
- **改动**: 添加自动截图、日志收集功能
- **预期效果**: 加速问题定位

#### 任务 3.3: 移除固定等待
- **文件**: 测试文件中的 `waitForTimeout`
- **改动**: 替换为事件驱动等待（`waitForSelector`, `waitForFunction`）
- **预期效果**: 提高测试速度

### Phase 4: 并行化（可选）（3-5 天）🟢

#### 任务 4.1: 支持 Worker 级别隔离
- **文件**: `tests/e2e/playwright.config.ts`
- **改动**: 配置多个 workers，每个使用独立端口和数据目录
- **预期效果**: 测试执行时间减少 50%+

---

## 5. 代码示例

### 5.1 修复后的 Fixtures（Phase 1）

```typescript
// tests/e2e/fixtures/index.ts
export const test = base.extend<E2EFixtures>({
  mockServer: [
    async ({}, use) => {
      const server = new SimpleMockServer();
      const port = process.env.MOCK_SERVER_PORT 
        ? parseInt(process.env.MOCK_SERVER_PORT)
        : await getPort();
      await server.start(port);

      await use({
        url: server.getUrl(),
        setResponses: async (config: MockResponseConfig) => {
          // 等待所有待处理请求完成
          await server.waitForPendingRequests();
          server.setResponses(config);
        },
        getRequestLog: () => server.getRequestLog(),
      });

      await server.stop();
    },
    { scope: 'test' },
  ],

  electronApp: [
    async ({ mockServer }, use, testInfo) => {
      ensureBuildArtifacts();

      // 🔴 FIX: 在启动 Electron 之前清理
      await cleanupPersistenceFiles();
      
      // 添加短暂延迟确保文件系统操作完成
      if (process.env.CI) {
        await new Promise(r => setTimeout(r, 200));
      }

      const app = await electron.launch({
        args: ['.', ...extraElectronArgs()],
        cwd: ROOT,
        env: getElectronEnv(mockServer.url),
      });

      const childProcess = app.process();
      const stderrHandler = (data: Buffer) => process.stderr.write(data);
      const stdoutHandler = (data: Buffer) => process.stdout.write(data);
      childProcess.stderr?.on('data', stderrHandler);
      childProcess.stdout?.on('data', stdoutHandler);

      try {
        await use(app);
      } finally {
        // 🔴 FIX: 先关闭所有窗口
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows().forEach(w => {
            try { w.close(); } catch {}
          });
        }).catch(() => {});
        
        // 移除事件监听
        childProcess.stderr?.off('data', stderrHandler);
        childProcess.stdout?.off('data', stdoutHandler);
        
        // 关闭应用
        await app.close().catch((err) => {
          console.error('[fixture] Error closing Electron app:', err);
        });
        
        // 🔴 FIX: 再次清理持久化文件
        await cleanupPersistenceFiles();
      }
    },
    { scope: 'test' },
  ],
  // ...
});
```

### 5.2 改进的 Mock Server（Phase 1）

```typescript
// tests/e2e/helpers/simple-mock-server.ts
export class SimpleMockServer {
  private pendingRequests = 0;
  private pendingRequestsPromise: Promise<void> = Promise.resolve();
  private resolvePending!: () => void;

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.pendingRequests++;
    
    // 创建新的 pending promise
    if (this.pendingRequests === 1) {
      this.pendingRequestsPromise = new Promise(resolve => {
        this.resolvePending = resolve;
      });
    }

    try {
      // ... 原有处理逻辑 ...
      
      // CI 中使用更短的延迟
      const delay = process.env.CI ? 500 : 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // ... 响应处理 ...
    } finally {
      this.pendingRequests--;
      if (this.pendingRequests === 0) {
        this.resolvePending();
      }
    }
  }

  async waitForPendingRequests(timeout = 5000): Promise<void> {
    if (this.pendingRequests === 0) return;
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('waitForPendingRequests timeout')), timeout)
    );
    
    await Promise.race([this.pendingRequestsPromise, timeoutPromise]);
  }

  setResponses(config: MockResponseConfig): void {
    // 🔴 FIX: 不再在这里重置计数器，改为 waitForPendingRequests + 重置
    this.responseConfig = config;
    this.callCounter = 0;
    this.requestLog = [];
  }
}
```

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 修复引入新问题 | 中 | 高 | 先在本地完整运行测试套件 |
| CI 环境差异 | 中 | 高 | 使用 act 本地模拟 CI 环境 |
| 测试时间增加 | 低 | 中 | 双重清理可能增加 200-500ms/测试 |
| 维护复杂度上升 | 低 | 低 | 完善文档和代码注释 |

---

## 7. 监控指标

实施修复后，应监控以下指标：

1. **CI 通过率**: 目标 > 95%
2. **测试执行时间**: 当前 ~180s，目标 < 200s（保持）
3. **Flaky 测试数量**: 目标 0
4. **Mock Server 启动失败次数**: 目标 0
5. **Electron 残留进程数**: 目标 0

---

## 8. 附录

### 8.1 相关文件清单

| 文件 | 用途 | 改动需求 |
|------|------|----------|
| `tests/e2e/fixtures/index.ts` | 测试固件定义 | 高 |
| `tests/e2e/helpers/simple-mock-server.ts` | Mock Server 实现 | 高 |
| `tests/e2e/helpers/build-check.ts` | 构建检查工具 | 中 |
| `tests/e2e/playwright.config.ts` | Playwright 配置 | 中 |
| `tests/e2e/global-setup.ts` | 全局设置 | 中 |
| `tests/e2e/page-objects/*.ts` | 页面对象 | 低 |

### 8.2 参考资料

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Testing in CI Environments](https://playwright.dev/docs/ci)

---

**报告生成**: Kimi Code CLI  
**审核**: 待开发团队审核  
**下一步**: 根据本报告制定具体实施计划
