# 📋 Задача TASK-43: Ликвидация техдолга — Спринт 2 (Декомпозиция табов и типизация тестовых фикстур)

**Дата создания:** 2026-10-01  
**Ветка:** `feat/tech-debt-sprint2-task43`  
**Статус:** 🟡 В процессе планирования  
**Приоритет:** Высокий (архитектурный лимит строк AGENTS.md §4, 100% строгая компиляция бэкенда)

---

## 🎯 Цели спринта

1. **Типизация тестовых фикстур бэкенда (`createMockTenant`)**:
   - Устранить все 4 ошибки `npx tsc --noEmit` в тестовых файлах `liman.service.spec.ts`, `rozetka-feed.service.spec.ts`, `admin-tenants.controller.spec.ts`, `prom-sync.controller.spec.ts`.
   - Создать переиспользуемую фабрику `createMockTenant(overrides?: Partial<Tenant>): Tenant` в `src/test/fixtures/tenant.fixture.ts`.
   - Добиться 0 ошибок компиляции TypeScript во всём бэкенде.

2. **Декомпозиция `WooCommerceTab.tsx` (599 строк → компоненты ≤250 строк по AGENTS.md §4)**:
   - Создать папку `client/src/components/portal/woocommerce/`:
     - `types.ts` — интерфейсы пропсов и состояния.
     - `WooHealthGrid.tsx` — индикатор статуса соединения и карточки здоровья.
     - `WooActionHub.tsx` — кнопки быстрых действий (Push каталога, Цены и остатки, Импорт).
     - `WooSettingsForm.tsx` — форма настроек REST API, Consumer Key/Secret, тумблеры двусторонней синхронизации и вебхука заказов.
     - `WooCommerceTab.tsx` — оркестратор (state + layout, ≤150 строк).
     - Фасад `client/src/components/portal/WooCommerceTab.tsx` для обратной совместимости импортов.

3. **Декомпозиция `RozetkaTab.tsx` (480 строк → компоненты ≤250 строк по AGENTS.md §4)**:
   - Создать папку `client/src/components/portal/rozetka/`:
     - `types.ts` — интерфейсы пропсов и состояния.
     - `RozetkaHealthGrid.tsx` — статус XML-фида, ссылка на XML, копирование URL, кнопка открытия в браузере.
     - `RozetkaActionHub.tsx` — карточка генерации и синхронизации XML-фида.
     - `RozetkaSettingsForm.tsx` — форма логина/пароля API Rozetka Маркетплейс.
     - `RozetkaTab.tsx` — оркестратор (state + layout, ≤150 строк).
     - Фасад `client/src/components/portal/RozetkaTab.tsx` для обратной совместимости импортов.

---

## 📋 Чеклист реализации

### Фаза 1: Бэкенд тестовые фикстуры
- [x] Создать `src/test/fixtures/tenant.fixture.ts` с фабрикой `createMockTenant`
- [x] Заменить неполные моки `mockTenant` в `src/modules/liman/liman.service.spec.ts`
- [x] Заменить неполные моки `mockTenant` в `src/modules/rozetka/rozetka-feed.service.spec.ts`
- [x] Заменить неполные моки `mockTenant` в `src/modules/tenant/admin-tenants.controller.spec.ts`
- [x] Исправить `res.connected` → `res.success` в `src/modules/prom/prom-sync.controller.spec.ts`
- [x] Проверить `npx tsc --noEmit` бэкенда (0 ошибок)
- [x] Проверить `npm test` бэкенда (194/194 тестов проходят)

### Фаза 2: Декомпозиция `WooCommerceTab`
- [x] Создать `client/src/components/portal/woocommerce/types.ts`
- [x] Создать `client/src/components/portal/woocommerce/WooHealthGrid.tsx`
- [x] Создать `client/src/components/portal/woocommerce/WooPluginCard.tsx`
- [x] Создать `client/src/components/portal/woocommerce/WooActionHub.tsx`
- [x] Создать `client/src/components/portal/woocommerce/WooWebhooksCard.tsx`
- [x] Создать `client/src/components/portal/woocommerce/WooSettingsForm.tsx`
- [x] Переписать `client/src/components/portal/woocommerce/WooCommerceTab.tsx` как оркестратор
- [x] Оформить ре-экспорт в `client/src/components/portal/WooCommerceTab.tsx`
- [x] Проверить размер всех созданных файлов (каждый ≤ 220 строк)

### Фаза 3: Декомпозиция `RozetkaTab`
- [x] Создать `client/src/components/portal/rozetka/types.ts`
- [x] Создать `client/src/components/portal/rozetka/RozetkaHealthGrid.tsx`
- [x] Создать `client/src/components/portal/rozetka/RozetkaActionHub.tsx`
- [x] Создать `client/src/components/portal/rozetka/RozetkaFeedCard.tsx`
- [x] Создать `client/src/components/portal/rozetka/RozetkaWebhookCard.tsx`
- [x] Создать `client/src/components/portal/rozetka/RozetkaSettingsForm.tsx`
- [x] Переписать `client/src/components/portal/rozetka/RozetkaTab.tsx` как оркестратор
- [x] Оформить ре-экспорт в `client/src/components/portal/RozetkaTab.tsx`
- [x] Проверить размер всех созданных файлов (каждый ≤ 175 строк)

### Фаза 4: Верификация, сборка и PR
- [x] `npm test` на фронтенде (70/70 тестов)
- [x] `npm run build` на фронтенде (`tsc -b && vite build`)
- [x] `npm run build` на бэкенде (`nest build`)
- [x] Создать коммит и запушить `feat/tech-debt-sprint2-task43`
- [x] Подготовить PR на GitHub и отчет для ревью
