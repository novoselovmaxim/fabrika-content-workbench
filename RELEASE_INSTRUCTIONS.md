# Release Instructions

## Overview

- **GitHub repo:** `novoselovmaxim/fabrika-content-workbench`
- **Website:** `https://fabric.maxnov.ru`
- **VPS:** `root@80.87.111.142` (key: `~/.ssh/novel_server_key`)
- **VPS web root:** `/var/www/fabric/`
- **VPS downloads dir:** `/var/www/fabric/downloads/`

## Version locations to bump

| File | How |
|---|---|
| `package.json` (root) | `"version": "X.Y.Z"` |
| `app/package.json` | `"version": "X.Y.Z"` |
| `server/package.json` | `"version": "X.Y.Z"` |
| `version.txt` | `X.Y.Z` (plain text) |
| `index-fabric.html` (landing page) | `var tag = 'vX.Y.Z'` in fallback (line ~2162) |
| `manual.html` | visible version numbers in copy |

## Step-by-step

### 1. Bump version

```bash
# Edit all 5 files above
# Then commit & tag
git add -A
git commit -m "v1.2.0"
git tag v1.2.0
git push && git push --tags
```

### 2. Wait for CI

CI (`release.yml`) builds:
- **macOS ARM64** (.dmg) — on `macos-latest`
- **Windows** (.exe) — on `windows-latest`

Both are attached to the GitHub release automatically by `softprops/action-gh-release`.

### 3. Build macOS Intel locally

```bash
npm run dist:mac
```

This produces `release/electron/Fabrika.Content-X.Y.Z-x64.dmg` and a `.zip`.

### 4. Upload Intel build to GitHub release

```bash
gh release upload vX.Y.Z release/electron/Fabrika.Content-X.Y.Z-x64.dmg
gh release upload vX.Y.Z release/electron/Fabrika.Content-X.Y.Z-x64.dmg.blockmap
gh release upload vX.Y.Z "release/electron/Fabrika.Content-X.Y.Z-mac-x64.zip"
```

### 5. Upload everything to VPS

```bash
# version.json
scp -i ~/.ssh/novel_server_key version.json root@80.87.111.142:/var/www/fabric/version.json

# macOS Intel dmg + zip
scp -i ~/.ssh/novel_server_key "release/electron/Fabrika.Content-X.Y.Z-x64.dmg" root@80.87.111.142:/var/www/fabric/downloads/
scp -i ~/.ssh/novel_server_key "release/electron/Fabrika.Content-X.Y.Z-mac-x64.zip" root@80.87.111.142:/var/www/fabric/downloads/

# Windows exe (download from GitHub first)
gh release download vX.Y.Z -p "*.exe" -D /tmp/vXYZ
scp -i ~/.ssh/novel_server_key /tmp/vXYZ/Fabrika.Content.Setup.X.Y.Z.exe root@80.87.111.142:/var/www/fabric/downloads/
```

**`version.json` format** on VPS:

```json
{
  "latest": "X.Y.Z",
  "releaseUrl": "https://github.com/novoselovmaxim/fabrika-content-workbench/releases/tag/vX.Y.Z",
  "downloads": {
    "win": "https://github.com/novoselovmaxim/fabrika-content-workbench/releases/download/vX.Y.Z/Fabrika.Content.Setup.X.Y.Z.exe",
    "mac": {
      "x64": "https://github.com/novoselovmaxim/fabrika-content-workbench/releases/download/vX.Y.Z/Fabrika.Content-X.Y.Z-x64.dmg",
      "arm64": "https://github.com/novoselovmaxim/fabrika-content-workbench/releases/download/vX.Y.Z/Fabrika.Content-X.Y.Z-arm64.dmg"
    }
  }
}
```

### 6. Update website & manual

```bash
# Landing page
scp -i ~/.ssh/novel_server_key index-fabric.html root@80.87.111.142:/var/www/fabric/index.html

# Manual
scp -i ~/.ssh/novel_server_key manual.html root@80.87.111.142:/var/www/fabric/manual.html
```

### 7. Build and deploy local changes

After any code changes (new features, fixes), rebuild:

```bash
npm run build
# Rebuild Electron if needed
npm run rebuild
```

No tag push needed for non-release changes.

## How the update mechanism works

1. **Server** (`server/src/services/updater.ts`) polls GitHub API for latest release.
2. Returns `{ hasUpdate, latest, current, releaseUrl, downloadUrl }`.
3. **Frontend** (`UpdateBanner.tsx`, `SettingsPage.tsx`) shows "Download" button.
4. Click calls `window.electronAPI.openExternal(url)` — opens system browser for direct download URL.
5. **Landing page** fetches `/version.json` from VPS and sets download buttons.
6. If `/version.json` fetch fails, **fallback** constructs GitHub URLs from hardcoded version.

## electron-builder config

Root `package.json` → `"build"` key:
- macOS: `.dmg`, `public.app-category.productivity`
- Windows: `.exe` (NSIS installer, one-click off, allow custom dir)
- Output: `release/electron/`

## SSH key

```bash
ssh -i ~/.ssh/novel_server_key root@80.87.111.142
```
