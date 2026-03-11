#!/bin/bash
# Setup Git hooks for the project
# 运行此脚本安装强制的 pre-push hooks

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
# Pre-push hook - 强制性本地检查
# 规则：所有问题必须在本地修复，不允许污染远程分支

set -e

echo "========================================"
echo "🚀 Pre-push 强制检查"
echo "========================================"
echo ""
echo "⚠️  规则：所有检查必须通过才能 push"
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

# ==================== 检查 1: Typecheck ====================
echo "🔍 [1/3] TypeScript 类型检查"
echo "   运行: pnpm run typecheck"
echo ""

if ! pnpm run typecheck 2>&1; then
    echo ""
    echo "❌ Typecheck 失败！"
    echo ""
    echo "💡 修复步骤:"
    echo "   1. 运行 'pnpm run typecheck' 查看详细错误"
    echo "   2. 修复所有类型错误"
    echo "   3. 重新 commit 和 push"
    echo ""
    exit 1
fi

echo "   ✅ Typecheck 通过"
echo ""

# ==================== 检查 2: Lint ====================
echo "🔍 [2/3] ESLint 代码检查"

# 检查是否有 TS/JS 文件修改
if [ -z "$TS_FILES" ] && [ -z "$JS_FILES" ]; then
    echo "   没有修改的 TS/JS 文件，跳过"
else
    # 先尝试自动修复
    echo "   尝试自动修复..."
    
    LINT_FILES=""
    for file in $TS_FILES $JS_FILES; do
        if [ -f "$file" ]; then
            LINT_FILES="$LINT_FILES $file"
        fi
    done
    
    if [ -n "$LINT_FILES" ]; then
        # 尝试自动修复
        pnpm exec eslint --fix $LINT_FILES 2>/dev/null || true
        
        # 检查是否有未提交的修复
        if ! git diff --quiet 2>/dev/null; then
            echo "   ⚠️  ESLint 自动修复了一些问题"
            echo ""
            echo "💡 请执行以下操作:"
            echo "   1. 查看修复: git diff"
            echo "   2. 提交修复: git add -A && git commit --amend --no-edit"
            echo "   3. 重新 push"
            echo ""
            exit 1
        fi
        
        # 再次检查是否还有错误
        echo "   验证修复结果..."
        if ! pnpm exec eslint $LINT_FILES 2>&1 | head -30; then
            echo ""
            echo "❌ Lint 检查失败！"
            echo ""
            echo "💡 修复步骤:"
            echo "   1. 查看详细错误: pnpm exec eslint <文件>"
            echo "   2. 尝试自动修复: pnpm run lint:fix"
            echo "   3. 手动修复剩余问题"
            echo "   4. 重新 commit 和 push"
            echo ""
            exit 1
        fi
    fi
fi

echo "   ✅ Lint 检查通过"
echo ""

# ==================== 检查 3: 构建验证 ====================
echo "🔍 [3/3] Contracts 构建验证"
echo "   运行: pnpm run build:contracts"
echo ""

if ! pnpm run build:contracts 2>&1; then
    echo ""
    echo "❌ 构建失败！"
    echo ""
    echo "💡 修复步骤:"
    echo "   1. 运行 'pnpm run build:contracts' 查看详细错误"
    echo "   2. 修复构建错误"
    echo "   3. 重新 commit 和 push"
    echo ""
    exit 1
fi

echo "   ✅ 构建验证通过"
echo ""

# ==================== 测试提醒 ====================
echo "📋 测试建议"

MAIN_FILES=$(echo "$MODIFIED_FILES" | grep -E '^app/(main|renderer|contracts)/' || true)
TEST_FILES=$(echo "$MODIFIED_FILES" | grep -E '(test|spec)\.(ts|js)' || true)

if [ -n "$TEST_FILES" ]; then
    echo "   ⚠️  检测到测试文件修改"
    echo "   建议运行: pnpm run test:unit"
fi

if [ -n "$MAIN_FILES" ]; then
    echo "   ⚠️  检测到主代码修改"
    if echo "$MODIFIED_FILES" | grep -qE '(test-mode|clarification-controller|fixtures)'; then
        echo "   📍 E2E 相关代码已修改"
        echo "   建议运行: pnpm run test:e2e"
    fi
fi

echo ""
echo "========================================"
echo "✅ 所有强制检查通过！"
echo "========================================"
echo ""
exit 0
HOOK_EOF

# 设置执行权限
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Pre-push hook 已安装"
echo ""
echo "📋 Hook 功能:"
echo "   1. 禁止直接 push 到 main 分支"
echo "   2. TypeScript 类型检查（强制）"
echo "   3. ESLint 代码检查（自动修复 + 强制通过）"
echo "   4. Contracts 构建验证（强制）"
echo "   5. 测试提醒"
echo ""
echo "⚠️  重要规则:"
echo "   - 所有检查必须通过才能 push"
echo "   - Lint 错误会自动尝试修复"
echo "   - 修复后需要重新 commit"
echo ""
echo "💡 如需跳过 hook（紧急修复）:"
echo "   git push --no-verify"
echo ""
