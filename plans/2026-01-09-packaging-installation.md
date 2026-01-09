# Paydirt Packaging & Installation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete packaging and installation system for Paydirt that supports multiple platforms and installation methods.

**Tech Stack:** Deno, GitHub Actions, Shell scripting, Homebrew

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Distribution Methods                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   curl/sh   │  │  Homebrew   │  │   GitHub    │  │   deno     │ │
│  │  installer  │  │   formula   │  │  Releases   │  │  install   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                                   ▼                                  │
│                        ┌─────────────────┐                          │
│                        │  pd / paydirt   │                          │
│                        │    (binary)     │                          │
│                        └─────────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Cross-Platform Build System

### Task 1.1: Create Build Script

**Files:**
- Create: `scripts/build.sh`

**Content:**

```bash
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
```

---

### Task 1.2: Create Release Archive Script

**Files:**
- Create: `scripts/package.sh`

**Content:**

```bash
#!/bin/bash
# scripts/package.sh - Create release archives

set -euo pipefail

VERSION="${1:-$(grep 'version' deno.json | cut -d'"' -f4)}"
DIST_DIR="dist"

cd "${DIST_DIR}"

for binary in paydirt-*; do
  if [[ -f "${binary}" ]]; then
    # Determine archive name
    archive_name="${binary}.tar.gz"

    # Create tarball
    tar -czvf "${archive_name}" "${binary}"

    # Generate checksum
    shasum -a 256 "${archive_name}" >> checksums.txt

    echo "Created ${archive_name}"
  fi
done

echo "Checksums:"
cat checksums.txt
```

---

## Phase 2: Installation Script

### Task 2.1: Create curl/sh Installer

**Files:**
- Create: `install.sh`

**Content:**

```bash
#!/bin/bash
# Paydirt installer
# Usage: curl -fsSL https://raw.githubusercontent.com/iamcxa/paydirt/main/install.sh | bash

set -euo pipefail

REPO="iamcxa/paydirt"
INSTALL_DIR="${PAYDIRT_INSTALL_DIR:-$HOME/.paydirt/bin}"
BINARY_NAME="pd"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect OS and architecture
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux*)  os="unknown-linux-gnu" ;;
    Darwin*) os="apple-darwin" ;;
    *)       error "Unsupported OS: $(uname -s)" ;;
  esac

  case "$(uname -m)" in
    x86_64)  arch="x86_64" ;;
    aarch64) arch="aarch64" ;;
    arm64)   arch="aarch64" ;;
    *)       error "Unsupported architecture: $(uname -m)" ;;
  esac

  echo "${arch}-${os}"
}

# Get latest release version
get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | cut -d'"' -f4
}

# Download and install
install() {
  local platform version download_url tmp_dir

  platform=$(detect_platform)
  version=$(get_latest_version)

  if [[ -z "${version}" ]]; then
    error "Failed to get latest version"
  fi

  info "Installing Paydirt ${version} for ${platform}..."

  download_url="https://github.com/${REPO}/releases/download/${version}/paydirt-${version#v}-${platform}.tar.gz"
  tmp_dir=$(mktemp -d)

  # Download
  info "Downloading from ${download_url}..."
  curl -fsSL "${download_url}" -o "${tmp_dir}/paydirt.tar.gz" \
    || error "Download failed"

  # Extract
  tar -xzf "${tmp_dir}/paydirt.tar.gz" -C "${tmp_dir}"

  # Install
  mkdir -p "${INSTALL_DIR}"
  mv "${tmp_dir}"/paydirt-* "${INSTALL_DIR}/${BINARY_NAME}"
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Cleanup
  rm -rf "${tmp_dir}"

  info "Installed to ${INSTALL_DIR}/${BINARY_NAME}"

  # Check PATH
  if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
    warn "Add ${INSTALL_DIR} to your PATH:"
    echo ""
    echo "  export PATH=\"\${PATH}:${INSTALL_DIR}\""
    echo ""
    echo "Add this to your ~/.bashrc or ~/.zshrc"
  fi

  info "Installation complete! Run 'pd --version' to verify."
}

install
```

