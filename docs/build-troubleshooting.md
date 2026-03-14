# ClarityOKR 构建故障排查指南

## 快速诊断清单

```bash
# 1. 检查环境
node --version    # 需要 >= 20.0.0
pnpm --version    # 需要 >= 9.0.0

# 2. 检查依赖
pnpm install

# 3. 验证构建
pnpm run build
```

---

## 常见错误及解决方案

### 错误 1: Cannot find module '@clarityokr/contracts'

**症状**:

```
Error: Cannot find module '@clarityokr/contracts'
```

**原因**: contracts 包未构建或构建失败

**解决方案**:

```bash
# 按正确顺序构建
pnpm run build:contracts
pnpm run build:main
pnpm run build:renderer
```

---

### 错误 2: TypeScript 编译失败

**症状**:

```
error TSxxxx: ...
```

**解决方案**:

```bash
# 检查类型错误
pnpm run typecheck

# 修复错误后重新构建
pnpm run build
```

---

### 错误 3: Angular 构建超时

**症状**:

```
<bash_metadata>
bash tool terminated command after exceeding timeout
```

**原因**:

- 首次构建需要较长时间
- 系统资源不足

**解决方案**:

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS=--max-old-space-size=4096

# 使用 CI 模式（无进度条，更快）
pnpm run build:renderer:ci
```

---

### 错误 4: Out of memory

**症状**:

```
FATAL ERROR: Reached heap limit Allocation failed
```

**解决方案**:

```bash
# Linux/Mac
export NODE_OPTIONS=--max-old-space-size=4096

# Windows
set NODE_OPTIONS=--max-old-space-size=4096

# 然后重新构建
pnpm run build
```

---

### 错误 5: 端口被占用

**症状**:

```
Error: listen EADDRINUSE: address already in use :::4200
```

**解决方案**:

```bash
# 查找占用端口的进程
lsof -i :4200

# 终止进程
kill -9 <PID>
```

---

### 错误 6: 缓存问题

**症状**:
构建成功但运行时出现奇怪错误

**解决方案**:

```bash
# 完整清理
pnpm run clean

# 或者手动清理所有缓存
rm -rf node_modules/.cache
rm -rf .angular
rm -rf packages/contracts/tsconfig.build.tsbuildinfo
rm -rf app/main/tsconfig.build.tsbuildinfo

# 重新安装依赖
pnpm install

# 重新构建
pnpm run build
```

---

### 错误 7: 权限问题

**症状**:

```
EACCES: permission denied
```

**解决方案**:

```bash
# 修复权限
chmod -R 755 .

# 或使用 sudo（不推荐）
sudo pnpm run build
```

---

## 清理和重新构建

### 标准清理流程

```bash
# 1. 清理构建输出
pnpm run clean

# 2. 重新构建
pnpm run build
```

### 深度清理流程（解决顽固问题）

```bash
# 1. 停止所有相关进程
pkill -f node
pkill -f electron

# 2. 删除所有构建输出
rm -rf packages/contracts/dist
rm -rf app/renderer/dist
rm -rf app/main/dist

# 3. 删除缓存
rm -rf node_modules/.cache
rm -rf .angular
rm -f packages/contracts/tsconfig.build.tsbuildinfo
rm -f app/main/tsconfig.build.tsbuildinfo

# 4. 删除 node_modules（最后手段）
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf app/*/node_modules

# 5. 重新安装
pnpm install

# 6. 重新构建
pnpm run build
```

---

## 调试构建问题

### 启用详细日志

```bash
# TypeScript 详细输出
cd packages/contracts && npx tsc --build --verbose

# Angular 详细输出
cd app/renderer && ng build --verbose
```

### 检查依赖关系

```bash
# 查看工作区依赖树
pnpm ls --depth=10

# 检查特定包
pnpm ls @clarityokr/contracts
```

### 验证 TypeScript 配置

```bash
# 显示编译配置
pnpm exec tsc --showConfig -p packages/contracts/tsconfig.build.json

# 检查类型而不输出文件
pnpm exec tsc --noEmit -p packages/contracts/tsconfig.build.json
```

### 检查磁盘空间

```bash
# Linux/Mac
df -h

# Windows
dir
```

---

## 性能优化

### 并行构建

```bash
# 使用并行构建（更快）
pnpm run build:parallel
```

### CI 优化

```bash
# CI 环境使用（无进度条）
pnpm run build:ci
```

### 增量构建

```bash
# 只构建变更的部分（自动）
pnpm run build:contracts
# 如果文件未变更，TypeScript 会自动跳过
```

---

## 环境检查脚本

保存为 `scripts/check-env.sh`:

```bash
#!/bin/bash

echo "=== ClarityOKR 环境检查 ==="
echo

echo "Node.js 版本:"
node --version
if [ $? -ne 0 ]; then
    echo "❌ Node.js 未安装"
    exit 1
fi

echo
echo "pnpm 版本:"
pnpm --version
if [ $? -ne 0 ]; then
    echo "❌ pnpm 未安装"
    exit 1
fi

echo
echo "Git 版本:"
git --version

echo
echo "可用内存:"
free -h 2>/dev/null || vm_stat 2>/dev/null || echo "无法检测内存"

echo
echo "磁盘空间:"
df -h .

echo
echo "依赖安装状态:"
if [ -d "node_modules" ]; then
    echo "✅ node_modules 存在"
else
    echo "❌ node_modules 不存在，请运行: pnpm install"
fi

echo
echo "构建输出状态:"
if [ -d "packages/contracts/dist" ]; then
    echo "✅ contracts/dist 存在"
else
    echo "⚠️ contracts/dist 不存在"
fi

if [ -d "app/renderer/dist" ]; then
    echo "✅ renderer/dist 存在"
else
    echo "⚠️ renderer/dist 不存在"
fi

if [ -d "app/main/dist" ]; then
    echo "✅ main/dist 存在"
else
    echo "⚠️ main/dist 不存在"
fi

echo
echo "=== 检查完成 ==="
```

---

## 获取帮助

如果以上方法都无法解决问题：

1. **查看日志文件**:

   ```bash
   cat /tmp/ng-*/angular-errors.log
   ```

2. **检查 GitHub Issues**:
   - 搜索类似错误
   - 创建新 Issue 时提供完整错误日志

3. **联系团队**:
   - 在团队频道描述问题和已尝试的解决方案
   - 提供完整的终端输出

---

## 构建成功验证

构建成功后，检查以下文件是否存在：

```bash
# Contracts
ls packages/contracts/dist/index.js
ls packages/contracts/dist/index.d.ts

# Renderer
ls app/renderer/dist/main.js
ls app/renderer/dist/index.html

# Main
ls app/main/dist/main.js
ls app/main/dist/main.d.ts
```

所有文件都存在？🎉 构建成功！
