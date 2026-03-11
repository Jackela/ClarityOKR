# Git Hooks 配置指南

## 概述

项目配置了强制的 pre-push hooks，确保所有代码质量问题在**本地**就被发现和修复，绝不污染远程分支。

## 快速开始

### 安装 Hooks

```bash
# 方法 1: 使用 npm 脚本
pnpm run setup-hooks

# 方法 2: 直接运行脚本
./scripts/setup-hooks.sh
```

## Pre-push Hook 功能

在每次 `git push` 时，hook 会自动运行以下检查：

### 1. 分支保护 ✅
- 禁止直接 push 到 `main` 分支
- 必须使用 Pull Request 合并代码

### 2. TypeScript 类型检查 ✅
```bash
pnpm run typecheck
```
- 检查所有 TypeScript 文件
- 确保没有类型错误

### 3. ESLint 代码检查 ✅
```bash
pnpm exec eslint <修改的文件>
```
- 只检查本次修改的文件（节省时间）
- 确保代码风格一致

### 4. 构建验证 ✅
```bash
pnpm run build:contracts
```
- 验证 contracts 模块可以成功构建
- 捕获构建时错误

### 5. 测试提醒 ⚠️
- 检测是否修改了测试文件
- 提醒运行相关测试

## 本地工作流程

### 标准开发流程

```bash
# 1. 创建功能分支
git checkout -b feat/my-feature

# 2. 编写代码
# ... 修改文件 ...

# 3. 提交代码
git add .
git commit -m "feat: add new feature"

# 4. Push（触发 hooks 检查）
git push origin feat/my-feature
#    ↑
#    └── 自动运行 typecheck + lint + build

# 5. 创建 Pull Request
# 在 GitHub 上创建 PR
```

### 如果 Hook 检查失败

#### Typecheck 失败
```bash
# 查看详细错误
pnpm run typecheck

# 修复类型错误后重新 push
```

#### Lint 失败
```bash
# 查看详细错误
pnpm exec eslint src/path/to/file.ts

# 自动修复大部分问题
pnpm run lint:fix

# 重新 push
git push origin feat/my-feature
```

#### 构建失败
```bash
# 查看详细错误
pnpm run build:contracts

# 修复后重新 push
```

## 特殊情况

### 紧急修复（跳过 hooks）

```bash
# ⚠️ 慎用：跳过所有检查
git push --no-verify
```

**注意**：跳过 hooks 可能导致 CI 失败，请确保你知道自己在做什么。

### 部分检查

如果只想运行特定检查：

```bash
# 只运行 typecheck
pnpm run typecheck

# 只运行 lint
pnpm run lint

# 只检查特定文件
pnpm exec eslint app/main/src/test-mode.ts
```

## 团队成员设置

### 新成员入职检查清单

- [ ] 克隆仓库
- [ ] 运行 `pnpm install`
- [ ] 运行 `pnpm run setup-hooks`
- [ ] 验证 hooks 安装成功：`ls -la .git/hooks/pre-push`

### 强制要求

所有团队成员**必须**安装 pre-push hooks：

```bash
pnpm run setup-hooks
```

## 故障排除

### Hook 没有运行

```bash
# 检查 hook 文件是否存在
ls -la .git/hooks/pre-push

# 检查是否有执行权限
chmod +x .git/hooks/pre-push

# 重新安装
pnpm run setup-hooks
```

### Hook 运行太慢

如果 hook 运行时间过长，可以：

1. **只检查修改的文件**（已默认启用）
2. **跳过构建验证**（不推荐）

```bash
# 跳过 hooks（紧急情况下使用）
git push --no-verify
```

### Windows 用户

Windows 用户需要使用 Git Bash 或 WSL 运行 hooks：

```bash
# Git Bash
./scripts/setup-hooks.sh

# 或者在 WSL 中
wsl ./scripts/setup-hooks.sh
```

## 最佳实践

1. **频繁提交**：小步快跑，减少每次 push 的检查时间
2. **本地先检查**：在 push 前可以先运行 `pnpm run typecheck && pnpm run lint`
3. **及时修复**：发现问题立即修复，不要积累
4. **团队一致**：所有成员都使用相同的 hooks 配置

## 相关命令

```bash
# 完整的检查流程
pnpm run typecheck    # 类型检查
pnpm run lint         # 代码检查
pnpm run lint:fix     # 自动修复
pnpm run build        # 完整构建
pnpm run test         # 运行所有测试

# Hooks 管理
pnpm run setup-hooks  # 安装/更新 hooks
git push --no-verify  # 跳过 hooks（慎用）
```

## 更新记录

- **2026-03-11**: 加强 pre-push hooks，添加 lint 和构建验证
