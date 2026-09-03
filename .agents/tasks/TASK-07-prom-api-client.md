# TASK-07: Клиент Prom.ua REST API

- **ID:** TASK-07
- **Эпик:** Интеграция с Prom.ua
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Integration Adapter Agent

---

## 🎯 Цель
Разработать типизированный клиент для взаимодействия с Prom.ua REST API (`my.prom.ua/api/v1/`) с поддержкой авторизации, пакетного обновления цен и остатков.

---

## 📝 Требования и шаги реализации
1. Реализовать `PromApiClient`:
   - Базовый URL: `https://my.prom.ua/api/v1/`.
   - Заголовок авторизации: `Authorization: Bearer <API_TOKEN>`.
2. Реализовать методы API:
   - `editProducts(products: PromProductUpdateDto[])`: метод `POST /products/edit` (обновление по ID/external_id, пакет до 100 товаров).
   - `editPricesAndStock(items: PromStockPriceUpdateDto[])`: обновление только цены (`price`) и наличия (`presence: 'available' | 'not_available' | 'order'`) и количества (`quantity_in_stock`).
   - `getCatalogList()`: получение списка товаров из Prom для сверки внешних ID.
   - `getOrders(status?: string)`: получение списка новых заказов.
3. Добавить обработку Rate Limits (ограничений Prom) и авто-повтор при получении `429 Too Many Requests`.

---

## ✅ Критерии приемки
- [ ] Покрыты unit-тестами методы формирования payload для Prom.ua.
- [ ] Логгирование входящих и исходящих запросов к Prom.ua с сокрытием токена авторизации.
