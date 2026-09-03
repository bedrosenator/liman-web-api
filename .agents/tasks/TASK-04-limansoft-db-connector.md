# TASK-04: Data Access Layer для Limansoft MariaDB

- **ID:** TASK-04
- **Эпик:** Интеграция с Limansoft DB
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Database & Core Agent

---

## 🎯 Цель
Создать адаптивный сервис подключения к MariaDB/MySQL базам Limansoft с динамическим пулом соединений и методами выборки категорий, товаров, цен, остатков и логов изменений.

---

## 📝 Требования и шаги реализации
1. Создать `TenantConnectionManager`:
   - Кэширует пулы соединений (`mysql2/promise`) по `tenantId`.
   - Автоматически закрывает неактивные пулы по таймауту.
   - Проверяет доступность базы (`ping()`).
2. Реализовать методы доступа к данным Limansoft:
   - `getCategories(tenantId)`: выборка из `name` (`group`, `name_g`, `parent`).
   - `getProductsBatch(tenantId, options)`: выборка из `name2` + `name2ost` + `namedesc` порциями (с поддержкой `cursor` по `tcod` или `limit/offset`).
   - `getProductByTcod(tenantId, tcod)`: детальная карточка товара со штрихкодами из `strihcod`.
   - `getChangedProducts(tenantId, sinceDate)`: выборка измененных товаров на основе лога `dmonitor` / `checkupdate`.
   - `updateStock(tenantId, tcod, newStock)`: обновление остатка в `name2ost` (`skl_k`).
3. Добавить безопасное экранирование параметров и строгую типизацию сущностей Limansoft.

---

## ✅ Критерии приемки
- [ ] Успешное выполнение запросов к локальной тестовой базе `columbDB`.
- [ ] Корректный JOIN товаров `name2` с остатками `name2ost.skl_k` и описаниями `namedesc`.
- [ ] Тесты на чтение порциями по 200 записей без утечек памяти.
