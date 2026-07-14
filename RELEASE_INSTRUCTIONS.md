# Release Instructions

## Overview

- **GitHub repo:** `novoselovmaxim/fabrika-content-workbench`
- **Website:** `https://fabric.maxnov.ru`
- **VPS:** `root@80.87.111.142` (password auth)
- **VPS web root:** `/var/www/fabric/`
- **VPS downloads dir:** `/var/www/fabric/downloads/`

All download links (in-app updater, landing page, version.json) point to **VPS**, not GitHub. GitHub is used only for CI builds and release assets.

**File naming convention on VPS:**

| File | Format |
|------|--------|
| Intel DMG | `Fabrika.Content-{version}-x64.dmg` |
| Intel ZIP | `Fabrika.Content-{version}-x64.zip` |
| ARM DMG | `Fabrika.Content-{version}-arm64.dmg` |
| Windows EXE | `Fabrika.Content.Setup.{version}.exe` |

## Version locations to bump

| File | How |
|---|---|
| `package.json` (root) | `"version": "X.Y.Z"` |
| `package-lock.json` (root, 3 places) | `"version": "0.1.0"` → `"X.Y.Z"` |
| `app/package.json` | `"version": "X.Y.Z"` |
| `server/package.json` | `"version": "X.Y.Z"` |
| `version.txt` | `X.Y.Z` (plain text) |

## Step-by-step

### 1. Bump version

```bash
# Edit all 5 local files above
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

```bash
# Monitor CI
gh run list --repo novoselovmaxim/fabrika-content-workbench --limit 5

# Wait for success, then download artifacts
gh release download vX.Y.Z --repo novoselovmaxim/fabrika-content-workbench --dir /tmp/vX.Y.Z
```

### 3. Build macOS Intel locally

```bash
npm run dist:mac
```

With `artifactName: "Fabrika.Content-${version}-${arch}.${ext}"` in `package.json`, this produces:
- `release/electron/Fabrika.Content-X.Y.Z-x64.dmg`
- `release/electron/Fabrika.Content-X.Y.Z-x64.zip`

Copy Intel files to download dir:

```bash
cp "release/electron/Fabrika.Content-X.Y.Z-x64.dmg" /tmp/vX.Y.Z/
cp "release/electron/Fabrika.Content-X.Y.Z-x64.zip" /tmp/vX.Y.Z/
```

### 4. Upload everything to VPS

```bash
# Upload all 4 files
sshpass -p 'password' scp /tmp/vX.Y.Z/Fabrika.Content-*-x64.dmg root@80.87.111.142:/var/www/fabric/downloads/
sshpass -p 'password' scp /tmp/vX.Y.Z/Fabrika.Content-*-x64.zip root@80.87.111.142:/var/www/fabric/downloads/
sshpass -p 'password' scp /tmp/vX.Y.Z/Fabrika.Content-*-arm64.dmg root@80.87.111.142:/var/www/fabric/downloads/
sshpass -p 'password' scp /tmp/vX.Y.Z/Fabrika.Content.Setup.*.exe root@80.87.111.142:/var/www/fabric/downloads/

# Clean old versions (remove all files from previous version)
sshpass -p 'password' ssh root@80.87.111.142 \
  "rm -f /var/www/fabric/downloads/Fabrika.*.PREV_X.Y.Z.* /var/www/fabric/downloads/Fabrika*PREV_X.Y.Z*"

# Update version.json
sshpass -p 'password' ssh root@80.87.111.142 'cat > /var/www/fabric/version.json << '\''EOF'\''
{
  "latest": "X.Y.Z",
  "releaseUrl": "https://fabric.maxnov.ru",
  "downloads": {
    "win": "https://fabric.maxnov.ru/downloads/Fabrika.Content.Setup.X.Y.Z.exe",
    "mac": {
      "x64": "https://fabric.maxnov.ru/downloads/Fabrika.Content-X.Y.Z-x64.dmg",
      "arm64": "https://fabric.maxnov.ru/downloads/Fabrika.Content-X.Y.Z-arm64.dmg"
    }
  }
}
EOF'

# Update landing page fallback tag
sshpass -p 'password' ssh root@80.87.111.142 \
  "sed -i 's|var tag = '\''v[0-9.]*'\'';|var tag = '\''vX.Y.Z'\'';|' /var/www/fabric/index.html"

# Update manual.html versions
sshpass -p 'password' ssh root@80.87.111.142 \
  "sed -i 's|v[0-9.]*<br>|vX.Y.Z<br>|; s|Версия: <strong>v[0-9.]*</strong>|Версия: <strong>vX.Y.Z</strong>|' /var/www/fabric/manual.html"
```

## How the update mechanism works

1. **Server** (`server/src/services/updater.ts`) polls GitHub API for latest release tag name.
2. Generates download URL pointing to **VPS**: `https://fabric.maxnov.ru/downloads/...`
3. **Frontend** (`UpdateBanner.tsx`, `SettingsPage.tsx`) shows "Download" button.
4. Click calls `window.electronAPI.openExternal(url)` — opens system browser to download from VPS.
5. **Landing page** fetches `/version.json` from VPS and sets download buttons.
6. If `/version.json` fetch fails, **fallback** constructs VPS URLs from hardcoded version tag.

## electron-builder config

Root `package.json` → `"build"` key:
- macOS: `.dmg` + `.zip`, `public.app-category.productivity`
  - `artifactName: "Fabrika.Content-${version}-${arch}.${ext}"`
- Windows: `.exe` (NSIS installer, one-click off, allow custom dir)
  - `artifactName: "Fabrika.Content.Setup.${version}.${ext}"`
- Output: `release/electron/`
