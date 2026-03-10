# Phase 2 深度架构重构实施计划

## 目标
实施架构重构方案 B，实现全局 Mock Server + Worker 级别隔离，彻底解决 E2E 测试在 CI 中的不稳定性。

## 实施阶段

### Phase 2.1: 全局 Mock Server 架构
- 创建 `global-setup.ts` 和 `global-teardown.ts`
- 改造 Mock Server 支持全局模式
- 修改 fixtures 使用全局 Mock Server

### Phase 2.2: Worker 级别 Electron 隔离
- 修改 fixtures 为 `scope: 'worker'`
- 实现文件级别的 Electron 实例复用
- 添加测试级别状态清理

### Phase 2.3: 动态端口分配
- 使用 `get-port` 库动态分配端口
- 配置 Playwright 支持多 workers
- 每个 worker 使用独立端口

### Phase 2.4: Electron 测试模式 API
- 在主进程中添加 `testMode` API
- 实现快速状态重置而不重启应用
- 添加测试专用的 IPC 通道

### Phase 2.5: 测试重试机制
- 配置 Playwright 自动重试
- 添加重试时的状态清理
- 标记 flaky 测试

### Phase 2.6: 验证和监控
- 本地完整测试
- CI 验证
- 性能监控

## 依赖安装
```bash
pnpm add -D get-port@^7.0.0
```

## 成功标准
1. CI 通过率 > 95%
2. 测试执行时间 < 150s（优化前 ~180s）
3. 无 flaky 测试
