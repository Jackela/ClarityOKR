# E2E测试最佳实践

> 任务18.9: 文档化E2E最佳实践

## 核心原则

### 1. 确定性等待 > 固定超时 (任务18.2)

**❌ 避免使用固定超时**

```typescript
await page.waitForTimeout(300); // 不稳定，可能导致flaky测试
```

**✅ 使用确定性等待**

```typescript
// 等待元素出现
await waitForElement(page, '[data-testid="result"]', { timeout: 10000 });

// 等待文本出现
await waitForText(page, '[data-testid="status"]', '完成', 10000);

// 等待状态转换
await waitForStateChange(page, {
  from: '[data-testid="loading"]',
  to: '[data-testid="success"]',
  timeout: 15000,
});
```

### 2. 测试隔离 (任务18.4)

每个测试必须使用干净的初始状态：

```typescript
test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});
```

### 3. 合理的超时值 (任务18.7)

```typescript
// playwright.config.ts
export const TIMEOUTS = {
  immediate: 500, // 极快操作
  fast: 8000, // 快速操作（如按钮点击）
  standard: 15000, // 标准操作
  slow: 30000, // 慢操作（如加载指示器）
  verySlow: 60000, // 极慢操作（如应用启动）
  maximum: 60000, // 最大超时（之前120s太长了）
};
```

### 4. 零重试策略 (任务18.6)

```typescript
// 重试掩盖真正的问题，必须移除
retries: 0, // ✅ 强制修复根本问题
```

## 等待工具库

使用 `tests/e2e/helpers/native-dom.ts` 中的工具：

| 函数                     | 用途         | 示例                                                   |
| ------------------------ | ------------ | ------------------------------------------------------ |
| `waitForElement`         | 等待元素出现 | `waitForElement(page, selector, { timeout: 10000 })`   |
| `waitForText`            | 等待文本出现 | `waitForText(page, selector, '预期文本', 10000)`       |
| `waitForStateChange`     | 等待状态转换 | `waitForStateChange(page, { from, to, timeout })`      |
| `waitForLoadingComplete` | 等待加载完成 | `waitForLoadingComplete(page, { maxWaitTime: 20000 })` |
| `waitForElementGone`     | 等待元素消失 | `waitForElementGone(page, selector, timeout)`          |

## 常见模式

### 表单提交流程

```typescript
// 1. 等待输入元素
await waitForElement(page, '[data-testid="input"]', { timeout: 10000 });

// 2. 填写表单
await page.fill('[data-testid="input"]', '测试数据');

// 3. 点击提交
await page.click('[data-testid="submit"]');

// 4. 等待结果（不使用固定超时）
await waitForStateChange(page, {
  from: '[data-testid="submitting"]',
  to: '[data-testid="success"]',
  timeout: 15000,
});
```

### 多次交互序列

```typescript
// ❌ 不要这样做
for (let i = 0; i < 5; i++) {
  await page.click('[data-testid="button"]');
  await page.waitForTimeout(300); // 不稳定！
}

// ✅ 正确做法
for (let i = 0; i < 5; i++) {
  await waitForElement(page, '[data-testid="button"]:not([disabled])', { timeout: 10000 });
  await page.click('[data-testid="button"]');
  // 等待交互后的UI更新
  await page.waitForFunction(() => !document.querySelector('[data-testid="button"]:active'), {
    timeout: 5000,
  });
}
```

## 调试技巧

### 启用详细日志

```bash
DEBUG=pw:api npm run test:e2e
```

### 使用Playwright UI模式

```bash
npx playwright test --ui
```

### 慢动作模式

```typescript
// playwright.config.ts
use: {
  launchOptions: {
    slowMo: 100, // 每个操作延迟100ms
  },
}
```

## CI环境优化

```typescript
// helpers/ci-env.ts
export function getOptimizedConfig() {
  const ci = isCI();

  return {
    workers: ci ? 1 : undefined, // CI中使用1个worker避免资源竞争
    timeout: ci ? 60000 : 30000, // 合理超时
    retries: 0, // 零重试
    trace: ci ? 'retain-on-failure' : 'on-first-retry',
  };
}
```

## 验证清单

- [ ] 没有使用 `waitForTimeout()`
- [ ] 每个测试有独立的初始状态
- [ ] 使用适当的超时值（不超过60s）
- [ ] 重试次数设置为0
- [ ] 使用确定性等待函数
- [ ] 测试能够在连续运行10次时全部通过
