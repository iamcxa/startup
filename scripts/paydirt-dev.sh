#!/bin/bash
# scripts/paydirt-dev.sh
# Development wrapper for paydirt - uses deno run for correct path resolution
# The compiled binary has path issues with import.meta.url

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec deno run -A "$SCRIPT_DIR/paydirt.ts" "$@"
