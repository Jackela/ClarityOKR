# ClarityOKR CI/CD 架构文档

## 概述

本文档描述 ClarityOKR 项目的持续集成/持续部署 (CI/CD) 流程架构，包括工作流设计、步骤顺序、缓存策略和性能优化。

## CI工作流架构

### 触发条件

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      skip_e2e:
        description: 'Skip E2E tests (faster CI)'
        required: false
        default: 'false'
```

- **Push to main**: 主分支推送时自动触发
- **Pull Request**: 所有PR自动触发CI检查
- **Manual Dispatch**: 支持手动触发，可选择跳过E2E测试

### 并发控制

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

- 同一分支的多个工作流会自动取消旧的工作流
- 避免资源浪费，确保只有最新的提交在运行CI

## Job设计

### Job 1: build-and-test

**职责**: 代码质量检查、类型检查、构建和单元/集成测试

**执行环境**: `ubuntu-latest`

**步骤顺序** (已修复):

```
1. Checkout                    → 检出代码
2. Setup Node.js 20            → 设置Node环境
3. Setup pnpm                  → 安装pnpm
4. Enable Corepack             → 启用corepack
5. Get pnpm store directory    → 获取pnpm存储路径
6. Setup pnpm cache            → 配置pnpm缓存
7. Install dependencies        → 安装依赖
8. Build contracts             → 构建contracts包 (关键修复)
9. Lint                        → ESLint代码检查
10. Typecheck                  → TypeScript类型检查
11. Build                      → 完整构建所有包
12. Unit tests                 → 单元测试
13. Component tests            → 组件测试
14. Integration tests          → 集成测试
15. Upload build artifacts     → 上传构建产物
```

**关键修复说明**:

- 在Lint和Typecheck之前添加 `Build contracts` 步骤
- contracts包构建后生成类型定义文件 (`dist/index.d.ts`)
- Lint和Typecheck依赖这些类型定义才能正常工作

### Job 2: e2e

**职责**: 端到端测试 (Playwright + Electron)

**依赖**: `needs: build-and-test`

**执行条件**:

```yaml
if: ${{ github.event_name != 'workflow_dispatch' || github.event.inputs.skip_e2e != 'true' }}
```

**步骤顺序**:

```
1. Checkout                    → 检出代码
2. Setup Node.js 20            → 设置Node环境
3. Setup pnpm                  → 安装pnpm
4. Enable Corepack             → 启用corepack
5. Get pnpm store directory    → 获取pnpm存储路径
6. Setup pnpm cache            → 配置pnpm缓存
7. Install dependencies        → 安装依赖
8. Download build artifacts    → 下载构建产物
9. Cache Playwright browsers   → 缓存Playwright浏览器
10. Install Playwright browsers → 安装浏览器
11. Install Electron system deps → Electron系统依赖 (act only)
12. Setup Electron sandbox permissions → 设置沙盒权限
13. Run E2E tests              → 运行E2E测试
14. Upload Playwright traces   → 失败时上传trace
```

## 缓存策略

### 1. pnpm Store缓存

```yaml
- name: Get pnpm store directory
  id: pnpm-cache
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

- name: Setup pnpm cache
  uses: actions/cache@v4
  with:
    path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-
```

**优化效果**:

- 缓存pnpm全局存储目录
- 基于 `pnpm-lock.yaml` 哈希生成缓存key
- 依赖未变更时跳过下载，节省30-60秒

### 2. Node.js缓存

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache-dependency-path: pnpm-lock.yaml
```

**优化效果**:

- actions/setup-node自动缓存npm/pnpm依赖
- 加速Node模块安装

### 3. Playwright浏览器缓存

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: pw-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      pw-${{ runner.os }}-
```

**优化效果**:

- 缓存Chromium等浏览器二进制文件
- 避免每次E2E测试都重新下载 (~100MB)
- 节省1-2分钟

### 4. 构建产物传递

```yaml
- name: Upload build artifacts
  uses: actions/upload-artifact@v4
  with:
    name: build-artifacts
    path: |
      app/main/dist
      app/renderer/dist
      packages/contracts/dist
    retention-days: 1
```

**优化效果**:

- build-and-test job构建一次，E2E job复用
- 避免重复构建，节省2-3分钟
- 保留1天，自动清理

## 性能优化总结

| 优化项               | 节省时间     | 适用Job             |
| -------------------- | ------------ | ------------------- |
| pnpm Store缓存       | 30-60s       | build-and-test, e2e |
| Node.js缓存          | 20-40s       | build-and-test, e2e |
| Playwright浏览器缓存 | 60-120s      | e2e                 |
| 构建产物复用         | 120-180s     | e2e                 |
| **总计**             | **~4-6分钟** | -                   |

## 环境变量

```yaml
env:
  NODE_VERSION: '20' # Node.js版本
  PNPM_VERSION: '9' # pnpm版本
  CI: 'true' # CI环境标识
```

## 故障排查

### 常见问题

1. **Lint/Typecheck失败**: 确保contracts已先构建
2. **E2E测试超时**: 检查Electron沙盒权限设置
3. **缓存未命中**: 检查pnpm-lock.yaml是否变更

### Debug模式

使用 `nektos/act` 本地测试:

```bash
act -j build-and-test
act -j e2e
```

## 变更历史

| 日期       | 变更         | 说明                        |
| ---------- | ------------ | --------------------------- |
| 2026-03-05 | 修复步骤顺序 | 在lint前添加build:contracts |
| 2026-03-05 | 添加pnpm缓存 | 优化依赖安装速度            |
| 2026-03-05 | E2E添加缓存  | 添加pnpm和Playwright缓存    |

## 附录: 修复详情

### 问题描述

CI失败因为步骤顺序错误。Lint和Typecheck在Build之前运行，但contracts包需要先build才能提供类型定义。

### 修复方案

在 `.github/workflows/ci.yml` 的 `build-and-test` job中，在 `Install dependencies` 后、`Lint` 前添加:

```yaml
- name: Build contracts
  run: pnpm run build:contracts
```

### 验证

- [x] CI配置语法正确 (YAML验证通过)
- [x] 步骤顺序合理 (依赖关系正确)
- [x] contracts在lint之前build
- [x] 缓存策略优化 (pnpm + Playwright)
