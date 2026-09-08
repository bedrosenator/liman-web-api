# TASK-15: Webhook Notifications & Telegram Alert Bot для критических сбоев

- **ID:** TASK-15
- **Эпик:** Мониторинг и отказоустойчивость
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Core & Monitoring Agent

---

## 🎯 Цель
Реализовать централизованную систему мониторинга и мгновенного оповещения о критических сбоях и ошибках синхронизации (обрыв связи с MariaDB, ошибки авторизации API маркетплейсов, сбои очередей BullMQ, ошибки списания остатков при заказах) с поддержкой Telegram Bot (HTML-сообщения в группу) и внешних HTTP Webhook с защитой от спама (Anti-Spam Throttling & Debouncing).

---

## 📝 Требования и шаги реализации
1. **Модуль `AlertModule`**:
   - `AlertService` — фасад диспетчеризации алертов по каналам связи.
   - `AlertThrottlerService` — подавление дублирующихся алертов внутри скользящего окна (дефолт 10 минут) со счетчиком повторов.
   - `TelegramService` — безопасное экранирование и HTML-форматирование сообщений с эмодзи (🚨, ⚠️, ℹ️), вызов Telegram Bot API `POST /sendMessage`, поддержка безопасного MOCK-режима.
   - `WebhookService` — отправка структурированного JSON POST payload на внешний мониторинг / Slack / Discord.
   - `AlertController` — эндпоинты `POST /api/v1/alerts/test` и `POST /api/v1/alerts/reset-throttle`.
2. **Точки интеграции в сервисы**:
   - `TenantConnectionManager`: алерт при сбое пинга и подключения к MariaDB тенанта.
   - `StockSyncProcessor` (BullMQ): алерт при падении фоновой задачи синхронизации остатков/цен.
   - `AllExceptionsFilter`: отправка алерта при необработанных серверных ошибках `HTTP >= 500`.
   - `WoocommerceSyncService` & `WoocommerceController`: алерты при сбое пакетной выгрузки и ошибке списания остатка заказа.
   - `RozetkaSyncService`: алерты при ошибках `massUpdateItems` и ошибке списания остатка заказа.
   - `HoroshopSyncService`: алерты при ошибках обновления цен/остатков и ошибке списания остатка заказа.

---

## ✅ Критерии приемки
- [x] Создан глобальный модуль `AlertModule` с экспортом `AlertService`.
- [x] Реализован сервис троттлинга `AlertThrottlerService` с настраиваемым интервалом `ALERT_THROTTLE_MINUTES`.
- [x] Реализована отправка в Telegram через Telegram Bot API с поддержкой групп, HTML разметки и fallback-режима при отсутствии токена.
- [x] Реализована отправка JSON алертов на внешний Webhook URL (`ALERT_WEBHOOK_URL`).
- [x] Реализованы контроллер и OpenAPI документация: `POST /api/v1/alerts/test`, `POST /api/v1/alerts/reset-throttle`.
- [x] Все ключевые сервисы (MariaDB, BullMQ, 500 Filter, WooCommerce, Rozetka, Horoshop) подключены к `AlertService`.
- [x] Написаны Unit-тесты для `AlertThrottlerService`, `TelegramService`, `AlertService` (100% pass).
- [x] Сквозное ручное тестирование подтвердило корректную работу авторизации (401 без ключа, 200 с ключом), доставку и подавление дубликатов (throttled: true).
