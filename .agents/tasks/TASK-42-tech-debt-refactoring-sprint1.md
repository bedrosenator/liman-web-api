# TASK-42: Рефакторинг технического долга — Sprint 1 (Quick Wins)

- **ID:** TASK-42
- **Эпик:** Code Quality & Technical Debt Reduction
- **Статус:** In Progress
- **Приоритет:** High
- **Исполнитель:** Full-Stack Engineer

---

## 🎯 Цели задачи

Исправить наиболее критичные и быстро решаемые проблемы технического долга, выявленные в ходе аудита кодовой базы (01.10.2026).

---

## 📋 Чеклист исправлений

### 🔴 Критично
- [x] **[FIX-1]** Хардкод `?? 5768` → `?? 0` в `ClientPortalPage.tsx` (строки 243, 266)
- [x] **[FIX-2]** Создать `JOB_STATE as const` константы, заменить 12 magic string `job.state` во всех modal/hook файлах
- [x] **[FIX-3]** Типизировать `tenant: any` → `TenantData` в `RozetkaTab.tsx`, `WooCommerceTab.tsx`, `PortalSettingsTab.tsx`
- [x] **[FIX-4]** Исправить `@OneToMany` с `any[]` → типизированные отношения в `tenant.entity.ts`

### 🟠 Высокий приоритет
- [x] **[FIX-5]** Удалить дублирующий `syncPricesStocksAsync` из `promApi` в `client.ts`, убрать захардкоженный `?limit=50` из `woocommerceApi.syncProducts`
- [x] **[FIX-6]** Добавить watchdog-timeout (5 мин) в polling в `ClientPortalPage.tsx` и `usePromTabState.ts`
- [x] **[FIX-7]** Исправить `SyncStatus` / `SyncPhase` — из union type → `as const` словари в `woocommerce-sync.service.ts`
- [x] **[FIX-8]** Перенести самые частые inline i18n строки WooCommerceTab и RozetkaTab в `translations.ts`

### 📄 Документация
- [x] Обновить `TASK-42` чеклист

**Статус:** ✅ Завершено. Все 70 тестов прошли. Ветка `fix/tech-debt-sprint1-task42` запушена.

---

## 📁 Затрагиваемые файлы

### Backend
- `src/modules/tenant/tenant.entity.ts`
- `src/modules/woocommerce/woocommerce-sync.service.ts`

### Frontend
- `client/src/api/client.ts`
- `client/src/pages/ClientPortalPage.tsx`
- `client/src/components/portal/RozetkaTab.tsx`
- `client/src/components/portal/WooCommerceTab.tsx`
- `client/src/components/portal/PortalSettingsTab.tsx`
- `client/src/components/portal/prom/usePromTabState.ts`
- `client/src/components/portal/prom/PromExportModal.tsx`
- `client/src/components/portal/prom/PromImportModal.tsx`
- `client/src/components/portal/HoroshopExportModal.tsx`
- `client/src/components/portal/HoroshopImportModal.tsx`
- `client/src/i18n/translations.ts`

### Новые файлы
- `client/src/constants/job-states.ts`
- `client/src/types/tenant.types.ts`

---

## 🚫 Не входит в эту задачу (следующие спринты)

- Декомпозиция `ClientPortalPage.tsx` / `SuperAdminPage.tsx` / `TenantModal.tsx` → TASK-43
- In-memory ActivityFeed → Redis/PostgreSQL → TASK-44
- WooCommerce / Rozetka Scheduler → TASK-45
- Rate Limit на вебхуках / DTO-валидация → TASK-46
