# TASK-01: Инициализация NestJS проекта, Swagger и базовой архитектуры

- **ID:** TASK-01
- **Эпик:** Инфраструктура и Core
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Lead Architect / Database Agent

---

## 🎯 Цель
Развернуть каркас проекта NestJS с TypeScript, Swagger OpenAPI документацией, валидацией DTO, логгированием и модульной структурой Clean Architecture.

---

## 📝 Требования и шаги реализации
1. Инициализировать NestJS проект с `@nestjs/core`, `@nestjs/common`, `@nestjs/swagger`, `swagger-ui-express`.
2. Настроить структуру модулей:
   - `src/common/` (filters, interceptors, guards, decorators, dto)
   - `src/config/` (валидация env переменных)
   - `src/modules/tenant/` (управление тенантами и подключениями к БД)
   - `src/modules/liman/` (доступ к таблицам Limansoft MariaDB)
   - `src/modules/media/` (стриминг картинок из BLOB)
   - `src/modules/queue/` (BullMQ + Redis)
   - `src/modules/prom/` (интеграция с Prom.ua)
   - `src/modules/sync/` (координатор синхронизации)
3. Настроить Swagger по адресу `/api/docs`:
   - Название: "Liman Web API - Sync Engine"
   - Версия: 1.0.0
   - Описание эндпоинтов и поддержка Bearer / API-Key авторизации.
4. Настроить `ValidationPipe` с `{ transform: true, whitelist: true }`.

---

## ✅ Критерии приемки (Definition of Done)
- [ ] Проект успешно компилируется (`npm run build`).
- [ ] Доступен Swagger UI по маршруту `http://localhost:3000/api/docs`.
- [ ] Настроен глобальный перехват ошибок (`HttpExceptionFilter`) и логгер.
