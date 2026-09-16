# 📋 Kanban Доска Проекта: Liman Web API

Синхронизируется с Trello и используется для координации AI-агентов и разработчиков.

---

## 📌 Колонка: Backlog (Бэклог)
- [ ] **[TASK-18]** Развертывание React SPA каркаса (Vite + TypeScript), дизайн-система, i18n (RU/UK), Nginx статика и маршрутизация:
  - Инициализация `client/` на React + Vite + TS со сборкой в статику;
  - Конфигурация Nginx Reverse Proxy для прямой отдачи статики (gzip, кэширование, 0% нагрузки на Node.js Event Loop);
  - Мультиязычность i18n (RU по умолчанию, автоопределение UK, localStorage);
  - Премиальная тёмная дизайн-система Limansoft Enterprise Dark;
  - Двухуровневая авторизация: Master API Key (Супер-Админ) vs Tenant Key (Кабинет Клиента).
- [ ] **[TASK-19]** Панель Супер-Админа: Сводная матрица всех клиентов, управление SQLite и монитор очередей:
  - Единая сводная таблица (All-Tenants Master Grid) с отображением всех настроек и статусов магазинов в одном окне;
  - Быстрые действия в строке: пинг, редактирование, вход в портал клиента, ротация ключей;
  - Модалка создания/редактирования с онлайн-тестом подключения к MariaDB Limansoft;
  - Мониторинг очередей BullMQ.
- [ ] **[TASK-20]** Личный кабинет клиента и модуль интеграции с Хорошоп (Horoshop Portal):
  - Виджет live-статуса подключения к API Хорошопа (Ping);
  - Форма настройки реквизитов (домен, логин, пароль, автосинхронизация);
  - Блок генерации и копирования персонального XML/YML фида;
  - Кнопка ручной пакетной синхронизации цен и остатков (`quantity`, `presence`);
  - Журнал операций и пошаговый онбординг для клиента.
- [ ] **[TASK-22]** Обратная синхронизация каталога из Хорошоп в учетную БД Limansoft (MariaDB):
  - Фоновый импорт каталога через BullMQ (`import-horoshop-catalog`) без таймаутов;
  - Два режима: «Только новинки» (безопасный режим) и «Полное обновление» (с перезаписью);
  - Защитное модальное окно с обязательным подтверждением рисков перед перезаписью;
  - Гранулярные фильтры: выбор обновления цен (`cena2`), остатков (`skl_k`), фото (`namedesc`), категорий;
  - Прогресс-бар в реальном времени в Личном Кабинете и панели Супер-Админа.
- [ ] **[TASK-23]** Система резервного копирования и отката БД Limansoft (Backup, Restore & Safety Prompt):
  - Сервис создания сжатых `.sql.gz` дампов учетной базы тенанта (`name`, `name2`, `name2ost`, `namedesc`, `strihcod`);
  - Откат (восстановление базы) до любого сохраненного бэкапа в 1 клик с защитой от случайного нажатия;
  - Предупреждающий блок и чекбокс «Создать бэкап перед началом» в окнах импорта TASK-22 и TASK-17;
  - Скачивание архивов бэкапов и автоматическая ротация старых копий.
- [ ] **[TASK-21]** Модули интеграций для маркетплейсов Prom.ua, Rozetka и WooCommerce в Личном Кабинете:
  - Интеграция с Prom.ua (API токен, YML фид, синхронизация остатков, вебхук);
  - Интеграция с Rozetka (Seller API, XML прайс-лист, дельта-синхронизация);
  - Интеграция с WooCommerce (REST API ключи, Two-Way Sync, скачивание .zip плагина).
- [ ] **[TASK-17]** Выгрузка товаров из магазина WooCommerce обратно в учетную БД Limansoft (MariaDB):
  - Кнопка «📤 Вивантажити каталог до Limansoft» в админке плагина WordPress с выбором режима (только новинки / полный каталог);
  - Индикатор прогресса в реальном времени;
  - Атомарное присвоение tcod (`MAX(tcod)+1`) и обратная запись в SKU WooCommerce;
  - Скачивание фото в BLOB таблицы `namedesc` и запись остатков в `name2ost`;
  - Поддержка вариативных товаров и категорий.
- [ ] **[TASK-16]** Защита и лицензирование коммерческого плагина Limansoft Sync для WooCommerce.

---

## 🎯 Колонка: To Do (Спринт 2: Следующие интеграции)
- *(Все базовые интеграции и ядро завершены)*

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
- [x] WordPress плагин `limansoft-sync-woocommerce.zip` v1.1.0 с поддержкой Two-Way Sync и защитой от зацикливания
- [x] Верификация Telegram Alert Bot & Webhook с троттлингом: `POST /api/v1/alerts/test`
- [x] Верификация двустороннего импорта каталога WooCommerce → Limansoft (Pull + Push)

---

## ✅ Колонка: Done (Выполнено)
- [x] **[TASK-14]** Двусторонний импорт каталога из WooCommerce в Limansoft MariaDB (Two-Way Sync):
  - Атомарный `upsertProductFromExternal` в `name2`, `name2ost`, `namedesc`, `strihcod` с `MAX(tcod)+1` для новых товаров;
  - Сопоставление товаров по SKU (`tcod`) и штрихкоду (`strihcod`/`nnom`);
  - Скачивание всех изображений из WooCommerce и сохранение в `namedesc` (BLOB);
  - Эндпоинты `POST /woocommerce/:tenantId/import/products` (Pull) и `POST /woocommerce/:tenantId/webhook/product` (Push);
  - Обновление WordPress-плагина `limansoft-sync` (v1.1.0): тумблер авто-обновления в админке, хуки `woocommerce_new_product` / `woocommerce_update_product`, защита от зацикливания через transients;
  - Документирование потоков данных и Sequence-диаграмма в `HOWITWORKS.md`.
- [x] **[TASK-15]** Webhook notifications & Telegram alert bot для критических ошибок синхронизации (Telegram Bot API HTML в группу, Generic Webhook JSON, Anti-spam throttling с TTL, алерты с MariaDB, BullMQ, WooCommerce, Rozetka, Horoshop, AllExceptionsFilter)
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
