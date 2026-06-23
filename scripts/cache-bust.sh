#!/bin/bash
# Injects current HEAD short hash into index.html asset URLs for CDN cache busting.
# Called automatically by pre-push hook.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
HASH=$(git -C "$ROOT" rev-parse --short HEAD)

if [ -z "$HASH" ]; then
  echo "[cache-bust] ERROR: could not get HEAD hash" >&2
  exit 1
fi

sed -i "s/\(\.css?v=\)[a-f0-9]\{7,\}/\1$HASH/g" "$INDEX"
sed -i "s/\(\.js?v=\)[a-f0-9]\{7,\}/\1$HASH/g"   "$INDEX"

git -C "$ROOT" add "$INDEX"
echo "[cache-bust] assets versioned to $HASH"
