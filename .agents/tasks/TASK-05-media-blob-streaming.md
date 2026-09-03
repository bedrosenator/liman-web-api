# TASK-05: Сервис изображений (Media Module) - Потоковая отдача BLOB в HTTP URL

- **ID:** TASK-05
- **Эпик:** Каталог и Медиа
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Database & Core Agent

---

## 🎯 Цель
Реализовать HTTP модуль, который извлекает двоичные данные изображений (`longblob`) из таблицы `namedesc` Limansoft и отдает их как стандартные веб-изображения (JPEG/PNG) по постоянным URL-ссылкам с поддержкой HTTP кэширования.

---

## 📝 Требования и шаги реализации
1. Реализовать контроллер `MediaController`:
   - Маршрут: `GET /api/v1/media/:tenantId/products/:tcod/:photoIndex.jpg` (где photoIndex от 1 до 5).
2. Логика отдачи изображения:
   - Выборка соответствующего поля `photo`, `photo2`...`photo5` из `namedesc` по `tcod`.
   - Если BLOB пустой или не найден — возврат 404 или placeholder заглушки.
   - Определение формата изображения по сигнатуре (magic bytes: JPEG, PNG, WEBP).
   - Установка заголовков: `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`, `ETag`.
3. Опционально: локальное кэширование на диск (`storage/cache/images/`) для снижения нагрузки на MariaDB при скачивании маркетплейсами.

---

## ✅ Критерии приемки
- [ ] Открытие ссылки `http://localhost:3000/api/v1/media/columb/products/251/1.jpg` в браузере корректно отображает фото товара.
- [ ] Поддержка заголовка `If-None-Match` с возвратом `304 Not Modified`.
