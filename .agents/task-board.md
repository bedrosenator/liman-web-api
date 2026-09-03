# 📋 Kanban Доска Проекта: Liman Web API

Синхронизируется с Trello и используется для координации AI-агентов и разработчиков.

---

## 📌 Колонка: Backlog (Бэклог)
- [ ] **[TASK-11]** Интеграция с Rozetka Marketplace API (Экспорт каталога + XML фид)
- [ ] **[TASK-12]** Интеграция с WooCommerce REST API (Bi-directional sync)
- [ ] **[TASK-13]** Интеграция с Хорошоп (Horoshop API)
- [ ] **[TASK-14]** Двусторонний импорт каталога из внешних магазинов в Limansoft DB (`name`, `name2`, `strihcod`)
- [ ] **[TASK-15]** Webhook notifications & Telegram alert bot для критических ошибок синхронизации

---

## 🎯 Колонка: To Do (Спринт 2: Следующие интеграции)
- [ ] **[TASK-11]** Интеграция с Rozetka Marketplace API (валидация параметров и фид)
- [ ] **[TASK-12]** Интеграция с WooCommerce REST API (синхронизация товаров и остатков)

---

## ⚙️ Колонка: In Progress (В работе)
- *(Готово к запуску следующего спринта)*

---

## 🔍 Колонка: In Review / QA (Тестирование и код-ревью)
- [x] Верификация Swagger UI: `http://localhost:3000/api/docs`
- [x] Верификация Prom XML фида: `http://localhost:3000/api/v1/prom/columb/feed.xml`
- [x] Верификация очереди BullMQ и стриминга BLOB-фото

---

## ✅ Колонка: Done (Выполнено в Спринте 1)
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
