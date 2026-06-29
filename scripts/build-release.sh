#!/bin/bash
set -e

VERSION=$(cat version.txt)
echo "Building version $VERSION..."

cd app
npm run build
cd ..

cd server
npm run build
cd ..

mkdir -p dist-bin

cd server
npm run pkg:macos
npm run pkg:macos-arm
npm run pkg:win
cd ..

mkdir -p release/macos-x64/FabrikaContent
cp dist-bin/fabrika-server-macos release/macos-x64/FabrikaContent/
cp -r app/dist release/macos-x64/FabrikaContent/app
[ -d content ] && cp -r content release/macos-x64/FabrikaContent/content || mkdir -p release/macos-x64/FabrikaContent/content
[ -d migrations ] && cp -r migrations release/macos-x64/FabrikaContent/migrations || mkdir -p release/macos-x64/FabrikaContent/migrations
cp version.txt release/macos-x64/FabrikaContent/
cp installers/macos/start.command release/macos-x64/FabrikaContent/
cp installers/macos/uninstall.command release/macos-x64/FabrikaContent/
chmod +x release/macos-x64/FabrikaContent/start.command
chmod +x release/macos-x64/FabrikaContent/fabrika-server-macos
cd release/macos-x64 && zip -r ../../releases/FabrikaContent-$VERSION-macos-x64.zip FabrikaContent && cd ../..

mkdir -p release/macos-arm64/FabrikaContent
cp dist-bin/fabrika-server-macos-arm release/macos-arm64/FabrikaContent/fabrika-server-macos
cp -r app/dist release/macos-arm64/FabrikaContent/app
[ -d content ] && cp -r content release/macos-arm64/FabrikaContent/content || mkdir -p release/macos-arm64/FabrikaContent/content
[ -d migrations ] && cp -r migrations release/macos-arm64/FabrikaContent/migrations || mkdir -p release/macos-arm64/FabrikaContent/migrations
cp version.txt release/macos-arm64/FabrikaContent/
cp installers/macos/start.command release/macos-arm64/FabrikaContent/
chmod +x release/macos-arm64/FabrikaContent/start.command
chmod +x release/macos-arm64/FabrikaContent/fabrika-server-macos
cd release/macos-arm64 && zip -r ../../releases/FabrikaContent-$VERSION-macos-arm64.zip FabrikaContent && cd ../..

mkdir -p release/win/FabrikaContent
cp dist-bin/fabrika-server-win.exe release/win/FabrikaContent/
cp -r app/dist release/win/FabrikaContent/app
[ -d content ] && cp -r content release/win/FabrikaContent/content || mkdir -p release/win/FabrikaContent/content
[ -d migrations ] && cp -r migrations release/win/FabrikaContent/migrations || mkdir -p release/win/FabrikaContent/migrations
cp version.txt release/win/FabrikaContent/
cp installers/windows/start.bat release/win/FabrikaContent/
cp installers/windows/install-shortcut.ps1 release/win/FabrikaContent/
cd release/win && zip -r ../../releases/FabrikaContent-$VERSION-windows.zip FabrikaContent && cd ../..

echo "✓ Release $VERSION built successfully"
echo "Files in ./releases/"
