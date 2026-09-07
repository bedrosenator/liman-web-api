# Liman Web API — E-commerce Sync Engine

Высокопроизводительный мультитенантный микросервис синхронизации каталогов, складских остатков, цен и заказов между учетными базами данных **Limansoft** (MariaDB / MySQL) и внешними e-commerce платформами: **WooCommerce**, **Rozetka**, **Prom.ua** и **Horoshop**.

---

## 📑 Содержание

1. [Возможности системы](#-возможности-системы)
2. [Архитектура и принцип работы](#-архитектура-и-принцип-работы)
3. [Интеграция с WooCommerce](#-интеграция-с-woocommerce)
4. [Интеграция с Rozetka Marketplace](#-интеграция-с-rozetka-marketplace)
5. [Интеграция с Prom.ua](#-интеграция-с-promua)
6. [Медиа-сервис (BLOB в HTTP)](#-медиа-сервис-blob--http-url)
7. [Фоновые очереди (BullMQ)](#-фоновые-очереди-bullmq)
8. [Полный справочник REST API](#-полный-справочник-rest-api)
9. [Установка и запуск](#-установка-и-запуск)
10. [Управление клиентами (Tenants)](#-управление-клиентами-tenants)
11. [Безопасность и авторизация](#-безопасность-и-авторизация)

---

## ⚡ Возможности системы

- **Мультиарендность (Multi-Tenancy)**: один инстанс API может обслуживать множество независимых магазинов/клиентов. У каждого клиента свои учетные данные к базе данных Limansoft и персональные ключи к маркетплейсам.
- **Двусторонняя синхронизация с WooCommerce**:
  - Пакетная выгрузка каталога (товары, категории, цены, остатки, изображения).
  - Быстрое фоновое обновление цен и остатков без повторной загрузки описаний и медиа.
  - Готовый WordPress-плагин с гибким планировщиком (WP-Cron 15 / 30 / 60 минут), возможностью отключения в 1 клик и поддержкой WooCommerce HPOS.
- **Интеграция с Rozetka Marketplace**:
  - Генерация потокового YML/XML фида каталога для модерации и первичного импорта.
  - Прямое обновление остатков и цен через Rozetka Seller API (JWT-авторизация с кэшированием токена, отправка батчами по 100 позиций).
  - Приём вебхуков заказов Rozetka для мгновенного списания остатков в Limansoft.
- **Интеграция с Prom.ua**:
  - Потоковый YML фид каталога с CDATA-описаниями, ценами и категориями.
  - Приём вебхуков новых заказов для авто-списания складских остатков.
- **Мгновенный стриминг изображений из BLOB**:
  - Картинки товаров хранятся в Limansoft в таблице `namedesc` в бинарном формате. Сервис отдает их по чистому HTTP URL с поддержкой HTTP 304 (ETag / Not Modified) и умной SVG-заглушкой при отсутствии фото.
- **Асинхронные очереди (BullMQ + Redis)**:
  - Обработка каталогов любого объема (10 000+ SKU) в фоновых процессах без блокировки HTTP-запросов и с отслеживанием прогресса в процентах.

---

## 🏛️ Архитектура и принцип работы

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                            Маркетплейсы и Магазины                     │
   │                                                                        │
   │   ┌────────────────┐      ┌─────────────────┐     ┌────────────────┐   │
   │   │  WooCommerce   │      │     Rozetka     │     │    Prom.ua     │   │
   │   │ (WP Plugin)    │      │   Seller API    │     │   (YML Feed)   │   │
   │   └───────▲────────┘      └────────▲────────┘     └───────▲────────┘   │
   └───────────┼────────────────────────┼──────────────────────┼────────────┘
               │ REST / Webhook         │ REST / XML Feed      │ Feed / Webhook
   ┌───────────▼────────────────────────▼──────────────────────▼────────────┐
   │                       Liman Web API (NestJS Core)                      │
   │                                                                        │
   │  [ApiKeyGuard] ──▶ [TenantConnectionManager] ──▶ [MediaService (BLOB)] │
   │                             │                              │           │
   │                             ▼                              ▼           │
   │                    [BullMQ Queue Engine] ──▶ Redis 7 (localhost:6379)  │
   └─────────────────────────────┬──────────────────────────────────────────┘
                                 │ Динамические пулы соединений (MySQL2)
   ┌─────────────────────────────▼──────────────────────────────────────────┐
   │                     Базы данных Limansoft (MariaDB)                    │
   │                                                                        │
   │  ┌──────────────┐   ┌───────────────┐   ┌───────────────────────────┐  │
   │  │    name2     │   │   name2ost    │   │         namedesc          │  │
   │  │   (Товары,   │   │   (Остатки    │   │   (Описания и фотографии  │  │
   │  │  tcod, цены) │   │  по складам)  │   │        в формате BLOB)    │  │
   │  └──────────────┘   └───────────────┘   └───────────────────────────┘  │
   │  ┌──────────────┐   ┌───────────────┐   ┌───────────────────────────┐  │
   │  │     name     │   │   strihcod    │   │         dmonitor          │  │
   │  │ (Категории)  │   │  (Штрихкоды)  │   │    (Монитор изменений)    │  │
   │  └──────────────┘   └───────────────┘   └───────────────────────────┘  │
   └────────────────────────────────────────────────────────────────────────┘
```

### Как устроена связка данных:
1. **Код товара (`tcod`)**: уникальный первичный числовой идентификатор в таблице `name2`. Он транслируется как:
   - **SKU** в WooCommerce.
   - **id** и **article** в фидах и API Rozetka.
   - **id** в фидах Prom.ua.
2. **Остатки (`name2ost`)**: колонка `skl_k` (или заданная в конфиге тенанта). Списание остатка при заказе на любой платформе происходит атомарно через прямой SQL-запрос `UPDATE name2ost SET ...`.
3. **Цены (`name2`)**: колонка `cena2` (розничная цена по умолчанию) или любая настроенная колонка (`cena1`, `cena3` и т.д.).
4. **Фотографии (`namedesc`)**: бинарные данные (BLOB), привязанные к `tcod`. API преобразует их в публичные ссылки:  
   `http://<host>/api/v1/media/:tenantId/products/:tcod/0.jpg`

---

## 🛒 Интеграция с WooCommerce

Интеграция состоит из двух частей: REST API сервиса и официального WordPress-плагина.

### 1. REST API модуль WooCommerce (`src/modules/woocommerce`)
- **Умный пакетный Upsert**: товары отправляются пачками по 50 штук через batch endpoint WooCommerce. Сервис предварительно сверяет существующие SKU, разделяя товары на `create` и `update`.
- **Надежность**: расширенный таймаут до 120 секунд для предотвращения обрывов при загрузке больших списков и тяжелых изображений.
- **Эндпоинты**:
  - `GET /api/v1/woocommerce/:tenantId/ping` — проверка соединения с WooCommerce (URL, Consumer Key, Consumer Secret).
  - `POST /api/v1/woocommerce/:tenantId/sync` — полная синхронизация каталога. Параметр `?limit=50` позволяет протестировать выгрузку на небольшой выборке. Параметр `?imageBaseUrl=` позволяет переопределить адрес картинок (актуально при работе через Docker).
  - `POST /api/v1/woocommerce/:tenantId/sync/stock` — быстрое обновление только цен и остатков.
  - `POST /api/v1/woocommerce/:tenantId/webhook/order` — публичный эндпоинт для приёма заказов из WooCommerce.

### 2. WordPress-плагин `Limansoft Sync for WooCommerce`
Готовый к установке архив находится в репозитории:  
👉 **`packages/dist/limansoft-sync-woocommerce.zip`**  
*(Исходный код: `packages/limansoft-sync-woocommerce/`)*

#### Возможности плагина:
- **Удобная страница настроек**: меню **WooCommerce → Limansoft Sync** в панели WordPress.
- **Проверка связи в 1 клик**: кнопка AJAX-проверки доступности Liman Web API.
- **Ручная синхронизация**: запуск полной или быстрой синхронизации с интерактивным прогресс-баром.
- **Гибкий планировщик без нагрузки на сервер**:
  - Встроенная задача WP-Cron с возможностью выбора интервала: **15**, **30** или **60 минут**.
  - **Мгновенное включение / выключение**: снятие галочки "Автоматическая синхронизация" сразу же удаляет задачу из WP-Cron, исключая любую фоновую нагрузку.
- **Автоматический вебхук оформления заказа**: при статусе заказа `processing` плагин мгновенно отправляет запрос на API, и остатки списываются в MariaDB Limansoft.
- **Совместимость**: полная поддержка HPOS (High-Performance Order Storage) и последних версий WooCommerce 9.x+ и WordPress 6.x+.

---

## 💚 Интеграция с Rozetka Marketplace

Модуль `src/modules/rozetka` обеспечивает полное взаимодействие с маркетплейсом Rozetka:

### 1. Потоковый YML/XML фид (`GET /api/v1/rozetka/:tenantId/feed.xml`)
- Генерирует стандартный YML-каталог формата Rozetka:
  - `<categories>` с сохранением иерархии категорий из `name`.
  - `<offers>`: остатки, валюта (UAH), цена, описание с поддержкой CDATA, производитель (`vendor`), ссылки на изображения.
- URL фида вставляется в личном кабинете **Rozetka Seller Center → Каталог → XML фид**.

### 2. Rozetka Seller API (`rozetka-api.client.ts` и `rozetka-sync.service.ts`)
- **Авторизация**: автоматическое получение JWT-токена по `rozetkaClientId` и `rozetkaClientSecret` с кэшированием в памяти и авто-продлением при истечении.
- **Проверка связи**: `GET /api/v1/rozetka/:tenantId/ping` возвращает статус авторизации и список магазинов продавца.
- **Пакетная синхронизация цен и остатков**: `POST /api/v1/rozetka/:tenantId/sync/prices-stocks`
  - Считывает актуальные остатки и цены из MariaDB.
  - Отправляет обновления в Rozetka Seller API порциями по 100 товаров (`/items/stocks-sync` и `/items/prices-sync`).

### 3. Вебхук новых заказов Rozetka (`POST /api/v1/rozetka/:tenantId/webhook/order`)
- При получении уведомления от Rozetka извлекает позиции заказа:
  - `article` сопоставляется с `tcod` в базе Limansoft.
  - Поле `quantity` списывается из остатка таблицы `name2ost`.
- Возвращает детальный отчет со старыми и новыми остатками.

---

## 🟣 Интеграция с Prom.ua

Модуль `src/modules/prom`:
- `GET /api/v1/prom/:tenantId/feed.xml` — потоковый XML-фид каталога в формате Prom YML.
- `POST /api/v1/prom/:tenantId/webhook/order` — обработчик входящих заказов для списания остатков в Limansoft.

---

## 🛍️ Интеграция с Хорошоп (Horoshop / Cartum)

Модуль `src/modules/horoshop` реализует интеграцию с платформой Хорошоп:

### 1. Потоковый XML/YML фид (`GET /api/v1/horoshop/:tenantId/feed.xml`)
- Генерирует XML-каталог для регулярного фонового авто-импорта витриной магазина Хорошоп (категории, актуальные цены, остатки, фото через `/media/`, артикулы, штрихкоды и описания).
- Данный URL указывается в панели Хорошоп в разделе импорта каталога по ссылке.

### 2. Horoshop REST API (`horoshop-api.client.ts` и `horoshop-sync.service.ts`)
- **Авторизация**: автоматическое получение токена сессии через `POST /api/auth/` с кэшированием в оперативной памяти и авто-продлением.
- **Проверка связи**: `GET /api/v1/horoshop/:tenantId/ping` возвращает статус авторизации и валидности учетных данных.
- **Пакетная синхронизация цен и остатков**: `POST /api/v1/horoshop/:tenantId/sync/prices-stocks` отправляет обновления партией в `/api/catalog/import/` магазина.
- **Заказы**: `GET /api/v1/horoshop/:tenantId/orders` для получения заказов через API платформы.

### 3. Вебхук оформления заказов (`POST /api/v1/horoshop/:tenantId/webhook/order`)
- При оформлении заказа на Хорошоп вебхук автоматически передает позиции, и сервис списывает остатки по `article` (`tcod`) из таблицы `name2ost` базы Limansoft.

---

## 🖼️ Медиа-сервис (BLOB ➔ HTTP URL)

В системе Limansoft изображения товаров хранятся в бинарном поле BLOB таблицы `namedesc`.  
Медиа-модуль преобразует их в стандартные URL:

```http
GET /api/v1/media/:tenantId/products/:tcod/:photoIndex.jpg
```
- **Производительность**: формируется заголовок `ETag` на основе контрольной суммы изображения. Если клиент передает `If-None-Match`, сервер возвращает `HTTP 304 Not Modified`, экономя полосу пропускания.
- **SVG-заглушка**: если у товара нет фотографии или индекс фото не найден, отдается векторный плейсхолдер с названием товара.

---

## ⚡ Фоновые очереди (BullMQ)

Для каталогов размером более 10 000 товаров синхронизация через синхронный HTTP-запрос нежелательна из-за таймаутов браузера и веб-серверов.

- **Запуск фоновой задачи**:
  ```http
  POST /api/v1/sync/:tenantId/stock
  ```
  Возвращает `jobId` и имя очереди `stock-sync`.
- **Мониторинг задачи**:
  ```http
  GET /api/v1/sync/jobs/:queueName/:jobId
  ```
  Возвращает текущее состояние (`waiting`, `active`, `completed`, `failed`), процент прогресса от 0 до 100% и ошибки в случае сбоя.

---

## 🔌 Полный справочник REST API

Интерактивная Swagger-документация с возможностью отправки тестовых запросов доступна по адресу:  
👉 **`http://localhost:3000/api/docs`**

### 🏢 1. Клиенты и настройки (Tenants)
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/tenants` | Список всех зарегистрированных клиентов |
| `POST` | `/api/v1/tenants` | Регистрация нового клиента |
| `GET` | `/api/v1/tenants/:id` | Информация о клиенте по ID |
| `PATCH` | `/api/v1/tenants/:id` | Обновление настроек подключения и интеграций |
| `POST` | `/api/v1/tenants/:id/rotate-key` | Мгновенная генерация нового API-ключа клиента |
| `DELETE` | `/api/v1/tenants/:id` | Удаление клиента |

### 🗄️ 2. Каталог и остатки Limansoft
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/liman/:tenantId/ping` | Проверка связи с базой MariaDB клиента |
| `GET` | `/api/v1/liman/:tenantId/categories` | Иерархическое дерево категорий (`name`) |
| `GET` | `/api/v1/liman/:tenantId/products` | Список товаров (пагинация `page`, `limit`, поиск `search`) |
| `GET` | `/api/v1/liman/:tenantId/products/:tcod` | Детальная карточка товара со всеми свойствами и фото |
| `PATCH` | `/api/v1/liman/:tenantId/stock/:tcod` | Ручное изменение остатка в `name2ost` |

### 🖼️ 3. Медиа
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/media/:tenantId/products/:tcod/:photoIndex.jpg` | Потоковая отдача фото из BLOB (ETag, HTTP 304) |

### 🛒 4. WooCommerce
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/woocommerce/:tenantId/ping` | Проверка связи с магазином WooCommerce |
| `POST` | `/api/v1/woocommerce/:tenantId/sync` | Полная пакетная синхронизация каталога (`limit`, `imageBaseUrl`) |
| `POST` | `/api/v1/woocommerce/:tenantId/sync/stock` | Быстрое обновление цен и остатков |
| `POST` | `/api/v1/woocommerce/:tenantId/webhook/order` | Вебхук заказа из WooCommerce (списание остатка) |

### 💚 5. Rozetka
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/rozetka/:tenantId/ping` | Проверка подключения к Rozetka Seller API (JWT) |
| `GET` | `/api/v1/rozetka/:tenantId/feed.xml` | Потоковый XML/YML фид для Rozetka Marketplace |
| `POST` | `/api/v1/rozetka/:tenantId/sync/prices-stocks` | Пакетное обновление цен и остатков в Seller API (пачки по 100) |
| `POST` | `/api/v1/rozetka/:tenantId/webhook/order` | Вебхук заказа Rozetka (списание остатка) |

### 🟣 6. Prom.ua
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/prom/:tenantId/feed.xml` | Потоковый YML фид для Prom.ua |
| `POST` | `/api/v1/prom/:tenantId/webhook/order` | Вебхук заказа Prom.ua (списание остатка) |

### 🛍️ 7. Horoshop (Хорошоп / Cartum)
| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/v1/horoshop/:tenantId/ping` | Проверка подключения к API Хорошоп (`/api/auth/`, поддержка MOCK-режима) |
| `GET` | `/api/v1/horoshop/:tenantId/feed.xml` | Потоковый XML/YML фид для авто-импорта каталога в Хорошоп |
| `POST` | `/api/v1/horoshop/:tenantId/sync/prices-stocks` | Пакетное обновление цен и остатков через Horoshop API (`/catalog/import/`) |
| `GET` | `/api/v1/horoshop/:tenantId/orders` | Получение списка заказов из Хорошоп (`/api/orders/get/`) |
| `POST` | `/api/v1/horoshop/:tenantId/sync/orders` | Опрос новых заказов и списание остатков (Polling с дедупликацией) |
| `POST` | `/api/v1/horoshop/:tenantId/webhook/order` | Вебхук оформления заказа в Хорошоп (списание остатка с защитой от дублей) |

### ⚡ 8. Очереди и задачи (BullMQ)
| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/v1/sync/:tenantId/stock` | Постановка задачи синхронизации в очередь |
| `GET` | `/api/v1/sync/jobs/:queueName/:jobId` | Проверка статуса выполнения задачи и процента прогресса |

---

## 🚀 Установка и запуск

### 1. Предварительные требования
- Node.js >= 20.x
- Docker и Docker Compose
- MariaDB / MySQL с базой данных Limansoft

### 2. Клонирование и зависимости
```bash
git clone <repo-url>
cd liman-web-api
npm install
```

### 3. Настройка окружения
Создайте файл `.env` на основе `.env.example`:
```ini
# Сервер
PORT=3000
NODE_ENV=production
MASTER_API_KEY=your-secure-master-key-here

# Redis для BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Путь к Master базе SQLite (содержит настройки тенантов)
SQLITE_PATH=./data/liman_master.sqlite
```

### 4. Запуск Redis
```bash
docker compose up -d redis
```

### 5. Сборка и старт
```bash
# Сборка проекта
npm run build

# Запуск в продакшене
npm run start:prod

# Или в режиме разработки с авто-перезагрузкой
npm run start:dev
```

После старта сервер доступен на порту `3000`:
- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`

---

## 🏢 Управление клиентами (Tenants)

Для добавления магазина выполните запрос к Master API:

```bash
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secure-master-key-here" \
  -d '{
    "id": "columb",
    "name": "Columb Trade",
    "dbHost": "127.0.0.1",
    "dbPort": 3306,
    "dbName": "columbDB",
    "dbUser": "root",
    "dbPassword": "secretpassword",
    "priceColumn": "cena2",
    "stockColumn": "skl_k",
    "woocommerceUrl": "https://myshop.com",
    "woocommerceConsumerKey": "ck_...",
    "woocommerceConsumerSecret": "cs_...",
    "woocommerceSyncEnabled": true,
    "woocommerceSyncIntervalMinutes": 15,
    "rozetkaClientId": "your-rozetka-username",
    "rozetkaClientSecret": "your-rozetka-password",
    "rozetkaExportEnabled": true,
    "promApiKey": "your-prom-api-key",
    "promExportEnabled": true
  }'
```

---

## 🔒 Безопасность и авторизация

1. **Master API Key**: задается в `.env` (`MASTER_API_KEY`). Необходим для управления списком тенантов (`/api/v1/tenants`).
2. **Tenant API Key**: генерируется автоматически при создании тенанта. Используется плагинами и внешними сервисами для доступа к эндпоинтам конкретного тенанта (`x-api-key: <tenant_key>`).
3. **Ротация ключей**: в случае компрометации ключа выполните:
   ```bash
   POST /api/v1/tenants/:id/rotate-key
   ```
   Старый ключ аннулируется немедленно.
4. **Публичные эндпоинты (`@Public`)**: фиды XML (`feed.xml`) и вебхуки заказов (`/webhook/order`) не требуют передачи заголовка `x-api-key`, что позволяет беспрепятственно подключать их к маркетплейсам и внешним CMS.
