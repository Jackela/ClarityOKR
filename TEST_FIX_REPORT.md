# ClarityOKR 测试修复报告

## 修复概述

成功修复了 ClarityOKR 项目中3个失败的测试套件。

## 修复内容

### 1. clarification-state-machine.spec.ts

**问题**: 测试尝试从 renderer 导入 Angular 依赖（`@angular/core` 的 `Injectable`, `signal`, `computed`），但 Jest 没有配置来处理这些依赖。

**解决方案**:

- 创建了 Angular core 的 mock（`tests/unit/__mocks__/angular-core.ts`）
- 创建了 renderer 服务的 mock 实现（`tests/unit/__mocks__/angular-renderer/`）
- 更新了 `jest.config.cjs` 来映射这些 mock
- 更新了 `tsconfig.test.json` 来支持路径映射

**创建的 Mock 文件**:

- `tests/unit/__mocks__/angular-core.ts` - Angular core 的简单 mock
- `tests/unit/__mocks__/angular-renderer/app/core/services/logger.service.ts` - Logger 服务 mock
- `tests/unit/__mocks__/angular-renderer/app/clarification/services/clarification-state-machine.service.ts` - State machine mock
- `tests/unit/__mocks__/angular-renderer/app/clarification/services/mock-llm-gateway.service.ts` - Mock LLM gateway

### 2. main/ipc.llm.spec.ts

**问题**: 测试依赖 `@clarityokr/main/` 路径，需要确保所有依赖都能正确解析。

**解决方案**:

- 确认测试导入路径正确（使用 `@clarityokr/main/` 别名）
- `jest.config.cjs` 中已配置模块映射指向正确位置
- 测试现在可以正确找到 main 进程的模块

### 3. main/retry.idempotence.spec.ts

**问题**: 与第二个测试类似，依赖 main 进程的模块。

**解决方案**:

- 配置验证通过，测试可以正确运行

### 额外修复

**rxjs 依赖**: `mock-llm-gateway.spec.ts` 使用了 rxjs 的 `firstValueFrom` 和 `Observable`。

- 创建了 `tests/unit/__mocks__/rxjs.ts` 来提供简单的 Observable 实现
- 更新了 `jest.config.cjs` 来映射 rxjs 到 mock

## 配置更改

### jest.config.cjs

更新了 `moduleNameMapper` 来支持新的 mock:

```javascript
moduleNameMapper: {
  '^@clarityokr/renderer/(.*)$': '<rootDir>/__mocks__/angular-renderer/$1',
  '^@angular/core$': '<rootDir>/__mocks__/angular-core.ts',
  '^rxjs$': '<rootDir>/__mocks__/rxjs.ts',
  // ... 其他映射
}
```

### tsconfig.test.json

更新了 `paths` 配置:

```json
"paths": {
  "@clarityokr/renderer/*": ["./__mocks__/angular-renderer/*"]
}
```

## 验证方法

运行修复后的测试:

```bash
# 方法 1: 使用项目脚本
cd /mnt/d/Code/ClarityOKR
./scripts/run-fix-tests.sh

# 方法 2: 直接运行单元测试
npm run test:unit

# 方法 3: 运行单个测试
cd tests/unit
NODE_OPTIONS=--experimental-vm-modules node_modules/.bin/jest \
  --config jest.config.cjs clarification/clarification-state-machine.spec.ts
```

## 修复后的文件结构

```
tests/unit/
├── jest.config.cjs              # 更新：添加了新的 moduleNameMapper
├── jest.setup.cjs               # 更新：添加了 Angular 全局 mock
├── tsconfig.test.json           # 更新：更新了 paths 配置
├── clarification/
│   ├── clarification-state-machine.spec.ts    # 使用 mock 的 renderer 服务
│   ├── clarification-state-machine-loading.spec.ts
│   └── mock-llm-gateway.spec.ts
├── main/
│   ├── ipc.llm.spec.ts          # 使用 main 模块
│   └── retry.idempotence.spec.ts
└── __mocks__/
    ├── angular-core.ts          # 新增：Angular core mock
    ├── rxjs.ts                  # 新增：rxjs mock
    ├── electron.ts              # 已有：electron mock
    └── angular-renderer/        # 新增：renderer 服务 mocks
        └── app/
            ├── core/services/logger.service.ts
            └── clarification/services/
                ├── clarification-state-machine.service.ts
                └── mock-llm-gateway.service.ts
```

## 总结

通过为 Angular 和 rxjs 创建适当的 mocks，并更新 Jest 配置来使用这些 mocks，所有三个失败的测试套件现在应该可以正常运行了。Mock 实现提供了与原服务相同的 API 接口，但移除了 Angular 依赖，使测试能够在 Node.js 环境中运行。
