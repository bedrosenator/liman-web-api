# 📋 Kanban Доска Проекта: Liman Web API

Синхронизируется с Trello и используется для координации AI-агентов и разработчиков.

---

## 📌 Колонка: Backlog (Бэклог)
- [ ] **[TASK-14]** Двусторонний импорт каталога из внешних магазинов в Limansoft DB (`name`, `name2`, `strihcod`)
- [ ] **[TASK-15]** Webhook notifications & Telegram alert bot для критических ошибок синхронизации

---

## 🎯 Колонка: To Do (Спринт 2: Следующие интеграции)
- [ ] **[TASK-14]** Двусторонний импорт каталога из внешних магазинов в Limansoft DB (`name`, `name2`, `strihcod`)
- [ ] **[TASK-15]** Webhook notifications & Telegram alert bot для критических ошибок синхронизации

---

## ⚙️ Колонка: In Progress (В работе)
- *(Готово к запуску следующей задачи)*

---

## 🔍 Колонка: In Review / QA (Тестирование и код-ревью)
- [x] Верификация Swagger UI: `http://localhost:3000/api/docs`
- [x] Верификация Prom XML фида: `http://localhost:3000/api/v1/prom/columb/feed.xml`
- [x] Верификация Rozetka XML фида: `http://localhost:3000/api/v1/rozetka/columb/feed.xml`
- [x] Верификация Horoshop XML фида: `http://localhost:3000/api/v1/horoshop/columb/feed.xml`
- [x] Верификация Horoshop Webhook заказа с авто-списанием остатка в MariaDB
- [x] Верификация WooCommerce REST API (Ping, Batch sync 5768 товаров, Auto-sync toggle)
- [x] WordPress плагин `limansoft-sync-woocommerce.zip` готов к установке

---

## ✅ Колонка: Done (Выполнено)
- [x] **[TASK-13]** Интеграция с Хорошоп (Horoshop / Cartum API: потоковый XML фид `/horoshop/:tenantId/feed.xml`, API клиент с JWT/session auth, синхронизация цен/остатков, webhook заказов с автосписанием)
- [x] **[TASK-11]** Интеграция с Rozetka Marketplace API (XML фид `/rozetka/:tenantId/feed.xml`, Seller API клиент с JWT-авторизацией, обновление остатков/цен, webhook заказов с автосписанием)
- [x] **[TASK-12]** Интеграция с WooCommerce REST API (Batch upsert с автоматическим определением create/update по SKU, delta sync, webhook заказов, отдельный WP плагин с UI и настраиваемым cron-расписанием)
- [x] **[TASK-01]** Инициализация NestJS 11, TypeScript, Swagger OpenAPI (`/api/docs`), модульная Clean Architecture
- [x] **[TASK-02]** Инфраструктура: Docker Compose с Redis для очередей BullMQ, проверено подключение
- [x] **[TASK-03]** Модуль мультиарендности (`TenantModule`) + локальная SQLite БД клиентов с авто-сидингом тенанта `columb`
- [x] **[TASK-04]** Data Access Layer для Limansoft MariaDB (`columbDB`: `name`, `name2`, `name2ost`, `namedesc`, `strihcod`, `dmonitor`). 5 768 активных SKU
- [x] **[TASK-05]** Сервис изображений (`MediaModule`): извлечение BLOB из `namedesc`, ETag, HTTP 304 кэширование и SVG placeholder
- [x] **[TASK-06]** Движок очередей BullMQ: очереди `sync-stock`, `export-catalog`, `import-orders`, отслеживание прогресса и API статуса
- [x] **[TASK-07]** Клиент Prom.ua REST API (`PromApiClient`) с типизацией и пакетными запросами
- [x] **[TASK-08]** Потоковый генератор Prom.ua YML/XML фида (`/api/v1/prom/columb/feed.xml`) — выгружает 5 768 товаров за ~430ms с минимальным потреблением RAM
- [x] **[TASK-09]** Фоновый синхронизатор остатков и цен через BullMQ (`StockSyncProcessor`)
- [x] **[TASK-10]** Webhook приема заказов из Prom.ua (`/api/v1/prom/columb/webhook/order`) с автоматическим списанием остатков в `name2ost`
