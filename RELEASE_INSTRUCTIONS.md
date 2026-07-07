# Инструкция по релизу

## Архитектура сборок

| Платформа | Где собирается | Как попадает в релиз |
|-----------|---------------|----------------------|
| Windows (.exe) | GitHub Actions (`release.yml`) | Автоматически по тегу v* |
| Mac Apple Silicon (.dmg) | GitHub Actions (`release.yml`) | Автоматически по тегу v* |
| Mac Intel (.dmg) | Локально на Intel Mac | Ручная загрузка в релиз |

## Команда «обнови версию»

При этой команде делаем:

### 1. Обновить версию

- `fabrika-content-workbench/version.txt` — записать новую версию
- `Bereg_content/version.json` — записать `"latest"` и обновить пути в `"downloads"`

### 2. Собрать Intel Mac локально

```bash
cd fabrika-content-workbench
npm run build && npm run rebuild && npx electron-builder --mac --x64
```

После сборки в `release/electron/` появятся файлы:
- `Fabrika Content-<версия>.dmg` — установщик для Intel
- `Fabrika Content-<версия>-mac.zip` — ZIP для Intel

### 3. Запушить тег (запускает CI)

```bash
git add -A && git commit -m "v<версия>: <описание>"
git tag v<версия> && git push origin main --tags
```

CI соберёт в фоне:
- `Fabrika.Content.Setup.<версия>.exe` — Windows
- `Fabrika.Content-<версия>-arm64.dmg` — Mac Apple Silicon

### 4. Дождаться CI

Проверить, что:
- GitHub Release создался: `https://github.com/novoselovmaxim/fabrika-content-workbench/releases/tag/v<версия>`
- В релизе есть `.exe` и `-arm64.dmg`

### 5. Загрузить Intel-сборку в релиз

```bash
cd fabrika-content-workbench
gh release upload v<версия> release/electron/Fabrika\ Content-<версия>.dmg
```

Можно так же загрузить ZIP:
```bash
gh release upload v<версия> release/electron/Fabrika\ Content-<версия>-mac.zip
```

### 6. Обновить `version.json` в корне `Bereg_content/`

Прописать актуальные пути для скачивания, например:

```json
{
  "latest": "1.1.1",
  "releaseUrl": "https://github.com/novoselovmaxim/fabrika-content-workbench/releases/tag/v1.1.1",
  "downloads": {
    "win": "/downloads/Fabrika.Content.Setup.1.1.1.exe",
    "mac": {
      "x64": "/downloads/Fabrika.Content-1.1.1-x64.dmg",
      "arm64": "/downloads/Fabrika.Content-1.1.1-arm64.dmg"
    }
  }
}
```

## Если нужно пересобрать только Intel

```bash
npm run build && npm run rebuild && npx electron-builder --mac --x64
```
