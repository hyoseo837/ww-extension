#!/usr/bin/env bash
# Build a Chrome Web Store upload zip from the extension's runtime files only.
# The extension source lives in ext/ (ADR 0026); this script stays at the repo
# root as release tooling and writes the zip to the root dist/.
#
# This is an ALLOWLIST: only files explicitly listed in the zip command below
# ship to the Web Store. server/ and web/ are excluded by construction (not in
# ext/, and not in the allowlist) — see ADR 0010 for why this packaging
# boundary is load-bearing. Do not add server/ to the zip.

set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(grep -E '"version"[[:space:]]*:' ext/manifest.json | head -1 | cut -d'"' -f4)
OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/ww-extension-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

# cd into ext/ so the archive keeps manifest.json at its root (a Chrome zip
# must not be prefixed with ext/); write up to the root dist/.
( cd ext && zip -r "../$OUT_FILE" \
  manifest.json \
  options.html \
  welcome.html \
  src/ \
  fonts/ \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png )

echo
echo "Built $OUT_FILE"
ls -lh "$OUT_FILE"
