# TASK-02: Docker Compose: Redis для BullMQ, API и сетевое окружение

- **ID:** TASK-02
- **Эпик:** Инфраструктура
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Lead Architect

---

## 🎯 Цель
Развернуть окружение Docker для локальной разработки и продакшена, включающее Redis для BullMQ и сетевой доступ к локальной MariaDB `columb_shop_db`.

---

## 📝 Требования и шаги реализации
1. Создать `docker-compose.yml`:
   - Сервис `redis`: образ `redis:7-alpine`, порты `6379:6379`, volume для персистентности данных.
   - Сервис `liman-api`: Dockerfile с multi-stage сборкой (development / production).
   - Подключение к существующей сети docker, где крутится `columb_shop_db` (или host networking).
2. Настроить конфигурационный `.env.example` со всеми параметрами.

---

## ✅ Критерии приемки
- [ ] `docker compose up -d redis` поднимает работающий Redis.
- [ ] Контейнер API имеет сетевой доступ к MariaDB (`columb_shop_db:3306` или `host.docker.internal:3306`).
