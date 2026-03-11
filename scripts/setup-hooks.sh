#!/bin/bash
# Setup Git hooks for the project
# 运行此脚本安装 pre-push hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "========================================"
echo "🔧 设置 Git Hooks"
echo "========================================"

# 确保 hooks 目录存在
mkdir -p "$HOOKS_DIR"

# 复制 pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/bash
# Pre-push hook - 全面的本地检查
# 目标：所有问题在本地发现，绝不污染远程分支

set -e

echo "========================================"
echo "🚀 Pre-push 全面检查"
echo "========================================"

# 获取当前分支
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "分支: $CURRENT_BRANCH"

# 检查是否在 main 分支直接 push
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "❌ 错误: 不允许直接 push 到 main"
    echo "   请使用 Pull Request"
    exit 1
fi

# 获取即将 push 的提交范围
if [ -z "$1" ]; then
    if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
        UPSTREAM="@{u}"
    else
        UPSTREAM="main"
    fi
else
    UPSTREAM="$1"
fi

# 获取修改的文件列表
echo "📁 检查修改的文件..."
MODIFIED_FILES=$(git diff --name-only "$UPSTREAM"..HEAD 2>/dev/null || git diff --name-only HEAD~1..HEAD || echo "")

if [ -z "$MODIFIED_FILES" ]; then
    echo "⚠️  没有检测到文件变更，跳过详细检查"
    exit 0
fi

# 分类修改的文件
TS_FILES=$(echo "$MODIFIED_FILES" | grep -E '\.(ts|tsx)$' || true)
JS_FILES=$(echo "$MODIFIED_FILES" | grep -E '\.(js|jsx|cjs|mjs)$' || true)

HAS_TS=false
HAS_JS=false

if [ -n "$TS_FILES" ]; then
    HAS_TS=true
    echo "  TypeScript 文件: $(echo "$TS_FILES" | wc -l) 个"
fi

if [ -n "$JS_FILES" ]; then
    HAS_JS=true
    echo "  JavaScript 文件: $(echo "$JS_FILES" | wc -l) 个"
fi

echo ""

# ==================== 检查 1: Typecheck ====================
echo "🔍 [1/4] 运行 TypeScript 类型检查..."

if ! pnpm run typecheck 2>&1; then
    echo ""
    echo "❌ Typecheck 失败！"
    echo ""
    echo "💡 运行 'pnpm run typecheck' 查看详细错误"
    exit 1
fi

echo "   ✅ Typecheck 通过"
echo ""

# ==================== 检查 2: Lint ====================
echo "🔍 [2/4] 运行 ESLint 检查..."

if [ "$HAS_TS" = true ] || [ "$HAS_JS" = true ]; then
    LINT_FILES="${TS_FILES}${JS_FILES}"
    EXISTING_FILES=""
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            EXISTING_FILES="$EXISTING_FILES$file "
        fi
    done <<< "$LINT_FILES"
    
    if [ -n "$EXISTING_FILES" ]; then
        echo "   检查修改的文件..."
        if ! pnpm exec eslint $EXISTING_FILES 2>&1; then
            echo ""
            echo "❌ Lint 检查失败！"
            echo ""
            echo "💡 修复建议:"
            echo "   1. 运行 'pnpm exec eslint <文件>' 查看详细错误"
            echo "   2. 运行 'pnpm run lint:fix' 自动修复"
            exit 1
        fi
    fi
else
    echo "   没有修改的 TS/JS 文件，跳过"
fi

echo "   ✅ Lint 检查通过"
echo ""

# ==================== 检查 3: 快速构建验证 ====================
echo "🔍 [3/4] 快速构建验证..."

if ! pnpm run build:contracts 2>&1; then
    echo ""
    echo "❌ Contracts 构建失败！"
    exit 1
fi

echo "   ✅ 构建验证通过"
echo ""

# ==================== 检查 4: 测试提醒 ====================
echo "🔍 [4/4] 测试影响评估..."

TEST_FILES=$(echo "$MODIFIED_FILES" | grep -E '(test|spec)\.(ts|js)' || true)
MAIN_FILES=$(echo "$MODIFIED_FILES" | grep -E '^app/(main|renderer|contracts)/' || true)

if [ -n "$TEST_FILES" ]; then
    echo "   ⚠️  检测到测试文件修改，建议运行: pnpm run test:unit"
fi

if [ -n "$MAIN_FILES" ]; then
    echo "   ⚠️  检测到主代码修改"
    if echo "$MAIN_FILES" | grep -q '^app/main/'; then
        echo "   📍 建议运行: pnpm run test:integration"
    fi
    if echo "$MODIFIED_FILES" | grep -qE '(test-mode|clarification-controller|fixtures)'; then
        echo "   📍 建议运行: pnpm run test:e2e"
    fi
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
echo "📋 Hook 功能:"
echo "   1. 禁止直接 push 到 main 分支"
echo "   2. TypeScript 类型检查"
echo "   3. ESLint 代码检查（仅修改的文件）"
echo "   4. Contracts 构建验证"
echo "   5. 测试影响提醒"
echo ""
echo "💡 如果需要跳过 hook，使用: git push --no-verify"
echo ""
