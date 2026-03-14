# Git Hooks 强制检查指南

## ⚠️ 核心原则

**所有 CI 检查必须在本地通过，包括完整的 E2E 测试！**

不允许 push 任何有问题的代码到远程。

## 快速开始

### 安装 Hooks（必须）

```bash
pnpm run setup-hooks
```

所有团队成员必须执行！

## Pre-push Hook - 全部 8 项 CI 检查

在每次 `git push` 时，hook 会强制运行**全部 8 项** CI 检查：

### 完整检查列表

| # | 检查项 | CI 命令 | 说明 |
|---|--------|---------|------|
| 1 | **Build Contracts** | `pnpm run build:contracts` | 构建 contracts 模块 |
| 2 | **ESLint** | `pnpm run lint` | 代码规范检查 |
| 3 | **Typecheck** | `pnpm run typecheck` | TypeScript 类型检查 |
| 4 | **Build** | `pnpm run build` | 完整构建（main + renderer）|
| 5 | **Unit Tests** | `pnpm run test:unit` | 单元测试 |
| 6 | **Component Tests** | `pnpm run test:component` | Angular 组件测试 |
| 7 | **Integration Tests** | `pnpm run test:integration` | 集成测试 |
| 8 | **E2E Tests** | `pnpm run test:e2e` | **完整的 E2E 测试** |

### 重要说明

- **没有"主要"或"次要"之分** - 所有 8 项都是必须通过的
- **E2E 是完整的** - 不是简化版，与 CI 中运行的完全相同
- **任何一项失败都会阻止 push** - 必须全部修复

## 标准开发流程

```bash
# 1. 创建功能分支
git checkout -b feat/my-feature

# 2. 编写代码
# ... 修改文件 ...

# 3. 本地开发时运行（可选但推荐）
pnpm run typecheck
pnpm run lint

# 4. 提交代码
git add .
git commit -m "feat: add new feature"

# 5. Push（触发全部 8 项 CI 检查）
git push origin feat/my-feature
#    ↑
#    ├── [1/8] Build Contracts
#    ├── [2/8] ESLint
#    ├── [3/8] Typecheck
#    ├── [4/8] Build
#    ├── [5/8] Unit Tests
#    ├── [6/8] Component Tests
#    ├── [7/8] Integration Tests
#    ├── [8/8] E2E Tests（完整版）← 不是简化版！
#    └── ✅ 全部通过 → 允许 push

# 6. 创建 Pull Request
#    PR 的 GA 会运行相同的 8 项检查进行最终确认
```

## 常见问题修复

### Lint 失败

```bash
# 查看错误
pnpm run lint

# 自动修复
pnpm run lint:fix

# 提交修复
git add -A && git commit --amend --no-edit

# 重新 push
git push origin feat/xxx
```

### Typecheck 失败

```bash
pnpm run typecheck
# 修复类型错误...
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

### 测试失败（Unit/Component/Integration）

```bash
# 运行特定测试查看错误
pnpm run test:unit
pnpm run test:component
pnpm run test:integration

# 修复代码...
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

### E2E 失败

```bash
# 本地运行 E2E（与 CI 相同）
pnpm run test:e2e

# 或使用 Xvfb（headless 模式）
xvfb-run -a -s "-screen 0 1280x800x24" pnpm run test:e2e

# 修复代码...
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

## 关键命令

```bash
# 全部 8 项检查（与 pre-push 相同）
pnpm run build:contracts
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test:unit
pnpm run test:component
pnpm run test:integration
pnpm run test:e2e

# 快捷命令
pnpm run setup-hooks         # 安装/更新 hooks
git push --no-verify         # 跳过 hooks（紧急修复）
```

## 工作流程图

```
本地开发
    ↓
编写代码
    ↓
git commit
    ↓
git push
    ↓
┌──────────────────────────────────┐
│ Pre-push Hook（全部 8 项检查）    │
│                                  │
│ 1. Build Contracts              │
│ 2. ESLint                       │
│ 3. Typecheck                    │
│ 4. Build                        │
│ 5. Unit Tests                   │
│ 6. Component Tests              │
│ 7. Integration Tests            │
│ 8. E2E Tests（完整版）          │
│                                  │
│ ❌ 任何一项失败 → 阻止 push     │
│ ✅ 全部通过 → 允许 push         │
└──────────────────────────────────┘
    ↓
远程分支
    ↓
创建 PR
    ↓
┌──────────────────────────────────┐
│ PR GA（相同的 8 项检查）          │
│ 最终验证                         │
└──────────────────────────────────┘
    ↓
合并到 main
```

## 团队规则

### 必须遵守

1. **所有 8 项检查本地通过**
   - Build Contracts ✅
   - ESLint ✅
   - Typecheck ✅
   - Build ✅
   - Unit Tests ✅
   - Component Tests ✅
   - Integration Tests ✅
   - **E2E Tests（完整版）** ✅

2. **所有问题本地修复**
   - 不允许 push 有问题的代码
   - 不允许依赖 CI 发现问题

3. **使用 PR 统一验证**
   - 创建 PR 后由 GA 进行最终确认
   - 不单独触发 GA

### 禁止事项

- ❌ 直接 push 到 main
- ❌ push 有类型错误的代码
- ❌ push 有 lint 错误的代码
- ❌ push 测试失败的代码（包括 E2E）
- ❌ 区分"主要"和"次要"检查
- ❌ 随意触发 GA

### 紧急情况

```bash
# ⚠️ 仅用于真正的紧急情况
git push --no-verify

# 事后必须：
# 1. 立即修复所有问题
# 2. 强制推送修复
# 3. 向团队说明情况
```

## 故障排除

### Hook 太慢

E2E 测试确实需要较长时间，但这是必要的：
- 确保代码质量
- 避免污染远程分支
- 减少 CI 资源浪费

如果太慢，可以：
1. 小步快跑，频繁提交
2. 本地先运行关键检查
3. 优化代码减少测试时间

### Windows 用户

使用 Git Bash 或 WSL：
```bash
# Git Bash
pnpm run setup-hooks
```

### E2E 需要图形界面

安装 Xvfb：
```bash
# Ubuntu/Debian
sudo apt-get install xvfb

# 或使用 WSL
```

## 总结

- **8 项检查，缺一不可**
- **全部本地通过才能 push**
- **E2E 是完整的，不是简化版**
- **PR 的 GA 只是最终确认**

## 更新记录

- **2026-03-11**: 明确所有 8 项检查（包括完整 E2E）都必须在本地通过
