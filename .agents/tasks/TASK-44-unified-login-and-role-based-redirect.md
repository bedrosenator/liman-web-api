# TASK-44: Единая форма входа по паролю/API-ключу с автоопределением роли и редиректом

- **ID:** TASK-44
- **Эпик:** Auth & User Experience Refactoring
- **Статус:** Completed
- **Приоритет:** High
- **Исполнитель:** Fullstack Engineer

---

## 🎯 Цели задачи

1. **Создание модуля аутентификации в NestJS (`src/modules/auth/`)**:
   - `auth.constants.ts`: строгие константы ролей (`AUTH_ROLES = { SUPERADMIN: 'superadmin', TENANT: 'tenant' } as const`).
   - DTO для запроса и ответа авторизации (`LoginDto`, `LoginResponseDto`).
   - `AuthService`: валидация Master Key (`ConfigService`) и ключа тенанта (`TenantRepository.findOne({ where: { apiKey, isActive: true } })`). При невалидном ключе — `UnauthorizedException`.
   - `AuthController`:
     - `@Post('auth/login')` с `@Public()` — для универсальной аутентификации по ключу.
     - `@Get('auth/me')` — для проверки текущей сессии через `x-api-key`.
   - Регистрация `AuthModule` в `AppModule`.
   - Покрытие unit-тестами `auth.service.spec.ts` и `auth.controller.spec.ts`.

2. **Обновление API-клиента и AuthContext во фронтенде**:
   - Добавление `authApi.login(key)` и `authApi.getMe()` в `client/src/api/client.ts`.
   - Обновление `AuthContext.tsx` для сохранения роли и `tenantId` по ответу сервера.
   - Поддержка быстрого входа по magic-link (`?token=...`).

3. **Редизайн страницы входа `LoginPage.tsx`**:
   - Устранение вкладок «Super Admin» / «Личный кабинет».
   - Устранение ручного ввода `tenantId` («ID магазина»).
   - Единая форма с одним полем пароля/ключа доступа, переключателем видимости (Eye/EyeOff) и кнопкой «Войти».
   - Автоматический редирект:
     - `role === 'superadmin'` ➔ `/superadmin`
     - `role === 'tenant'` ➔ `/portal/:tenantId`
   - Локализация всех строк в `translations.ts` (RU/UK) без хардкода.

4. **Тестирование и верификация**:
   - 100% прохождение тестов бэкенда (`npm test`) и фронтенда (`npm test`).
   - Проверка сценариев входа суперадмина, тенанта, невалидного ключа и деактивированного магазина.
