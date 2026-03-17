#!/usr/bin/env bash
set -e
# Apply protected patches from .github/diy/patches to package directories
# Run after sync operations to restore patches that might be overwritten

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PATCH_DIR="$SCRIPT_DIR/patches"
REPO_ROOT="$SCRIPT_DIR/../.."

if [ ! -d "$PATCH_DIR" ]; then
  echo "No protected patch directory found at $PATCH_DIR"
  exit 0
fi

cd "$REPO_ROOT"

# sing-box patch
if [ -f "$PATCH_DIR/sing-box-100-go-version.patch" ]; then
  TARGET_DIR="sing-box/patches"
  mkdir -p "$TARGET_DIR"
  cp "$PATCH_DIR/sing-box-100-go-version.patch" "$TARGET_DIR/100-go-version.patch"
  echo "✓ Restored sing-box/patches/100-go-version.patch"
fi

# Add more protected patches here as needed
# Example:
# if [ -f "$PATCH_DIR/foo-bar-001.patch" ]; then
#   mkdir -p "foo/patches"
#   cp "$PATCH_DIR/foo-bar-001.patch" "foo/patches/001-something.patch"
#   echo "✓ Restored foo/patches/001-something.patch"
# fi

echo "Protected patches applied successfully"
