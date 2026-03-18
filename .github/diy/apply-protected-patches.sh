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

# dapnet-gateway GCC13 fix
if [ -f "$PATCH_DIR/dapnet-gateway-002-fix-gcc13-cstdint.patch" ]; then
  TARGET_DIR="dapnet-gateway/patches"
  mkdir -p "$TARGET_DIR"
  cp "$PATCH_DIR/dapnet-gateway-002-fix-gcc13-cstdint.patch" "$TARGET_DIR/002-fix-gcc13-cstdint.patch"
  echo "✓ Restored dapnet-gateway/patches/002-fix-gcc13-cstdint.patch"
fi

# fullconenat-nft: fix const qualifier build error on older kernels (e.g. 5.4.x)
if [ -f "$PATCH_DIR/fullconenat-nft-001-fix-const-nft-reg-load16.patch" ]; then
  TARGET_DIR="fullconenat-nft/patches"
  mkdir -p "$TARGET_DIR"
  cp "$PATCH_DIR/fullconenat-nft-001-fix-const-nft-reg-load16.patch" "$TARGET_DIR/001-fix-const-nft-reg-load16.patch"
  echo "✓ Restored fullconenat-nft/patches/001-fix-const-nft-reg-load16.patch"
fi

# Add more protected patches here as needed
# Example:
# if [ -f "$PATCH_DIR/foo-bar-001.patch" ]; then
#   mkdir -p "foo/patches"
#   cp "$PATCH_DIR/foo-bar-001.patch" "foo/patches/001-something.patch"
#   echo "✓ Restored foo/patches/001-something.patch"
# fi

echo "Protected patches applied successfully"
