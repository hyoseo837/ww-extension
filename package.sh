#!/usr/bin/env bash
# Build a Chrome Web Store upload zip from the runtime files only.
# Excludes docs, design assets, screenshots, plans, and dev files.

set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(grep -E '"version"[[:space:]]*:' manifest.json | head -1 | cut -d'"' -f4)
OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/ww-extension-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

zip -r "$OUT_FILE" \
  manifest.json \
  options.html \
  src/ \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png

echo
echo "Built $OUT_FILE"
ls -lh "$OUT_FILE"
