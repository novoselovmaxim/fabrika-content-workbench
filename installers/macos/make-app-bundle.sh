#!/bin/bash
# Usage: make-app-bundle.sh <binary-name> <version>
# Example: make-app-bundle.sh fabrika-server-macos-arm 1.0.1
# Assumes: dist-bin/<binary>, app/dist/, migrations/ exist at repo root

set -euo pipefail
BINARY="${1:-fabrika-server-macos-arm}"
VERSION="${2:-1.0.1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUNDLE="$ROOT/release/FabrikaContent.app"

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"
mkdir -p "$BUNDLE/Contents/Resources/app"
mkdir -p "$BUNDLE/Contents/Resources/migrations"

cp "$ROOT/dist-bin/$BINARY" "$BUNDLE/Contents/MacOS/fabrika-server-macos"
cp -r "$ROOT/app/dist/." "$BUNDLE/Contents/Resources/app/"
cp -r "$ROOT/migrations/." "$BUNDLE/Contents/Resources/migrations/"
cp "$ROOT/version.txt" "$BUNDLE/Contents/Resources/"
cp "$ROOT/installers/macos/Info.plist" "$BUNDLE/Contents/"

chmod +x "$BUNDLE/Contents/MacOS/fabrika-server-macos"

echo "✅ .app bundle created: $BUNDLE"
