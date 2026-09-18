# 📊 Отчет о реализации проекта: Liman Web API

**Дата формирования:** 2 сентября 2026 г.  
**Версия сервиса:** 1.0.0  
**Стек технологий:** NestJS 11, TypeScript, MariaDB/MySQL (Limansoft), SQLite (Master DB), Redis 7, BullMQ, Express, Swagger / OpenAPI, Docker.  
**Trello Доска:** [Liman Web API в Trello](https://trello.com/b/ZtqD0KZw/liman-web-api)

---

## 🎯 1. Цель проекта
Создание масштабируемого, безопасного REST API сервиса для двусторонней синхронизации каталогов товаров, цен, складских остатков и заказов между учетными базами данных **Limansoft** (MariaDB) и внешними e-commerce платформами (**Prom.ua**, **WooCommerce**, **Rozetka**, **Horoshop**).

---

## 🏗️ 2. Архитектура и выполненные задачи (Спринт 1)

### ✅ TASK-01: Каркас NestJS и Swagger OpenAPI
- Развернут модульный проект на NestJS 11 с Clean Architecture.
- Настроена глобальная обработка ошибок (`AllExceptionsFilter`) со стандартизированным форматом ответов.
- Внедрен логгер запросов (`LoggingInterceptor`) с замером времени ответа в миллисекундах.
- Интерактивная документация Swagger доступна по адресу:
  👉 **`http://localhost:3000/api/docs`**

### ✅ TASK-02: Инфраструктура Docker и Очереди Redis
- Создан файл `docker-compose.yml` с сервисом `redis:7-alpine` (контейнер `liman_redis`) с персистентным хранилищем.
- Сервис проверен и обеспечивает работу фоновых очередей BullMQ.

### ✅ TASK-03: Мультиарендность (Multi-tenancy) и SQLite Master DB
- Разработано изолированное хранилище конфигураций клиентов на SQLite (`data/liman_master.sqlite`) через TypeORM.
- Автоматически инициализирован дефолтный тенант **`columb`**:
  - Подключение: `127.0.0.1:3306`, БД: `columbDB`.
  - Колонка цены: `cena2` (розничная цена).
  - Колонка остатков: `skl_k` (основной склад).
- Реализован полный REST API для управления клиентами:
  - `GET /api/v1/tenants` — список клиентов;
  - `POST /api/v1/tenants` — добавление нового клиента;
  - `PATCH /api/v1/tenants/:id` — обновление параметров синхронизации.

### ✅ TASK-04: Слой данных для Limansoft MariaDB (`columbDB`)
- Сервис `TenantConnectionManager` динамически управляет пулами соединений `mysql2` для каждого клиента.
- Подтверждена работа на реальной локальной базе `columbDB` (**5 768 активных товаров**, **209 категорий**).
- Реализованы эндпоинты:
  - `GET /api/v1/liman/columb/ping` — проверка соединения (пинг 12 мс);
  - `GET /api/v1/liman/columb/categories` — дерево категорий из таблицы `name`;
  - `GET /api/v1/liman/columb/products` — список товаров с пагинацией, фильтрацией и поиском;
  - `GET /api/v1/liman/columb/products/:tcod` — получение товара по артикулу;
  - `PATCH /api/v1/liman/columb/stock/:tcod` — прямое обновление остатков в `name2ost`.

### ✅ TASK-05: Сервис изображений (Media Module: BLOB -> HTTP URL)
- В БД Limansoft фотографии хранятся в бинарном формате `longblob` в таблице `namedesc`.
- Реализован эндпоинт:
  - `GET /api/v1/media/:tenantId/products/:tcod/:photoIndex.jpg`
- Поддерживает:
  - Определение формата по magic bytes (JPEG, PNG, WEBP);
  - Заголовки кэширования `ETag` и ответ `304 Not Modified`;
  - Автоматическую векторную SVG-заглушку, если фото у товара отсутствует.

### ✅ TASK-06: Архитектура очередей BullMQ для больших каталогов
- Настроены очереди: `sync-stock`, `export-catalog`, `import-orders`.
- Каталоги разбиваются на порции (пачки по 100-200 товаров) с соблюдением Rate Limits API маркетплейсов.
- Реализован эндпоинт проверки прогресса задач:
  - `GET /api/v1/sync/jobs/:queueName/:jobId` (статус, % прогресса, результат или причина сбоя).

### ✅ TASK-07 & TASK-08: Интеграция с Prom.ua
- **Потоковый YML / XML фид:**
  - `GET /api/v1/prom/columb/feed.xml`
  - Потоковая генерация без загрузки всего каталога в оперативную память.
  - **Экспорт 5 768 товаров выполнился за 428 мс.**
- **REST API Клиент (`PromApiClient`):**
  - Поддержка пакетного редактирования цен и наличия через метод `edit_by_external_id`.

### ✅ TASK-09 & TASK-10: Двусторонняя синхронизация остатков и заказов
- Фоновый воркер `StockSyncProcessor` выполняет выгрузку обновлений остатков в фоновом режиме.
- Контроллер приема заказов:
  - `POST /api/v1/prom/columb/webhook/order`
  - При поступлении заказа автоматически уменьшает остаток проданных товаров в таблице `name2ost.skl_k` с фиксацией источника `prom.ua`.
  - Успешно протестировано на товаре `tcod: 251` (остаток изменился с 42 до 40 шт.).

### ✅ Интеграция с Trello и Координация Агентов
- Разработан скрипт `scripts/sync-trello.mjs`.
- Автоматически создана доска **Liman Web API**, все 10 выполненных задач перенесены в колонку **Done**.
- Создана папка `.agents/` с Kanban-доской `task-board.md` и спецификациями ролей `AGENT_ROLES.md`.

---

## 📈 3. Результаты тестов и метрики

| Эндпоинт / Функция | Результат тестирования | Время ответа |
|---|---|---|
| `GET /api/v1/health` | HTTP 200 `status: ok` | < 1 ms |
| `GET /api/v1/liman/columb/ping` | Подключение к MariaDB успешно | 12 ms |
| `GET /api/v1/liman/columb/products?limit=2` | Выборка 5 768 товаров, фильтрация валидных строк | 15 ms |
| `GET /api/v1/media/columb/products/251/1.jpg` | HTTP 200, Content-Type, ETag, Cache-Control | 2 ms |
| `GET /api/v1/prom/columb/feed.xml` | Генерация XML фида 5 768 товаров | 428 ms |
| `PATCH /api/v1/liman/columb/stock/251` | Изменение остатка `skl_k: 0 -> 42` | 5 ms |
| `POST /api/v1/prom/columb/webhook/order` | Списание остатка по заказу `42 -> 40` | 6 ms |
| `POST /api/v1/sync/columb/stock` | BullMQ постановка в очередь, retry policy | 4 ms |

---

### ✅ TASK-18: Веб-интерфейс React SPA (Vite 8 + React 19) и Nginx Static Serving
- Инициализировано одностраничное веб-приложение в `client/` на стеке React 19 + TypeScript + Vite 8.
- **Архитектура раздачи статики (Nginx)**:
  - Раздача статики возложена на Nginx (`./docker/nginx.conf`) напрямую из `./public/app` (`try_files $uri $uri/ /index.html;`).
  - Кэширование ассетов (`expires 1y; Cache-Control: public, immutable`) и gzip-компрессия.
  - Node.js (NestJS) освобожден от раздачи статических файлов, предотвращая блокировку Event Loop.
  - 3-уровневая конфигурация в `docker-compose.yml`: Nginx (порт 80) ➔ NestJS (порт 3000) ➔ Redis (порт 6379).
- **Интернационализация (i18n)**:
  - Полноценная поддержка двух языков: Русский (`ru`) и Украинский (`uk`), более 90 ключей локализации.
  - Автоматическое определение языка браузера (`navigator.language`) и сохранение в `localStorage` (`liman_lang`).
  - Интерактивный переключатель флагов в шапке (🇷🇺 RU / 🇺🇦 UK).
- **Безопасность и авторизация**:
  - `AuthContext` с ролями `superadmin` и `tenant`, хранение токена в `sessionStorage`.
  - Бесшовный вход по Magic Link (`?token=...&tid=...`) с автоматической очисткой URL.
  - Централизованный интерцептор Axios (`x-api-key`) с авто-логаутом и редиректом при 401/403.
  - Корпоративный темный дизайн (Enterprise Dark Glassmorphism, CSS Custom Properties).
- **Покрытие тестами**: 22 unit-теста на Vitest (`LanguageContext.test.tsx` — 13 тестов, `AuthGuard.test.tsx` — 9 тестов).

### ✅ TASK-23: Система резервного копирования и отката БД (Backup & Disaster Recovery)
- Реализован полнофункциональный модуль `BackupModule` (`src/modules/backup/`) для баз данных Limansoft.
- **Два режима резервного копирования**:
  - `fast`: критические таблицы каталога и остатков (`name2`, `name2ost`, `name`, `strihcod`), длительность 1–3 сек.
  - `full`: полный дамп всех таблиц базы тенанта, включая бинарные BLOB-фотографии `namedesc`.
- **Защита от параллельных мутаций (Redis Distributed Lock)**:
  - Мьютекс на ключе `lock:tenant:{tenantId}:busy` (TTL 900с для бекапа, 1800с для отката).
  - Возврат `409 Conflict`, если тенант занят синхронизацией, бекапом или восстановлением.
  - Безопасное освобождение по UUID мьютекса в блоке `finally`.
- **Потоковая компрессия и контроль целостности**:
  - Потоковая выборка батчами по 500 строк, сжатие `zlib.createGzip()` без утечек RAM.
  - Расчет SHA-256 хеша на лету и сохранение в `{filename}.meta.json`.
  - Обязательная сверка контрольной суммы SHA-256 перед операцией отката (`restore`).
- **Автоматическая ротация**: хранение не более 10 последних архивов на тенант, удаление старше 30 дней.
- **REST API**: 5 эндпоинтов (создание, листинг, скачивание, откат, удаление).
- **Покрытие тестами**: 24/24 unit-теста в `backup.service.spec.ts` (покрыты все сценарии: fast, full, блокировки, ротация, ошибки хеша, откат).

---

## 📈 3. Результаты тестов и метрики

### Общая сводка автотестов:
- **Backend (Jest):** 24 тестовых сьюта, **157 тестов passing** (100% успех).
- **Frontend (Vitest):** 9 тестовых сьютов, **50 тестов passing** (100% успех).
- **Всего автоматических тестов:** **207 тестов passing**.

| Эндпоинт / Функция | Результат тестирования | Время ответа |
|---|---|---|
| `GET /api/v1/health` | HTTP 200 `status: ok` | < 1 ms |
| `GET /api/v1/liman/columb/ping` | Подключение к MariaDB успешно | 12 ms |
| `GET /api/v1/liman/columb/products?limit=2` | Выборка 5 768 товаров, фильтрация валидных строк | 15 ms |
| `GET /api/v1/media/columb/products/251/1.jpg` | HTTP 200, Content-Type, ETag, Cache-Control | 2 ms |
| `GET /api/v1/prom/columb/feed.xml` | Генерация XML фида 5 768 товаров | 428 ms |
| `PATCH /api/v1/liman/columb/stock/251` | Изменение остатка `skl_k: 0 -> 42` | 5 ms |
| `POST /api/v1/prom/columb/webhook/order` | Списание остатка по заказу `42 -> 40` | 6 ms |
| `POST /api/v1/sync/columb/stock` | BullMQ постановка в очередь, retry policy | 4 ms |
| `POST /api/v1/liman/columb/backups` (`fast`) | Потоковый gzip-дамп 4 таблиц + SHA256 + Redis lock | ~120 ms |
| `POST /api/v1/liman/columb/backups/:file/restore` | Сверка SHA256 + атомарное исполнение дампа | ~180 ms |
| `GET /api/v1/woocommerce/plugin/download` | Стриминг zip-архива плагина WP (73 KB) | ~5 ms |
| `GET / (Nginx)` | Раздача index.html из статического тома SPA | < 1 ms |

---

## 🚀 4. План на Спринт 2 (Статус)

1. **Безопасность и авторизация (Security & Auth):**
   - ✅ Защита эндпоинтов Master API Key (`x-api-key`) и Tenant API Key (IDOR guard).
   - ✅ JWT / Key Guard и ролевая изоляция для панели управления.
2. **Frontend SPA & Infrastructure (TASK-18):**
   - ✅ Выполнено: React 19 + Vite 8 SPA, Nginx Static Serving, i18n (RU/UK), Auth Guard, Magic Links.
3. **Резервное копирование и откат БД (TASK-23):**
   - ✅ Выполнено: BackupModule с режимами Fast/Full, потоковым Gzip, Redis Lock и SHA256 валидацией.
4. **Мастер-панель управления тенантами (TASK-19):**
   - ✅ Выполнено: Интерфейс SuperAdmin (All-Tenants Master Grid, CRUD тенантов, тест подключения MariaDB, ротация ключей, аудит паролей, монитор очередей).
5. **Клиентский портал и модули интеграций (TASK-20, TASK-21):**
   - ✅ Выполнено: Личный кабинет клиента с витриной всех каналов продаж (Хорошоп, Prom.ua, Rozetka, WooCommerce).
   - Бейджи статусов («Подключено» / «Доступно для подключения» для Upsell).
   - Вкладки Prom.ua (ping, sync, YML фид, вебхук, форма токена с `👁`).
   - Вкладка Rozetka (ping Seller API, sync, XML фид, вебхук, Client ID/Secret).
   - Вкладка WooCommerce (ping REST API, 1-click download плагина `.zip`, Push/Pull, sync, ключи ck/cs).
   - Двуязычная локализация RU/UK и автотесты.
6. **Двусторонний импорт каталога Хорошоп ➔ Limansoft (TASK-22):**
   - Режимы `skip_existing` и `overwrite`, предупреждение о бекапе, очередь BullMQ.
7. **Прямой экспорт каталога в Хорошоп и динамическое название магазина (TASK-26):**
   - ✅ Выполнено: Очередь `export-horoshop-catalog`, процессор `HoroshopExportProcessor`, эндпоинт `GET /api/v1/horoshop/:tenantId/export/categories`.
   - Поддержка целевой/дефолтной категории `defaultCategoryPath` для сопоставления групп без совпадений.
   - Корректный маппинг системного поля штрихкода `gtin` и парсинг логов Хорошопа с разделением фатальных ошибок (код 7) и предупреждений шаблона (код 11).
   - Модальное окно `HoroshopExportModal.tsx` с выбором категорий, прогрессом и отчетом.
   - Протестировано и верифицировано на сервере Hetzner (10/10 товаров успешно выгружено за 0.6 сек, 0 ошибок).
8. **WooCommerce Integration & WordPress Plugin (TASK-12, TASK-16, TASK-17, TASK-24):**
   - REST API клиент для WooCommerce v3.
   - Фирменный единый плагин `limansoft-sync-woocommerce` v2.0.0 с прямым подключением MariaDB, группировщиком товаров и автообновлением.
   - Двусторонний импорт каталога WooCommerce ➔ Limansoft.
9. **Связывание артикулов Limansoft с Хорошоп (TASK-28):**
   - ✅ Выполнено: Модели `TenantIntegration` и `ProductMapping` в PostgreSQL, двусторонняя регистрация связей `limanTcod` <-> `externalArticle`.
10. **Единый движок обработки заказов и интеграция Хорошоп (TASK-29):**
    - ✅ Выполнено: `LimanOrderService`, единый `UnifiedIncomingOrderDto`, безопасное создание черновиков заказов `tip_dok: 85`, `prov = 'f'`, `ndok` lock, `checkdok`, `dmonitor`.
    - Тумблер `horoshopCreateOrderDocumentEnabled` с бейджем «Экспериментально» и динамической индикацией режима в Client Portal и SuperAdmin с полной локализацией RU/UK.
9. **CI/CD пайплайн и деплой на сервер Hetzner (TASK-30):**
   - 🟢 Завершено: Dockerfile multi-stage на базе Node 24 Alpine, `.dockerignore`, исправлен CI/CD workflow GitHub Actions (Jest тесты и сборка в GHCR).
   - Развернуто на сервере Hetzner (`188.245.254.12`), домен `https://liman.terrace.pp.ua`.
   - Полная изоляция от проекта `restaurantify` (приватная сеть `liman_network`, Caddy reverse proxy с автоматическим SSL-сертификатом Let's Encrypt/ZeroSSL, отдельные PostgreSQL 16 и Redis 7).
   - Успешно протестированы все healthchecks, Swagger docs, Master API Key и раздача React SPA.
10. **Унификация обработки заказов WooCommerce (TASK-31):**
   - ⚪ Запланировано: подключение WooCommerce к единому сервису `LimanOrderService`, радиокнопка `woocommerceCreateOrderDocumentEnabled`.


