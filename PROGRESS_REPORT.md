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

## 🚀 4. План на Спринт 2

1. **Безопасность и авторизация (Security & Auth):**
   - Защита эндпоинтов Master API Key (`x-api-key`) и Tenant API Key.
   - JWT Guard для панели управления.
2. **WooCommerce Integration (TASK-12):**
   - REST API клиент для WooCommerce v3 (`/wp-json/wc/v3`).
   - Синхронизация каталога, остатков и цен.
3. **Фирменный плагин WordPress/WooCommerce (`liman-sync-for-woocommerce`):**
   - Отдельный готовый плагин для продажи / дистрибуции в магазины клиентов.
   - Настройки подключения (API URL, API Key, Tenant ID, выбор цен и складов).
   - Кнопка ручной синхронизации каталога.
   - Автоматическая синхронизация по WP-Cron и Webhook при оформлении заказа в WooCommerce для мгновенного списания в Limansoft.
4. **Rozetka Integration (TASK-11):**
   - Генерация XML прайс-листа Rozetka и клиент Seller API.
