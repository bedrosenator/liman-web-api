# TASK-24: Объединение Columb DB Sync и Limansoft Sync в единый плагин WooCommerce

## Статус: Завершено ✅

## Описание задачи
Пользователь запросил объединить два отдельных плагина WordPress в один:
1. `columb-sync` — прямое подключение к MariaDB `columbDB`, авто-группировка вариативных товаров по вкусам/крепости/объему, двуязычные переводы Polylang UA/RU, Веб-паук скрапинга фото Bing Images и генерации описаний, удаление дубликатов, быстрый синк цен и остатков.
2. `limansoft-sync-woocommerce` — интеграция с Liman Web API (`/api/v1/woocommerce/*`), фоновые задачи WP-Cron, Two-Way вебхуки создания/обновления товаров и списания остатков при заказах.

В результате создан **единый плагин** `Limansoft Sync for WooCommerce` (`limansoft-sync-woocommerce` v2.0.0), обеспечивающий:
- **Прямую синхронизацию** (Limansoft / MariaDB / API -> WooCommerce).
- **Обратную синхронизацию** (WooCommerce -> Limansoft / MariaDB / API).
- Единую панель управления в админке WooCommerce (`Limansoft & Columb Sync`).

---

## Архитектура и реализованные компоненты

1. **`includes/class-direct-db.php` (`LSW_Direct_DB`)**:
   - Singleton для прямого взаимодействия с MariaDB (`columbDB`).
   - Автоматическое определение колонок цен (`cena1`/`cena2`) и остатков (`sklad`/`skl_k`) с безопасной фильтрацией.
   - Методы: `get_tobacco_products()`, `get_all_products()`, `update_stock_and_price()`, `get_connection_status()`.

2. **`includes/class-product-grouper.php` (`LSW_Product_Grouper`)**:
   - Умный парсинг названий, брендов (ElfBar, Vaporesso, Marlboro, Chaser, Aroma King, Baron и др.), крепости, объемов, затяжек и вкусов.
   - Группировка табачной базы в Variable или Simple товары WooCommerce.

3. **`includes/class-web-scraper.php` (`LSW_Web_Scraper`)**:
   - Поиск изображений через Bing Images Async API с фильтрацией качества и цензуры.
   - Генерация двуязычных HTML-описаний (UA/RU).
   - Загрузка изображений в медиабиблиотеку WordPress и генерация векторных SVG заглушек.

4. **`includes/class-migrator.php` (`LSW_Migrator`)**:
   - `run_tobacco_migration($limit)`: создание товаров, вариаций, глобальных атрибутов (`pa_flavor`, `pa_volume`, `pa_brand` и др.) и связей Polylang UA/RU.
   - `sync_stock_and_prices()`: высокоскоростной синк (карта SKU в памяти, прямое обновление метаполей, сброс кешей за ~3 секунды на 5900+ товаров).
   - `cleanup_duplicates()`: безопасное удаление дубликатов с сохранением связей Polylang.
   - `run_web_spider($limit)`: обогащение фото и описаний каталога.

5. **`includes/class-webhook.php` (`LSW_Webhook`)**:
   - Обратная синхронизация заказов: списание остатков в Limansoft при `woocommerce_payment_complete` / смене статуса на processing/completed.
   - Обратная синхронизация товаров: push-вебхуки при `woocommerce_new_product` и `woocommerce_update_product`.
   - Механизм `LSW_Webhook::suspend()` / `resume()` для предотвращения шторма вебхуков во время пакетных операций.

6. **`admin/class-admin-page.php` & `admin/views/settings-page.php`**:
   - Единая страница в меню `WooCommerce -> Limansoft & Columb Sync`.
   - Вкладки и карточки: Настройки Web API, Прямое подключение к MariaDB, Статусы подключений, Центр ручных действий, Живая консоль выполнения с логами операций.

7. **WP-CLI**:
   - Поддержка команд `wp limansoft-sync` и обратная совместимость `wp columb-sync`.

---

## Верификация
1. PHP Linting: все 12 файлов плагина успешно проверены через PHP 8.2 (`No syntax errors detected`).
2. Unit-тесты бэкенда: 18 тест-сьютов (105 тестов) пройдены.
3. Unit-тесты фронтенда: 6 тест-сьютов (35 тестов) пройдены.
4. Проверено прямое подключение к MariaDB `columbDB` (1131 табачный товар, 5909 товаров каталога).
5. Проверен быстрый синк цен и остатков: 1197 товаров обновлено за 3.12 секунды.
6. Проверена очистка дубликатов: 162 дубликата безопасно удалены.
7. Проверена тестовая миграция группы табачных товаров.
8. Старый плагин `columb-sync` деактивирован во избежание конфликтов.
9. Архив дистрибутива собран: `packages/dist/limansoft-sync-woocommerce.zip` (64KB).