---

### Task 2.2: Create Uninstall Script

**Files:**
- Create: `uninstall.sh`

**Content:**

```bash
#!/bin/bash
# Paydirt uninstaller

set -euo pipefail

INSTALL_DIR="${PAYDIRT_INSTALL_DIR:-$HOME/.paydirt/bin}"

echo "Removing Paydirt..."

rm -f "${INSTALL_DIR}/pd"
rm -f "${INSTALL_DIR}/paydirt"

if [[ -d "${INSTALL_DIR}" ]] && [[ -z "$(ls -A "${INSTALL_DIR}")" ]]; then
  rmdir "${INSTALL_DIR}"
  rmdir "$(dirname "${INSTALL_DIR}")" 2>/dev/null || true
fi

echo "Paydirt has been uninstalled."
echo "You may want to remove ${INSTALL_DIR} from your PATH."
```

---

## Phase 3: Homebrew Formula

### Task 3.1: Create Homebrew Formula

**Files:**
- Create: `Formula/paydirt.rb` (for homebrew-paydirt tap)

**Content:**

```ruby
# Formula/paydirt.rb
class Paydirt < Formula
  desc "Multi-agent orchestrator with Goldflow execution engine"
  homepage "https://github.com/iamcxa/paydirt"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_intel do
      url "https://github.com/iamcxa/paydirt/releases/download/v#{version}/paydirt-#{version}-x86_64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_SHA256_INTEL"
    end
    on_arm do
      url "https://github.com/iamcxa/paydirt/releases/download/v#{version}/paydirt-#{version}-aarch64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_SHA256_ARM"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/iamcxa/paydirt/releases/download/v#{version}/paydirt-#{version}-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_INTEL"
    end
    on_arm do
      url "https://github.com/iamcxa/paydirt/releases/download/v#{version}/paydirt-#{version}-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_ARM"
    end
  end

  def install
    bin.install Dir["paydirt-*"].first => "pd"
    bin.install_symlink "pd" => "paydirt"
  end

  test do
    assert_match "Paydirt v#{version}", shell_output("#{bin}/pd --version")
  end
end
```

---

### Task 3.2: Create Homebrew Tap Repository Structure

**Note:** This requires a separate repo: `iamcxa/homebrew-paydirt`

**Structure:**
```
homebrew-paydirt/
├── Formula/
│   └── paydirt.rb
└── README.md
```

**Usage after setup:**
```bash
brew tap iamcxa/paydirt
brew install paydirt
```

---

## Phase 4: GitHub Actions Release Workflow

