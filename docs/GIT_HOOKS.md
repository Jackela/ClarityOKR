# Git Hooks 强制检查指南

## ⚠️ 核心原则

1. **所有检查必须在本地通过**
2. **所有测试必须在本地运行（包括 E2E）**
3. **所有问题必须在本地修复**
4. **不随意触发 GA，使用 PR 统一验证**

## 快速开始

### 安装 Hooks（必须）

```bash
pnpm run setup-hooks
```

所有团队成员必须在 clone 仓库后立即执行！

## Pre-push Hook - 8 项完整检查

在每次 `git push` 时，hook 会强制运行以下 8 项检查：

### 检查列表

| # | 检查项 | 命令 | 失败处理 |
|---|--------|------|----------|
| 1 | Build Contracts | `pnpm run build:contracts` | 必须修复 |
| 2 | ESLint | `pnpm exec eslint --cache .` | 运行 `lint:fix` |
| 3 | Typecheck | `pnpm run typecheck` | 必须修复 |
| 4 | Build | `pnpm run build` | 必须修复 |
| 5 | Unit Tests | `pnpm run test:unit` | 必须修复 |
| 6 | Component Tests | `pnpm run test:component` | 必须修复 |
| 7 | Integration Tests | `pnpm run test:integration` | 必须修复 |
| 8 | E2E Tests | `pnpm run test:e2e:prepush` | 必须修复 |

### E2E 测试说明

- **Pre-push 版**: 只运行核心测试（`playwright.prepush.config.ts`）
- **快速配置**: 1 worker, 无重试, 60s 超时
- **智能触发**: 只有修改了 E2E 或主代码时才运行
- **完整测试**: 在 PR 的 GA 中运行完整 E2E

## 标准开发流程

```bash
# 1. 创建功能分支
git checkout -b feat/my-feature

# 2. 编写代码
# ... 修改文件 ...

# 3. 本地验证（可选但推荐）
pnpm run typecheck
pnpm run lint

# 4. 提交代码
git add .
git commit -m "feat: add new feature"

# 5. Push（触发完整 8 项检查）
git push origin feat/my-feature
#    ↑
#    ├── [1/8] Build Contracts
#    ├── [2/8] ESLint
#    ├── [3/8] Typecheck
#    ├── [4/8] Build
#    ├── [5/8] Unit tests
#    ├── [6/8] Component tests
#    ├── [7/8] Integration tests
#    ├── [8/8] E2E tests (如相关)
#    └── ✅ 全部通过 → 允许 push

# 6. 创建 Pull Request
#    PR 的 GA 会进行最终完整验证（包括完整 E2E）
```

## 问题修复指南

### 快速修复命令

```bash
# Lint 问题
pnpm run lint          # 查看错误
pnpm run lint:fix      # 自动修复
git add -A && git commit --amend --no-edit

# Typecheck 问题
pnpm run typecheck     # 查看错误
# 修复代码...
git add . && git commit --amend --no-edit

# 构建问题
pnpm run build         # 查看错误
# 修复代码...
git add . && git commit --amend --no-edit

# 测试问题
pnpm run test:unit     # 单元测试
pnpm run test:component # 组件测试
pnpm run test:integration # 集成测试
pnpm run test:e2e:prepush # E2E 快速版
```

### 常见修复流程

#### Lint 自动修复后

```bash
git diff                    # 查看修复
# 确认修复正确...
git add -A && git commit --amend --no-edit
git push origin feat/xxx
```

#### 测试失败

```bash
# 查看失败测试
pnpm run test:unit

# 修复代码
# ...

# 本地验证测试通过
pnpm run test:unit

# 重新提交
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

#### E2E 失败

```bash
# 本地运行 E2E（快速版）
pnpm run test:e2e:prepush

# 修复代码...

# 验证通过后再 push
```

## 命令参考

```bash
# 完整测试套件
pnpm run test:e2e:prepush    # E2E 快速版（pre-push）
pnpm run test:e2e            # E2E 完整版
pnpm run test:e2e:ci         # E2E CI 配置

# 代码质量
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm run build

# 各类测试
pnpm run test:unit
pnpm run test:component
pnpm run test:integration

# Hooks 管理
pnpm run setup-hooks         # 安装/更新 hooks
git push --no-verify         # 跳过 hooks（紧急）
```

## 工作流程图

```
本地开发
    ↓
编写代码
    ↓
本地验证（可选）
    ↓
git commit
    ↓
git push
    ↓
┌─────────────────────────┐
│ Pre-push Hook (8 项)    │
│ 全部必须在本地通过       │
└─────────────────────────┘
    ↓ (通过)
远程分支
    ↓
创建 PR
    ↓
┌─────────────────────────┐
│ PR GA (完整 CI + E2E)   │
│ 最终验证                │
└─────────────────────────┘
    ↓ (通过)
合并到 main
```

## 团队规则

### 必须遵守

1. **安装 hooks**
   ```bash
   pnpm run setup-hooks
   ```

2. **所有检查本地通过**
   - 不允许 push 有问题的代码
   - 不随意触发 GA

3. **本地修复所有问题**
   - Typecheck ✅
   - Lint ✅
   - Build ✅
   - 所有测试 ✅

4. **使用 PR 统一验证**
   - 创建 PR 后由 GA 进行最终验证
   - 不单独触发 GA

### 禁止事项

- ❌ 直接 push 到 main
- ❌ push 有类型错误的代码
- ❌ push 有 lint 错误的代码
- ❌ push 测试失败的代码
- ❌ 随意触发 GA 消耗资源
- ❌ 绕过 hooks 推送问题代码（除非紧急情况）

### 紧急情况

```bash
# ⚠️ 仅用于真正的紧急情况
git push --no-verify

# 事后必须：
# 1. 立即修复所有问题
# 2. 强制推送修复
# 3. 向团队说明
```

## 故障排除

### Hook 没有运行

```bash
# 检查并修复
ls -la .git/hooks/pre-push
chmod +x .git/hooks/pre-push
pnpm run setup-hooks
```

### Hook 太慢

- 使用 ESLint cache（已启用）
- E2E 只运行相关修改时触发
- 确保本地机器性能

### Windows 用户

使用 Git Bash 或 WSL：
```bash
# Git Bash
pnpm run setup-hooks
```

## 配置说明

### E2E Pre-push 配置

文件：`tests/e2e/playwright.prepush.config.ts`

- 只运行核心 E2E 测试
- 1 worker, 无重试
- 60s 超时（比 CI 更快）
- 关闭截图/trace（加速）

### CI vs Pre-push

| 检查 | Pre-push | CI |
|------|----------|-----|
| Build Contracts | ✅ | ✅ |
| Lint | ✅ | ✅ |
| Typecheck | ✅ | ✅ |
| Build | ✅ | ✅ |
| Unit | ✅ | ✅ |
| Component | ✅ | ✅ |
| Integration | ✅ | ✅ |
| E2E | ⚡ 快速版 | 🔥 完整版 |

## 更新记录

- **2026-03-11**: 添加完整 8 项检查，包括 E2E pre-push 快速版
