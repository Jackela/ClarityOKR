# Git Hooks 强制检查指南

## ⚠️ 重要规则

**所有代码质量问题必须在本地修复，不允许 push 到远程分支！**

## 快速开始

### 安装 Hooks（必须）

```bash
# 所有团队成员必须运行
pnpm run setup-hooks
```

## Pre-push Hook - 强制检查

在每次 `git push` 时，hook 会强制运行以下检查，**任何一项失败都会阻止 push**：

### 1. 分支保护 ❌
- **禁止**直接 push 到 `main` 分支
- 必须使用 Pull Request

### 2. TypeScript 类型检查 ✅（强制）
```bash
pnpm run typecheck
```
- 所有 TypeScript 文件必须通过类型检查
- 失败则阻止 push

### 3. ESLint 代码检查 ✅（强制 + 自动修复）
```bash
# Hook 会自动尝试:
pnpm exec eslint --fix <修改的文件>
```

**流程**:
1. Hook 自动尝试修复 lint 错误
2. 如果有自动修复，会提示你提交修复
3. 修复后重新 push
4. 如果还有无法自动修复的错误，阻止 push

### 4. 构建验证 ✅（强制）
```bash
pnpm run build:contracts
```
- 确保代码可以成功构建
- 失败则阻止 push

### 5. 测试建议 ⚠️（提醒）
- 检测修改的文件类型
- 提醒运行相关测试（非强制）

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

# 4. Push（触发强制检查）
git push origin feat/my-feature
#    ↑
#    ├── 1. Typecheck
#    ├── 2. Lint（自动修复）
#    ├── 3. 构建验证
#    └── 全部通过才能 push

# 5. 创建 Pull Request
```

### 如果 Hook 检查失败

#### Typecheck 失败

```bash
# 查看详细错误
pnpm run typecheck

# 修复类型错误
# ... 修改代码 ...

# 重新提交
git add .
git commit --amend --no-edit

# 重新 push
git push origin feat/my-feature
```

#### Lint 失败（自动修复）

```bash
# Hook 会自动尝试修复，如果有修复会提示：
# "ESLint 自动修复了一些问题"

# 查看修复内容
git diff

# 提交修复
git add -A
git commit --amend --no-edit

# 重新 push
git push origin feat/my-feature
```

#### Lint 失败（需要手动修复）

```bash
# 查看具体错误
pnpm exec eslint app/main/src/my-file.ts

# 尝试自动修复
pnpm run lint:fix

# 手动修复剩余问题
# ... 修改代码 ...

# 重新提交
git add -A
git commit --amend --no-edit

# 重新 push
git push origin feat/my-feature
```

#### 构建失败

```bash
# 查看详细错误
pnpm run build:contracts

# 修复构建错误
# ... 修改代码 ...

# 重新提交
git add .
git commit --amend --no-edit

# 重新 push
git push origin feat/my-feature
```

## 关键命令

```bash
# 完整检查流程
pnpm run typecheck      # 类型检查
pnpm run lint           # 代码检查
pnpm run lint:fix       # 自动修复
pnpm run build          # 完整构建
pnpm run build:contracts # Contracts 构建

# Hooks 管理
pnpm run setup-hooks    # 安装/更新 hooks
git push --no-verify    # 跳过 hooks（紧急修复）
```

## 团队规则

### 强制要求

1. **所有成员必须安装 hooks**
   ```bash
   pnpm run setup-hooks
   ```

2. **不允许 push 有问题的代码**
   - Typecheck 必须通过
   - Lint 必须通过
   - 构建必须通过

3. **禁止直接 push 到 main**
   - 必须使用 PR
   - PR 必须通过 CI

### 违规处理

如果绕过 hooks push 了有问题的代码：
1. 立即修复问题
2. 强制推送修复（`git push --force-with-lease`）
3. 向团队说明情况

## 特殊情况

### 紧急修复

```bash
# ⚠️ 仅用于真正的紧急情况
git push --no-verify

# 事后必须：
# 1. 立即修复问题
# 2. 强制推送修复
# 3. 向团队说明
```

### Hook 太慢

如果 lint 检查太慢：
1. 确保只修改了必要的文件
2. 使用 `--no-verify` 跳过（不推荐）
3. 本地先运行 `pnpm run lint:fix`

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

### Windows 用户

Windows 用户需要使用 Git Bash 或 WSL：

```bash
# Git Bash
pnpm run setup-hooks

# 或者 WSL
wsl pnpm run setup-hooks
```

## 最佳实践

1. **频繁提交**
   - 小步快跑
   - 减少每次 push 的检查时间

2. **本地先检查**
   ```bash
   # push 前先运行
   pnpm run typecheck && pnpm run lint
   ```

3. **及时修复**
   - 发现问题立即修复
   - 不要积累问题

4. **保持 hook 更新**
   - 定期运行 `pnpm run setup-hooks`
   - 关注团队通知

## 更新记录

- **2026-03-11**: 加强 hooks 为强制检查，增加自动修复功能
