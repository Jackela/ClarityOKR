# Git Hooks 强制检查指南

## ⚠️ 重要规则

**所有 CI 检查必须在本地通过，不允许 push 有问题的代码到远程分支！**

## 快速开始

### 安装 Hooks（所有团队成员必须执行）

```bash
pnpm run setup-hooks
```

## Pre-push Hook - 完整 CI 检查

在每次 `git push` 时，hook 会强制运行所有 CI 检查（除了 E2E）：

### CI 检查对照表

| CI 检查 | Pre-push | 说明 |
|---------|----------|------|
| Build Contracts | ✅ 强制 | 构建 contracts 模块 |
| Lint | ✅ 强制 | ESLint 代码检查（自动修复） |
| Typecheck | ✅ 强制 | TypeScript 类型检查 |
| Build | ✅ 强制 | 完整构建（main + renderer） |
| Unit tests | ✅ 强制 | 单元测试 |
| Component tests | ✅ 强制 | Angular 组件测试 |
| Integration tests | ✅ 强制 | 集成测试 |
| E2E tests | ❌ 跳过 | 运行时间长，仅在 CI 中运行 |

### 检查详情

#### 1. Build Contracts ✅
```bash
pnpm run build:contracts
```
- 确保 contracts 模块可以成功构建
- 失败则阻止 push

#### 2. ESLint 代码检查 ✅
```bash
pnpm exec eslint --fix <修改的文件>
pnpm exec eslint <修改的文件>
```
- 自动尝试修复 lint 错误
- 如有自动修复，提示提交修复
- 如有无法修复的错误，阻止 push

#### 3. TypeScript 类型检查 ✅
```bash
pnpm run typecheck
```
- 所有 TypeScript 文件必须通过类型检查
- 失败则阻止 push

#### 4. 完整构建 ✅
```bash
pnpm run build
```
- 构建 main 和 renderer 进程
- 失败则阻止 push

#### 5. 单元测试 ✅
```bash
pnpm run test:unit
```
- 运行所有单元测试
- 失败则阻止 push

#### 6. 组件测试 ✅
```bash
pnpm run test:component
```
- 运行 Angular 组件测试
- 失败则阻止 push

#### 7. 集成测试 ✅
```bash
pnpm run test:integration
```
- 运行集成测试
- 失败则阻止 push

## 使用流程

### 标准开发流程

```bash
# 1. 创建功能分支
git checkout -b feat/my-feature

# 2. 编写代码
# ... 修改文件 ...

# 3. 提交代码
git add .
git commit -m "feat: add new feature"

# 4. Push（触发完整 CI 检查）
git push origin feat/my-feature
#    ↑
#    ├── [1/7] Build Contracts
#    ├── [2/7] Lint（自动修复）
#    ├── [3/7] Typecheck
#    ├── [4/7] Build
#    ├── [5/7] Unit tests
#    ├── [6/7] Component tests
#    ├── [7/7] Integration tests
#    └── ✅ 全部通过 → 允许 push

# 5. 创建 Pull Request（CI 会运行 E2E 测试）
```

## 常见问题修复

### Build Contracts 失败

```bash
# 查看错误
pnpm run build:contracts

# 修复后重新 commit
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

### Lint 失败（自动修复后）

```bash
# 查看自动修复的内容
git diff

# 提交修复
git add -A && git commit --amend --no-edit

# 重新 push
git push origin feat/xxx
```

### Lint 失败（需手动修复）

```bash
# 查看具体错误
pnpm exec eslint app/main/src/my-file.ts

# 尝试自动修复
pnpm run lint:fix

# 手动修复剩余问题
# ... 修改代码 ...

# 重新 commit
git add -A && git commit --amend --no-edit
git push origin feat/xxx
```

### Typecheck 失败

```bash
# 查看详细错误
pnpm run typecheck

# 修复类型错误
# ... 修改代码 ...

# 重新 commit
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

### Build 失败

```bash
# 查看错误
pnpm run build

# 修复构建错误
# ... 修改代码 ...

# 重新 commit
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

### 测试失败

```bash
# 单元测试
pnpm run test:unit

# 组件测试
pnpm run test:component

# 集成测试
pnpm run test:integration

# 修复后重新 commit
git add . && git commit --amend --no-edit
git push origin feat/xxx
```

## 关键命令

```bash
# 完整检查（与 pre-push 相同）
pnpm run build:contracts
pnpm run lint
pnpm run lint:fix
pnpm run typecheck
pnpm run build
pnpm run test:unit
pnpm run test:component
pnpm run test:integration

# 快捷命令
pnpm run setup-hooks    # 安装/更新 hooks
git push --no-verify    # 跳过 hooks（紧急修复）
```

## 团队规则

### 强制要求

1. **所有成员必须安装 hooks**
   ```bash
   pnpm run setup-hooks
   ```

2. **所有 CI 检查必须通过**
   - Build Contracts ✅
   - Lint ✅
   - Typecheck ✅
   - Build ✅
   - Unit tests ✅
   - Component tests ✅
   - Integration tests ✅

3. **禁止直接 push 到 main**
   - 必须使用 PR
   - PR 必须通过 CI（包括 E2E）

### 紧急修复

```bash
# ⚠️ 仅用于真正的紧急情况
git push --no-verify

# 事后必须立即：
# 1. 修复所有问题
# 2. 强制推送修复
# 3. 向团队说明情况
```

## 故障排除

### Hook 没有运行

```bash
# 检查 hook 文件
ls -la .git/hooks/pre-push

# 添加执行权限
chmod +x .git/hooks/pre-push

# 重新安装
pnpm run setup-hooks
```

### Windows 用户

使用 Git Bash 或 WSL：

```bash
# Git Bash
pnpm run setup-hooks

# 或 WSL
wsl pnpm run setup-hooks
```

## 最佳实践

1. **频繁提交** - 小步快跑，减少每次检查时间
2. **本地先检查** - push 前运行关键检查
3. **及时修复** - 发现问题立即修复
4. **保持 hook 更新** - 定期运行 `pnpm run setup-hooks`

## 更新记录

- **2026-03-11**: 完整 CI 检查（7 项），匹配 GitHub Actions
