#!/bin/bash
# Installs git hooks into .git/hooks/

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT/.git/hooks"
PRE_PUSH="$HOOKS_DIR/pre-push"

cat > "$PRE_PUSH" << 'ENDOFHOOK'
#!/bin/bash
# Auto-inject commit hash into asset URLs before push (CDN cache busting)
ROOT="$(git rev-parse --show-toplevel)"

# Run the cache-bust script
bash "$ROOT/scripts/cache-bust.sh"

# Amend current commit to include the updated index.html
# Only amend if index.html was actually changed (staged)
if git diff --cached --quiet -- "index.html"; then
  exit 0
fi

git commit --amend --no-edit
echo "[pre-push] amended commit with cache-busted asset URLs"
ENDOFHOOK

chmod +x "$PRE_PUSH"
echo "✓ pre-push hook installed at .git/hooks/pre-push"
echo "  Every 'git push' will now auto-inject the commit hash into asset URLs."
