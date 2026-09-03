# TASK-11: Интеграция с Rozetka Marketplace API

- **ID:** TASK-11
- **Эпик:** Интеграция с маркетплейсами
- **Статус:** To Do
- **Приоритет:** High
- **Исполнитель:** Integration Adapter Agent

---

## 🎯 Цель
Разработать экспорт каталога и синхронизацию цен и остатков с Rozetka Marketplace (XML Price-List + REST API).

---

## 📝 Требования и шаги реализации
1. Генерация XML фида по стандарту Rozetka:
   - Маршрут: `GET /api/v1/rozetka/:tenantId/feed.xml`.
   - Теги `<param name="Цвет">`, `<param name="Размер">`, `<stock_quantity>`.
2. REST API клиент Rozetka:
   - Обновление цен и остатков по `item_id` / `article`.
   - Обработка авторизации через JWT токен Rozetka Seller API.

---

## ✅ Критерии приемки
- [ ] Валидный XML фид, принимаемый валидатором Rozetka.
- [ ] Поддержка обновления остатков по расписанию.
