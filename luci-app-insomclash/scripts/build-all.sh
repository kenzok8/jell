#!/usr/bin/env bash

# Build Insomclash IPK for multiple OpenWrt targets using Docker SDK images.
# Adjust the SDK tags below so they match the exact release/target/subtarget
# you plan to support (see https://hub.docker.com/r/openwrtorg/sdk).

set -euo pipefail

IMAGE_REGISTRY="ghcr.io/openwrt/sdk"

SDK_BRANCHES=(
  "openwrt-24.10"
  "SNAPSHOT"
)

ARCH_LIST=(
  # x86
  "x86_64"
  "i386_pentium-mmx"
  # ARM64
  "aarch64_cortex-a53"
  "aarch64_cortex-a72"
  "aarch64_generic"
  # ARM
  "arm_cortex-a15_neon-vfpv4"
  "arm_cortex-a9"
  "arm_cortex-a7"
  # MIPS
  "mips_24kc"
  "mipsel_74kc"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_SOURCE_DIR="$REPO_ROOT/openwrt"
OUTPUT_DIR="$PKG_SOURCE_DIR/core"
SDK_WORKDIR="/builder"
CACHE_DL="$REPO_ROOT/.cache/openwrt-dl"
CACHE_BUILD="$REPO_ROOT/.cache/openwrt-build"
CACHE_STAGING="$REPO_ROOT/.cache/openwrt-staging"
BIN_SOURCE_DIR="$REPO_ROOT/core"

command -v docker >/dev/null 2>&1 || {
  echo "Error: docker binary not found in PATH." >&2
  exit 1
}

if [[ ! -d "$PKG_SOURCE_DIR" || ! -f "$PKG_SOURCE_DIR/Makefile" ]]; then
  echo "Error: Expected OpenWrt package sources in $PKG_SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR" "$CACHE_DL" "$CACHE_BUILD" "$CACHE_STAGING"

if [[ ! -d "$BIN_SOURCE_DIR" ]]; then
  echo "Error: Expected binary directory at $BIN_SOURCE_DIR" >&2
  exit 1
fi

run_build() {
  local branch="$1"
  local arch="$2"

  local target="${arch//_/-}"

  local candidates=(
    "${target}-${branch}"
    "${target}-${branch^^}"
    "${target}-${branch,,}"
    "${target}"
  )

  local image=""
  for tag in "${candidates[@]}"; do
    if docker manifest inspect "${IMAGE_REGISTRY}:${tag}" >/dev/null 2>&1; then
      image="${IMAGE_REGISTRY}:${tag}"
      break
    fi
  done

  if [[ -z "$image" ]]; then
    echo "!! No matching SDK image found for branch=${branch}, arch=${arch} (tried ${candidates[*]})"
    return
  fi

  echo "==> Building for ${branch} / ${arch} using image ${image}"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "-- pulling image ${image}"
    docker pull "$image"
  fi

  local dl_target=""
  case "$arch" in
    x86_64) dl_target="x86/64" ;;
    i386_pentium-mmx) dl_target="x86/geode" ;;
    aarch64_cortex-a53) dl_target="mediatek/filogic" ;;
    aarch64_cortex-a72) dl_target="rockchip/armv8" ;;
    aarch64_generic) dl_target="armvirt/64" ;;
    arm_cortex-a15_neon-vfpv4) dl_target="armvirt/32" ;;
    arm_cortex-a9) dl_target="armvirt/32" ;;
    arm_cortex-a7) dl_target="armvirt/32" ;;
    mips_24kc) dl_target="ath79/generic" ;;
    mipsel_74kc) dl_target="ramips/mt7621" ;;
    *)
      echo "!! No TARGET mapping for arch=${arch}; skip."
      return
      ;;
  esac

  # Map branch to downloads path
  local version_path=""
  case "$branch" in
    "SNAPSHOT") version_path="snapshots" ;;
    "openwrt-24.10") version_path="snapshots" ;;
    openwrt-*)
      if [[ "$branch" =~ ^openwrt-([0-9.]+)$ ]]; then
        version_path="releases/${BASH_REMATCH[1]}"
      else
        version_path="snapshots"
      fi
      ;;
    *)
      version_path="snapshots"
      ;;
  esac

  docker run --rm -t \
    -v "$PKG_SOURCE_DIR":/tmp/insomclash-package:ro \
    -v "$OUTPUT_DIR":/tmp/insomclash-output \
    -v "$CACHE_DL":/builder/dl \
    -v "$CACHE_BUILD":/builder/build_dir \
    -v "$CACHE_STAGING":/builder/staging_dir \
    -v "$BIN_SOURCE_DIR":/tmp/insomclash-bins:ro \
    "$image" /bin/bash -c "
      set -euo pipefail
      cd $SDK_WORKDIR
      if [ ! -x ./scripts/feeds ]; then
        DOWNLOAD_FILE='sdk-.*' TARGET='$dl_target' VERSION_PATH='$version_path' ./setup.sh
      fi
      ./scripts/feeds update -a >/tmp/feeds.log
      ./scripts/feeds install -a >>/tmp/feeds.log
      rm -rf package/insomclash
      cp -a /tmp/insomclash-package package/insomclash
      mkdir -p package/insomclash/core
      cp -a /tmp/insomclash-bins/* package/insomclash/core/
      make defconfig >/tmp/defconfig.log
      make package/insomclash/compile V=sc
      find bin -name 'insomclash_*.ipk' -exec cp {} /tmp/insomclash-output \\;
    "
}

for branch in "${SDK_BRANCHES[@]}"; do
  for arch in "${ARCH_LIST[@]}"; do
    run_build "$branch" "$arch"
  done
done

echo "All builds completed. IPK files saved under $OUTPUT_DIR"
