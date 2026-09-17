# TASK-31: Подключение WooCommerce к единому изолированному движку заказов Limansoft

- **ID:** TASK-31
- **Эпик:** WooCommerce Integration & Multi-Platform Order Synchronization
- **Статус:** To Do
- **Приоритет:** High
- **Исполнитель:** Integration Adapter & Backend Core Agent

---

## 🎯 Цели задачи

1. **Рефакторинг обработки заказов WooCommerce на базе `LimanOrderService`**:
   - Перевод обработчика вебхука `POST /api/v1/woocommerce/:tenantId/webhook/order` на единый метод `limanOrderService.processIncomingOrder()`.
   - Перевод сервиса фонового опроса `syncOrders` (`woocommerce-sync.service.ts`) на единый метод `processIncomingOrder()`.
   - Полное устранение дублирования кода списания и создания документов между модулями WooCommerce и Хорошоп.

2. **Маппинг данных заказа WooCommerce в `UnifiedIncomingOrderDto` (ACL)**:
   - Клиент: поля `billing.first_name`, `billing.last_name`, `billing.phone`, `billing.email`;
   - Доставка: поля `shipping.city`, `shipping.address_1`, `shipping_lines[0].method_title`;
   - Оплата и суммы: `payment_method_title`, `total`, `currency`;
   - Позиции заказа: `line_items` (`sku`, `name`, `quantity`, `price`).

3. **Двухуровневая модель безопасности и радиокнопка в UI**:
   - Добавление поля `woocommerceCreateOrderDocumentEnabled: boolean` в модель тенанта (по умолчанию: **выключено / `false`**).
   - Добавление радиокнопки/тумблера во вкладку WooCommerce Клиентского портала и в модалку SuperAdmin с пометкой:  
     *«Создавать полноценный заказ в БД Limansoft (Экспериментальная функция)»*.

4. **Защита от сбоев в десктопном Лимане**:
   - Наследование всех преимуществ TASK-29:
     - При выключенном тумблере — только надежный `deductStock` в `name2ost`;
     - При включенном тумблере — черновик `tip_dok: 85`, `prov = 'f'`, атомарная блокировка `ndok`, регистрация в `checkdok`, аудит в `dmonitor` с меткой `uname: 'WEB-API (WooCommerce)'`.

---

## 🏗️ Архитектура взаимодействия

```
WooCommerce Webhook / Polling
           │
           ▼
WooCommerceOrderMapper.toUnifiedDto(wooOrder)
           │
           ▼
UnifiedIncomingOrderDto (source: 'woocommerce')
           │
           ▼
LimanOrderService.processIncomingOrder(tenant, dto)
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
Режим 1 (Дефолт):           Режим 2 (Экспериментально):
deductStock(name2ost)       nshap (tip_dok: 85, prov='f') + ndok + checkdok + dmonitor
```

---

## ✅ Критерии приемки (Definition of Done)

- [ ] Контроллер вебхука WooCommerce и фоновый опрос используют `LimanOrderService`;
- [ ] В модели тенанта и UI добавлен тумблер `woocommerceCreateOrderDocumentEnabled` (default: false);
- [ ] При получении вебхука заказа WooCommerce товар со строковым артикулом успешно резолвится в `tcod`;
- [ ] Тесты `woocommerce-sync.service.spec.ts` и `woocommerce.controller.spec.ts` успешно обновлены и проходят на 100%.
