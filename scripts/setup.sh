#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "🔧 Setting up Instagram fetcher..."

# Create venv if not exists
if [ ! -d ".venv" ]; then
    echo "Creating Python venv..."
    python3 -m venv .venv
fi

# Install dependencies
echo "Installing instagrapi and pyinstaller..."
.venv/bin/pip install --quiet instagrapi pyinstaller

# Compile binary
echo "Compiling Instagram fetcher binary..."
.venv/bin/pyinstaller --onefile \
    --name ig-fetcher \
    --distpath scripts/dist \
    --workpath /tmp/pyi_build \
    scripts/instagram.py

# Cleanup
rm -f ig-fetcher.spec
rm -rf /tmp/pyi_build

echo "✅ Done! Binary available at scripts/dist/ig-fetcher"