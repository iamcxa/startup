#!/bin/bash
# scripts/build.sh - Cross-platform build script for Paydirt

set -euo pipefail

VERSION="${1:-$(grep 'version' deno.json | cut -d'"' -f4)}"
TARGETS=(
  "x86_64-unknown-linux-gnu"
  "aarch64-unknown-linux-gnu"
  "x86_64-apple-darwin"
  "aarch64-apple-darwin"
)

echo "Building Paydirt v${VERSION}..."

mkdir -p dist

for target in "${TARGETS[@]}"; do
  echo "  Building for ${target}..."
  deno compile \
    --allow-all \
    --target="${target}" \
    --output="dist/paydirt-${VERSION}-${target}" \
    paydirt.ts
done

echo "Build complete. Artifacts in dist/"
ls -lh dist/
