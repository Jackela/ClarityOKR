#!/bin/bash
# Setup Git hooks for the project
# 运行此脚本安装完整的 pre-push hooks（包含所有测试）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "========================================"
echo "🔧 设置 Git Hooks"
echo "========================================"

# 确保 hooks 目录存在
mkdir -p "$HOOKS_DIR"

# 创建 pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/bash
# Pre-push hook - 完整的本地检查（包含所有测试）
# 规则：所有检查和测试必须在本地通过，绝不污染远程分支

set -e

echo "========================================"
echo "🚀 Pre-push 完整检查"
echo "========================================"
echo ""

# 获取当前分支
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "📍 分支: $CURRENT_BRANCH"

# 检查是否在 main 分支直接 push
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo ""
    echo "❌ 错误: 不允许直接 push 到 main 分支"
    exit 1
fi

# ==================== 8 项检查 ====================

echo "🔍 [1/8] Build Contracts"
if ! pnpm run build:contracts 2>&1; then
    echo "❌ Build Contracts 失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [2/8] ESLint"
if ! pnpm exec eslint --cache . 2>&1 | head -20; then
    echo "❌ Lint 失败！运行 'pnpm run lint:fix' 修复"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [3/8] Typecheck"
if ! pnpm run typecheck 2>&1; then
    echo "❌ Typecheck 失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [4/8] Build"
if ! pnpm run build 2>&1; then
    echo "❌ 构建失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [5/8] Unit Tests"
if ! pnpm run test:unit 2>&1; then
    echo "❌ 单元测试失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [6/8] Component Tests"
if ! pnpm run test:component 2>&1; then
    echo "❌ 组件测试失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [7/8] Integration Tests"
if ! pnpm run test:integration 2>&1; then
    echo "❌ 集成测试失败！"; exit 1
fi
echo "   ✅ 通过"

echo "🔍 [8/8] E2E Tests (Pre-push)"
# 检查是否有 E2E 相关修改
MODIFIED_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "")
E2E_FILES=$(echo "$MODIFIED_FILES" | grep -E '^tests/e2e/' || true)
MAIN_FILES=$(echo "$MODIFIED_FILES" | grep -E '^app/' || true)

if [ -n "$E2E_FILES" ] || [ -n "$MAIN_FILES" ]; then
    echo "   运行 E2E 测试..."
    if ! pnpm run test:e2e:prepush 2>&1; then
        echo "❌ E2E 测试失败！"; exit 1
    fi
    echo "   ✅ 通过"
else
    echo "   无相关修改，跳过"
fi

echo ""
echo "========================================"
echo "✅ 所有检查通过！准备 push..."
echo "========================================"
echo ""
exit 0
HOOK_EOF

# 设置执行权限
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Pre-push hook 已安装"
echo ""
echo "📋 Hook 功能（8 项检查）:"
echo "   1. Build Contracts"
echo "   2. ESLint（带 cache）"
echo "   3. Typecheck"
echo "   4. Build"
echo "   5. Unit tests"
echo "   6. Component tests"
echo "   7. Integration tests"
echo "   8. E2E tests（prepush 快速版）"
echo ""
echo "⚠️  规则:"
echo "   - 所有检查必须通过才能 push"
echo "   - 所有问题必须在本地修复"
echo "   - 不随意触发 GA，使用 PR 统一验证"
echo ""
echo "💡 如需跳过: git push --no-verify"
echo ""