### Task 4.1: Create Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Content:**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build:
    name: Build ${{ matrix.target }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-latest
          - target: aarch64-unknown-linux-gnu
            os: ubuntu-latest
          - target: x86_64-apple-darwin
            os: macos-latest
          - target: aarch64-apple-darwin
            os: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x

      - name: Get version
        id: version
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Build
        run: |
          deno compile \
            --allow-all \
            --target=${{ matrix.target }} \
            --output=paydirt-${{ steps.version.outputs.version }}-${{ matrix.target }} \
            paydirt.ts

      - name: Package
        run: |
          tar -czvf paydirt-${{ steps.version.outputs.version }}-${{ matrix.target }}.tar.gz \
            paydirt-${{ steps.version.outputs.version }}-${{ matrix.target }}

      - name: Generate checksum
        run: |
          shasum -a 256 paydirt-${{ steps.version.outputs.version }}-${{ matrix.target }}.tar.gz \
            > paydirt-${{ steps.version.outputs.version }}-${{ matrix.target }}.tar.gz.sha256

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: paydirt-${{ matrix.target }}
          path: |
            *.tar.gz
            *.sha256

  release:
    name: Create Release
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Create checksums file
        run: |
          cd artifacts
          cat *.sha256 > checksums.txt

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            artifacts/*.tar.gz
            artifacts/checksums.txt
          generate_release_notes: true
```

---

### Task 4.2: Create Version Bump Script

**Files:**
- Create: `scripts/bump-version.sh`

**Content:**

```bash
#!/bin/bash
# scripts/bump-version.sh - Bump version and create release tag

set -euo pipefail

NEW_VERSION="${1:-}"

if [[ -z "${NEW_VERSION}" ]]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 0.2.0"
  exit 1
fi

# Update deno.json
sed -i.bak "s/\"version\": \".*\"/\"version\": \"${NEW_VERSION}\"/" deno.json
rm -f deno.json.bak

# Update paydirt.ts VERSION constant
sed -i.bak "s/const VERSION = '.*'/const VERSION = '${NEW_VERSION}'/" paydirt.ts
rm -f paydirt.ts.bak

# Commit and tag
git add deno.json paydirt.ts
git commit -m "chore: bump version to ${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

echo "Version bumped to ${NEW_VERSION}"
echo "Run 'git push && git push --tags' to trigger release"
```

---

## Phase 5: deno install Support

### Task 5.1: Update deno.json for Installation

**Files:**
- Modify: `deno.json`

**Add:**

```json
{
  "name": "@paydirt/paydirt",
  "version": "0.1.0",
  "exports": "./paydirt.ts",
  "bin": {
    "pd": "./paydirt.ts",
    "paydirt": "./paydirt.ts"
  }
}
```

**Usage:**
```bash
deno install --allow-all --name=pd jsr:@paydirt/paydirt
```

---

### Task 5.2: Publish to JSR

**Files:**
- Create: `jsr.json`

**Content:**

```json
{
  "name": "@paydirt/paydirt",
  "version": "0.1.0",
  "exports": "./paydirt.ts",
  "publish": {
    "include": [
      "paydirt.ts",
      "src/**/*.ts",
      "prospects/**/*.md",
      "commands/**/*.md",
      "deno.json",
      "README.md",
      "LICENSE"
    ]
  }
}
```

**Publish command:**
```bash
deno publish
```

---

## Phase 6: Documentation

### Task 6.1: Create INSTALL.md

**Files:**
- Create: `INSTALL.md`

**Content:**

```markdown
# Installing Paydirt

## Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/iamcxa/paydirt/main/install.sh | bash
```

## Homebrew (macOS/Linux)

```bash
brew tap iamcxa/paydirt
brew install paydirt
```

## From Source

Requires [Deno](https://deno.land) 1.x+

```bash
git clone https://github.com/iamcxa/paydirt.git
cd paydirt
deno task compile
cp paydirt /usr/local/bin/pd
```

## Deno Install

```bash
deno install --allow-all --name=pd jsr:@paydirt/paydirt
```

## Verify Installation

```bash
pd --version
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/iamcxa/paydirt/main/uninstall.sh | bash
# or
brew uninstall paydirt
```
```

---

## Summary

| Phase | Task | Description |
|-------|------|-------------|
| 1 | 1.1-1.2 | Cross-platform build scripts |
| 2 | 2.1-2.2 | curl/sh installer & uninstaller |
| 3 | 3.1-3.2 | Homebrew formula & tap |
| 4 | 4.1-4.2 | GitHub Actions release workflow |
| 5 | 5.1-5.2 | deno install & JSR publish |
| 6 | 6.1 | Installation documentation |

---

## Release Workflow

```
Developer                     GitHub Actions                    Users
    │                              │                               │
    │  git tag v0.2.0              │                               │
    │  git push --tags             │                               │
    │ ─────────────────────────────>                               │
    │                              │                               │
    │                        Build binaries                        │
    │                        (4 platforms)                         │
    │                              │                               │
    │                        Create Release                        │
    │                        Upload artifacts                      │
    │                              │                               │
    │                              │  curl install.sh | bash       │
    │                              │ <─────────────────────────────│
    │                              │                               │
    │                              │  Download binary              │
    │                              │ ─────────────────────────────>│
    │                              │                               │
    │                              │                     pd --help │
```
