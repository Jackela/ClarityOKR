#!/bin/bash
# Setup Git hooks for the project
# All checks run locally before push

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "========================================"
echo "Setting up Git Hooks"
echo "========================================"

mkdir -p "$HOOKS_DIR"

# Create full pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/sh
# Pre-push hook - All checks must pass

set -e

echo ""
echo "========================================"
echo "Pre-push Hook - Running All Checks"
echo "========================================"
echo ""

FAILED=0

run_check() {
    local cmd="$1"
    local name="$2"
    local timeout_sec="${3:-120}"
    
    echo "Running: $name (timeout: ${timeout_sec}s)"
    
    if timeout "$timeout_sec" sh -c "$cmd"; then
        echo "   [PASS] $name"
    else
        echo "   [FAIL] $name"
        FAILED=1
    fi
}

echo "[1/6] Build Contracts"
run_check "pnpm run build:contracts" "Build Contracts" 60

echo "[2/6] TypeScript Type Check"
run_check "pnpm run typecheck" "TypeScript Type Check" 120

echo "[3/6] Build Main Process"
run_check "pnpm run build:main" "Build Main" 120

echo "[4/6] Build Renderer"
run_check "pnpm run build:renderer" "Build Renderer" 300

echo "[5/6] ESLint (src files only)"
run_check "pnpm exec eslint app/main/src app/renderer/src packages/contracts/src --max-warnings=0" "ESLint" 180

echo "[6/6] Unit Tests"
run_check "pnpm run test:unit" "Unit Tests" 180

echo ""
echo "========================================"
echo "Summary"
echo "========================================"

if [ $FAILED -eq 0 ]; then
    echo "ALL CHECKS PASSED!"
    exit 0
else
    echo "SOME CHECKS FAILED!"
    echo "Fix issues before pushing."
    exit 1
fi
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-push"

echo "Pre-push hook installed with all checks"
echo "Run 'git push' to push your changes"
