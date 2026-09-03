# TASK-08: Потоковый генератор YML/XML фида для Prom.ua

- **ID:** TASK-08
- **Эпик:** Интеграция с Prom.ua
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Integration Adapter Agent

---

## 🎯 Цель
Разработать эндпоинт генерации YML (Yandex Market Language / Prom XML) фида, который потоково формирует выгрузку каталога прямо из MariaDB без загрузки 10 000 товаров целиком в RAM.

---

## 📝 Требования и шаги реализации
1. Реализовать контроллер и маршрут:
   - `GET /api/v1/prom/:tenantId/feed.xml?token=...`
2. Формирование структуры Prom XML:
   - `<yml_catalog date="...">`
   - `<shop>`: `<name>`, `<company>`, `<url>`, `<currencies>`
   - `<categories>`: дерево категорий из таблицы `name` (`<category id="group" parentId="parent">name_g</category>`)
   - `<offers>`: товары из `name2`
     - `<offer id="tcod" available="true|false">`
     - `<name>`, `<price>` (из выбранной колонки `cena2`), `<currencyId>UAH</currencyId>`
     - `<categoryId>`, `<picture>` (ссылка на наш эндпоинт `/api/v1/media/...`)
     - `<vendor>`, `<description>`, `<barcode>` (из `nnom` или `strihcod`)
3. Использовать `stream` (потоковую запись XML) для минимального потребления памяти при 10k+ товаров.

---

## ✅ Критерии приемки
- [ ] Фид проходит валидацию стандарта Prom.ua YML.
- [ ] Картинки содержат валидные ссылки на `MediaController`.
- [ ] Время генерации фида для 6 000 товаров укладывается в норматив, а потребление RAM стабильно (< 100 MB).
