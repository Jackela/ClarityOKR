#!/bin/bash
# Setup Git hooks for the project
# 运行此脚本安装完整的 pre-push hooks

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
# Pre-push hook - 完整的本地检查
# 目标：所有 CI 检查必须在本地通过，绝不污染远程分支

set -e

echo "========================================"
echo "🚀 Pre-push 完整检查"
echo "========================================"
echo ""
echo "⚠️  规则：所有检查必须通过才能 push"
echo "   参考 CI: .github/workflows/ci.yml"
echo ""

# 获取当前分支
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "📍 分支: $CURRENT_BRANCH"

# 检查是否在 main 分支直接 push
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo ""
    echo "❌ 错误: 不允许直接 push 到 main 分支"
    echo "   请创建功能分支并提交 Pull Request"
    echo ""
    exit 1
fi

# 获取修改的文件列表
echo "📁 扫描修改的文件..."
MODIFIED_FILES=$(git diff --cached --name-only 2>/dev/null || echo "")
if [ -z "$MODIFIED_FILES" ]; then
    MODIFIED_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "")
fi

TS_FILES=$(echo "$MODIFIED_FILES" | grep -E '\.(ts|tsx)$' || true)
JS_FILES=$(echo "$MODIFIED_FILES" | grep -E '\.(js|jsx|cjs|mjs)$' || true)

if [ -n "$TS_FILES" ]; then
    echo "   TypeScript 文件: $(echo "$TS_FILES" | wc -l) 个"
fi
if [ -n "$JS_FILES" ]; then
    echo "   JavaScript 文件: $(echo "$JS_FILES" | wc -l) 个"
fi
echo ""

# ==================== 检查 1: Build Contracts ====================
echo "🔍 [1/7] Build Contracts"

if ! pnpm run build:contracts 2>&1; then
    echo ""
    echo "❌ Build Contracts 失败！"
    exit 1
fi
echo "   ✅ Build Contracts 通过"
echo ""

# ==================== 检查 2: Lint ====================
echo "🔍 [2/7] ESLint 检查"

if [ -z "$TS_FILES" ] && [ -z "$JS_FILES" ]; then
    echo "   没有修改的 TS/JS 文件，跳过"
else
    echo "   尝试自动修复..."
    LINT_FILES=""
    for file in $TS_FILES $JS_FILES; do
        if [ -f "$file" ]; then
            LINT_FILES="$LINT_FILES $file"
        fi
    done
    
    if [ -n "$LINT_FILES" ]; then
        pnpm exec eslint --fix $LINT_FILES 2>/dev/null || true
        
        if ! git diff --quiet 2>/dev/null; then
            echo "   ⚠️  ESLint 自动修复了一些问题"
            echo "   请执行: git add -A && git commit --amend --no-edit"
            exit 1
        fi
        
        echo "   验证修复结果..."
        if ! pnpm exec eslint $LINT_FILES 2>&1 | head -30; then
            echo ""
            echo "❌ Lint 检查失败！"
            exit 1
        fi
    fi
fi
echo "   ✅ Lint 检查通过"
echo ""

# ==================== 检查 3: Typecheck ====================
echo "🔍 [3/7] TypeScript 类型检查"

if ! pnpm run typecheck 2>&1; then
    echo ""
    echo "❌ Typecheck 失败！"
    exit 1
fi
echo "   ✅ Typecheck 通过"
echo ""

# ==================== 检查 4: Build ====================
echo "🔍 [4/7] 完整构建"

if ! pnpm run build 2>&1; then
    echo ""
    echo "❌ 构建失败！"
    exit 1
fi
echo "   ✅ 构建通过"
echo ""

# ==================== 检查 5: Unit Tests ====================
echo "🔍 [5/7] 单元测试"

if ! pnpm run test:unit 2>&1; then
    echo ""
    echo "❌ 单元测试失败！"
    exit 1
fi
echo "   ✅ 单元测试通过"
echo ""

# ==================== 检查 6: Component Tests ====================
echo "🔍 [6/7] 组件测试"

if ! pnpm run test:component 2>&1; then
    echo ""
    echo "❌ 组件测试失败！"
    exit 1
fi
echo "   ✅ 组件测试通过"
echo ""

# ==================== 检查 7: Integration Tests ====================
echo "🔍 [7/7] 集成测试"

if ! pnpm run test:integration 2>&1; then
    echo ""
    echo "❌ 集成测试失败！"
    exit 1
fi
echo "   ✅ 集成测试通过"
echo ""

# ==================== 完成 ====================
echo "========================================"
echo "✅ 所有 CI 检查通过！"
echo "========================================"
echo ""
exit 0
HOOK_EOF

# 设置执行权限
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Pre-push hook 已安装"
echo ""
echo "📋 Hook 功能（对应 CI 检查）:"
echo "   1. Build Contracts"
echo "   2. ESLint（自动修复）"
echo "   3. Typecheck"
echo "   4. Build（完整构建）"
echo "   5. Unit tests"
echo "   6. Component tests"
echo "   7. Integration tests"
echo ""
echo "⚠️  规则:"
echo "   - 所有检查必须通过才能 push"
echo "   - 禁止直接 push 到 main"
echo ""
echo "💡 如需跳过: git push --no-verify"
echo ""
