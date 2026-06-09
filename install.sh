#!/usr/bin/env bash
# Tandem installer
# Usage: curl -fsSL https://raw.githubusercontent.com/jakejimenez/tandem/main/install.sh | bash

set -euo pipefail

REPO="jakejimenez/tandem"
BINARY="tandem"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION="${TANDEM_VERSION:-}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  OS_NAME="linux" ;;
  Darwin) OS_NAME="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) OS_NAME="windows" ;;
  *) echo "❌ Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)        ARCH_NAME="x64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *) echo "❌ Unsupported arch: $ARCH"; exit 1 ;;
esac

if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
fi

[ -z "$VERSION" ] && { echo "❌ Could not determine version"; exit 1; }

FILENAME="${BINARY}-${OS_NAME}-${ARCH_NAME}"
[ "$OS_NAME" = "windows" ] && FILENAME="${FILENAME}.exe"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${FILENAME}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Installing tandem ${VERSION} (${OS_NAME}/${ARCH_NAME})"
curl -fsSL "$URL" -o "${TMP}/${FILENAME}"
chmod +x "${TMP}/${FILENAME}"

DEST="${INSTALL_DIR}/${BINARY}"
[ "$OS_NAME" = "windows" ] && DEST="${INSTALL_DIR}/${BINARY}.exe"

if [ -w "$INSTALL_DIR" ]; then
  mv "${TMP}/${FILENAME}" "$DEST"
else
  sudo mv "${TMP}/${FILENAME}" "$DEST"
fi

command -v tandem &>/dev/null && echo "✓ $(tandem --version) installed to $DEST" || \
  echo "⚠ Installed to $DEST — ensure $INSTALL_DIR is in your PATH"
