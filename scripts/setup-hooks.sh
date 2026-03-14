#!/bin/bash
# Setup Git hooks for the project
# 运行此脚本安装完整的 pre-push hooks（所有 CI 检查）

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
# Pre-push hook - 完整的本地检查（全部 8 项 CI 检查）

set -e

echo "========================================"
echo "🚀 Pre-push 完整检查（全部 CI 检查）"
echo "========================================"
echo ""

CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "📍 分支: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "❌ 错误: 不允许直接 push 到 main 分支"
    exit 1
fi

# 8 项完整检查
echo ""
echo "🔍 [1/8] Build Contracts"
pnpm run build:contracts || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [2/8] ESLint"
pnpm run lint || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [3/8] Typecheck"
pnpm run typecheck || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [4/8] Build"
pnpm run build || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [5/8] Unit Tests"
pnpm run test:unit || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [6/8] Component Tests"
pnpm run test:component || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [7/8] Integration Tests"
pnpm run test:integration || exit 1
echo "   ✅ 通过"

echo ""
echo "🔍 [8/8] E2E Tests（完整版）"
if command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run -a -s "-screen 0 1280x800x24" pnpm run test:e2e || exit 1
else
    pnpm run test:e2e || exit 1
fi
echo "   ✅ 通过"

echo ""
echo "========================================"
echo "✅ 所有 8 项 CI 检查通过！"
echo "========================================"
echo ""
exit 0
HOOK_EOF

# 设置执行权限
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Pre-push hook 已安装"
echo ""
echo "📋 Hook 功能（全部 8 项 CI 检查）:"
echo "   1. Build Contracts"
echo "   2. ESLint"
echo "   3. Typecheck"
echo "   4. Build"
echo "   5. Unit Tests"
echo "   6. Component Tests"
echo "   7. Integration Tests"
echo "   8. E2E Tests（完整版）"
echo ""
echo "⚠️  重要规则:"
echo "   - 所有 8 项检查必须通过才能 push"
echo "   - 包括完整的 E2E 测试"
echo "   - 所有问题必须在本地修复"
echo ""
echo "💡 如需跳过（仅紧急修复）:"
echo "   git push --no-verify"
echo ""
