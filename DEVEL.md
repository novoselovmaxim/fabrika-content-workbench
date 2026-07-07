# Development Log

Текущий `version.txt`: `1.1.0`  
Последний релиз: **v1.1.0**

Процесс релиза описан в `RELEASE_INSTRUCTIONS.md`.

---

## Правки, готовые к релизу (v1.0.13)

### Инфраструктура метрик и подключение площадок
- [x] **VPS:** `metrics.mjs` — модуль с функциями `checkTelegram`, `checkYouTube`, `checkVK`, `checkInstagram` + `fetchTelegramPosts` (парсинг `t.me/s/`)
- [x] **VPS:** `/api/metrics/check` и `/api/metrics/fetch` в `index.js` с кэшем 5 мин, ленивой загрузкой `.env`
- [x] **Сервер:** `metrics.ts` — прокси на VPS для `/api/metrics/check` и `/api/metrics/fetch` + CRUD `connected_platforms` в SQLite
- [x] **БД:** таблица `connected_platforms` — автосоздание при старте сервера
- [x] **SettingsPage:** блок «Подключенные площадки» — Telegram, YouTube, VK, Instagram с полем и кнопкой «Проверить»
- [x] **PlatformMetrics.tsx:** универсальный компонент метрик площадки (подписчики, ER, CV, таблица постов)
- [x] **AnalyticsPage:** динамические табы из подключенных площадок
- [x] **Dashboard:** блок «Аудитория» с карточками подписчиков по площадкам

### Онбординг: импорт канала
- [x] **VPS:** `fetchTelegramPosts` (парсинг `t.me/s/` — последние 20 постов с текстом/датой/просмотрами)
- [x] **Сервер:** `POST /api/onboarding/:projectId/import-channel` — стягивание постов с площадки → сохранение в knowledge → AI-анализ (ниша, тон, стиль, ЦА, рубрики, темы) → создание рубрик/тем в БД
- [x] **Вкладки:** Telegram + YouTube + **VK** + **Дзен** + **Instagram**
- [x] **VK:** `server/src/services/vk.ts` — `fetchVKPosts()` (resolveScreenName → wall.get → groups.getById)
- [x] **VK Service Key:** `196b7984...` — автосидится в `settings` таблицу при старте сервера
- [x] **Дзен:** `server/src/services/zen.ts` — парсинг статьи по URL (HTML → JSON-LD → текст). Одна статья = один пост.
- [x] **Instagram:** `server/src/services/instagram.ts` — oEmbed API (caption + author) + опциональное описание визуала для рилсов/каруселей

### Прочее
- [x] **VPS:** метрики читают `.env` самостоятельно при импорте (фикс ленивой загрузки)
- [x] **constants.ts:** YouTube добавлен в `PLATFORM_OPTIONS` и `PLATFORM_COLORS`
- [x] Все `try/catch` в metrics-роутах, роутер смонтирован до `requireLicense`

## Как выпустить релиз

Подробная инструкция — в `RELEASE_INSTRUCTIONS.md`.

---



## Сессия 4 (2026-07-01) — VK + Дзен + Instagram импорт

**Сделано:**
- `server/src/services/vk.ts` — VK API: `resolveScreenName` → `wall.get` → `groups.getById`
- VK работает напрямую с сервера (Service Key в `settings` таблице), не через VPS
- `server/src/services/zen.ts` — парсинг статей Дзен по URL: JSON-LD → HTML-парсинг → чистый текст
- `server/src/services/instagram.ts` — oEmbed API (caption + author) + описание визуала
- Вкладки: Telegram + YouTube + VK + Дзен + Instagram в Step 1 UnpackPage
- Для Instagram: отдельное поле «Описание визуала» для рилсов/каруселей
- Для Дзена: одна ссылка = одна статья, текст парсится автоматически
- `version.txt` → 1.0.14

---

## Сессия 3 (2026-07-01) — Метрики площадок + импорт канала

**Сделано:**
- VPS: `metrics.mjs` с функциями `checkTelegram`, `checkYouTube`, `checkVK`, `checkInstagram` + кэш + парсинг идентификаторов
- VPS: `fetchTelegramPosts` для парсинга `https://t.me/s/channel` (HTML → текст, дата, просмотры)
- Сервер: `metrics.ts` — прокси на VPS для всех метрик + CRUD `connected_platforms`
- Сервер: `POST /api/onboarding/:projectId/import-channel` — импорт и AI-анализ канала
- Фронтенд: PlatformMetrics (метрики), AnalyticsPage (динамические табы), Dashboard (блок аудитории), SettingsPage (подключение площадок)
- Фронтенд: вкладка «Импорт канала» в Step 1 UnpackPage
- Фикс: VPS metrics.mjs читает .env на уровне модуля (не после импорта)

---

## Сессия 2 (2026-06-30) — Лицензирование

Выпущен v1.0.11 на CI. Обнаружена проблема с версией:
- `version.txt` не копируется в билд (electron-builder не использует `scripts/build-release.sh`)
- В настройках отображается `0.0.0` (текущая) и `1.0.11` (доступна)

**Сделано:**
- Создан DEVEL.md
- Обновлён `version.txt` → 1.0.12
- Добавлен `version.txt` в `extraResources` package.json
- **VPS:** добавлены эндпоинты `/api/request-license`, `/api/admin/login`, `/api/admin/requests`, `/api/admin/generate-from-request`, CORS, `.env`, rate limiting
- **VPS:** создана `admin.html` — логин по admin-secret, дашборд заявок + ключей, генерация ключа по кнопке
- **VPS:** настроен `.env` с `BOT_TOKEN` и `ADMIN_CHAT_ID`
- **VPS:** починен `admin.sh` — лишний текст в `health)`
- **Десктоп:** `LicenseGate.tsx` — форма «Купить лицензию» (выбор срока + email → запрос на VPS)
- **Десктоп:** создан `useRequestLicense.ts` хук

---

## Ресурсы

- **Админка:** http://80.87.111.142:4000/admin
- **Бот:** https://t.me/fabric_content_admin_bot
- **Admin-secret:** `fbr_a7k9m2x4_zq8w`
- **VPS:** root@80.87.111.142 (пароль в Termius)
- **Лог сервера:** `journalctl -u fabrika-license -f`
