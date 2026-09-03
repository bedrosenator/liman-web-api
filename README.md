# Liman Web API - E-commerce Sync Engine

Высокопроизводительный сервис синхронизации каталогов, остатков, цен и заказов между учетными базами данных **Limansoft** (MariaDB/MySQL) и маркетплейсами (**Prom.ua**, **WooCommerce**, **Rozetka**, **Horoshop**).

---

## 🚀 Быстрый старт

### 1. Требования
- Node.js >= 20
- Docker & Docker Compose (для Redis и локальной MariaDB)

### 2. Запуск зависимостей (Redis для очередей BullMQ)
```bash
docker compose up -d redis
```

### 3. Установка и сборка
```bash
npm install
npm run build
```

### 4. Запуск приложения
```bash
# Режим разработки с hot-reload
npm run start:dev

# Продакшен запуск
npm run start:prod
```

---

## 📚 Документация API (Swagger)

Интерактивная спецификация доступна в браузере:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

---

## 🔌 Основные эндпоинты

### 🏢 Управление клиентами (Tenants)
- `GET /api/v1/tenants` — Список клиентов
- `POST /api/v1/tenants` — Создать нового клиента (настройки подключения к MariaDB)
- `PATCH /api/v1/tenants/:id` — Обновить параметры клиента

### 🗄️ Limansoft Каталог и Остатки
- `GET /api/v1/liman/:tenantId/ping` — Проверить связь с MariaDB клиента
- `GET /api/v1/liman/:tenantId/categories` — Дерево категорий (таблица `name`)
- `GET /api/v1/liman/:tenantId/products` — Каталог товаров с остатками и ценами
- `GET /api/v1/liman/:tenantId/products/:tcod` — Детальная карточка товара
- `PATCH /api/v1/liman/:tenantId/stock/:tcod` — Изменить остаток в `name2ost`

### 🖼️ Стриминг картинок (BLOB -> HTTP URL)
- `GET /api/v1/media/:tenantId/products/:tcod/:photoIndex.jpg`
  - Поддержка ETag и HTTP 304 (Not Modified).
  - Отдает бинарное фото из `namedesc` либо SVG placeholder.

### 📦 Prom.ua Интеграция
- `GET /api/v1/prom/:tenantId/feed.xml` — Потоковый YML фид каталога для Prom.ua
- `POST /api/v1/prom/:tenantId/webhook/order` — Вебхук заказа для авто-списания остатков

### ⚡ Очереди и Задачи (BullMQ)
- `POST /api/v1/sync/:tenantId/stock` — Запустить фоновую синхронизацию цен и остатков
- `GET /api/v1/sync/jobs/:queueName/:jobId` — Проверить статус выполнения и прогресс в %

---

## 📋 Интеграция с Trello и AI-Агенты

Задачи проекта хранятся в `.agents/task-board.md` и синхронизируются с Trello:
```bash
node scripts/sync-trello.mjs
```
Доска Trello: **[Liman Web API в Trello](https://trello.com/b/ZtqD0KZw/liman-web-api)**

Подробный отчет о выполненных работах доступен в файле [PROGRESS_REPORT.md](./PROGRESS_REPORT.md).
