#!/bin/bash
# Setup Git hooks for the project
# Trust CI for full validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "========================================"
echo "Setting up Git Hooks"
echo "========================================"

mkdir -p "$HOOKS_DIR"

# Create minimal pre-push hook - trust CI
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/bash
# Pre-push hook - Skip local checks, trust CI
echo "Pre-push: Trusting CI for full validation"
exit 0
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-push"

echo "Pre-push hook installed (minimal - CI will validate)"
echo "Run 'git push' to push your changes"
