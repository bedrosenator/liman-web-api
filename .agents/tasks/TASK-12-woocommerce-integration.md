# TASK-12: Интеграция с WooCommerce REST API

- **ID:** TASK-12
- **Эпик:** Интеграция с WooCommerce
- **Статус:** To Do
- **Приоритет:** High
- **Исполнитель:** Integration Adapter Agent

---

## 🎯 Цель
Реализовать двустороннюю синхронизацию товаров, категорий, цен и остатков с интернет-магазином на WooCommerce через официальный REST API v3 (`/wp-json/wc/v3`).

---

## 📝 Требования и шаги реализации
1. WooCommerce Client:
   - Авторизация через `Consumer Key` и `Consumer Secret` (Basic Auth / OAuth 1.0).
   - Пакетное обновление товаров: `POST /wp-json/wc/v3/products/batch`.
2. Маппинг полей:
   - `name2.tcod` -> `sku`
   - `name2.name` -> `name`
   - `name2.cena2` -> `regular_price`
   - `name2ost.skl_k` -> `stock_quantity` (`manage_stock = true`)
   - Фото по ссылкам на наш `MediaController`.
3. Webhook listener для заказов (`action: woocommerce_order_status_completed`).

---

## ✅ Критерии приемки
- [ ] Успешная выгрузка тестового пакета товаров на локальный WooCommerce (`columb_shop_wp:8080`).
- [ ] Автоматическое изменение остатка в WooCommerce при изменении в Limansoft.
