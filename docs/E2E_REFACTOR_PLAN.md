# ClarityOKR E2E 测试重构实施计划

## 快速决策矩阵

| 你的情况 | 推荐方案 | 预计时间 |
|---------|---------|---------|
| CI 完全阻塞，需要立即修复 | Phase 1 紧急修复 | 1-2 天 |
| CI 偶尔失败，可接受渐进改进 | Phase 1 + Phase 2 | 1 周 |
| 长期维护，追求最佳实践 | 完整实施 | 2-3 周 |

---

## Phase 1: 紧急修复（立即实施）

### 任务清单

- [ ] **1.1 修复清理顺序竞态** (`tests/e2e/fixtures/index.ts`)
  ```typescript
  // 在 electron.launch() 之前添加:
  await cleanupPersistenceFiles();
  if (process.env.CI) await new Promise(r => setTimeout(r, 200));
  ```

- [ ] **1.2 改进 Electron 关闭逻辑** (`tests/e2e/fixtures/index.ts`)
  ```typescript
  // 在 finally 块中:
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach(w => w.close());
  }).catch(() => {});
  await app.close();
  await cleanupPersistenceFiles(); // 双重清理
  ```

- [ ] **1.3 修复 Mock Server 竞态** (`tests/e2e/helpers/simple-mock-server.ts`)
  - 添加 `waitForPendingRequests()` 方法
  - CI 延迟改为 500ms

- [ ] **1.4 验证修复**
  ```bash
  cd /mnt/d/Code/ClarityOKR
  pnpm run test:e2e
  ```
  连续运行 3 次，全部通过即为成功。

---

## Phase 2: 架构改进（1 周内）

### 任务清单

- [ ] **2.1 实现全局 Mock Server**
  - 修改 `global-setup.ts` 启动全局 server
  - 修改 `fixtures/index.ts` 复用 server URL

- [ ] **2.2 添加 Electron 测试模式 API**
  - 在主进程中添加 `testMode.resetState()`
  - 暴露给测试使用

- [ ] **2.3 移除 forceClick 使用**
  - 统一使用 `page.click()` 等待按钮可用
  - 修复 Page Objects 中的强制点击

---

## Phase 3: 质量提升（2 周内）

### 任务清单

- [ ] **3.1 统一测试策略**
  - 移除 `native-dom` helpers 中的 `forceClick`
  - 统一使用 Page Objects

- [ ] **3.2 增强可观测性**
  - 添加自动截图机制
  - 收集 Electron 主进程日志

- [ ] **3.3 移除固定等待时间**
  - 搜索所有 `waitForTimeout`
  - 替换为事件驱动等待

---

## Phase 4: 并行化（可选）

### 任务清单

- [ ] **4.1 多 Worker 配置**
  - 配置 `workers: 2`
  - 为每个 worker 分配独立端口

- [ ] **4.2 数据目录隔离**
  - 每个 worker 使用独立的 `userData` 目录

---

## 风险监控检查点

| 检查点 | 通过标准 | 失败处理 |
|--------|---------|---------|
| Phase 1 验证 | 3/3 次 CI 通过 | 回滚并重新分析 |
| Phase 2 验证 | 5/5 次 CI 通过 | 检查全局 server 状态 |
| Phase 3 验证 |  flaky 测试 = 0 | 检查测试稳定性 |

---

## 成功指标

- [ ] CI 通过率 > 95%
- [ ] 无 flaky 测试
- [ ] 测试执行时间 < 200s
- [ ] 本地和 CI 行为一致

---

**开始实施**: 从 Phase 1 任务 1.1 开始  
**预计完成**: 根据选择的路径，1 天到 3 周不等
