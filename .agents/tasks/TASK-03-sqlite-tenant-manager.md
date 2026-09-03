# TASK-03: Multi-tenant Manager и хранилище клиентов (SQLite)

- **ID:** TASK-03
- **Эпик:** Мультиарендность и безопасность
- **Статус:** Done
- **Приоритет:** High
- **Исполнитель:** Database & Core Agent

---

## 🎯 Цель
Реализовать реестр клиентов/магазинов в легковесной локальной базе данных SQLite, позволяющий хранить реквизиты доступа к MariaDB каждого клиента, токены маркетплейсов и настройки синхронизации.

---

## 📝 Требования и шаги реализации
1. Настроить SQLite хранилище (`data/tenants.sqlite`) через TypeORM или Prisma/Kysely.
2. Сущность `Tenant`:
   - `id` (string, uuid/slug, e.g. "columb")
   - `name` (string, e.g. "Columb Shop")
   - `dbHost`, `dbPort`, `dbName`, `dbUser`, `dbPassword` (зашифрованный пароль)
   - `promApiKey` (string, optional)
   - `promExportEnabled` (boolean)
   - `priceColumn` (enum: 'cena1'...'cena31', default: 'cena2')
   - `stockColumn` (enum: 'skl_k', 'skl_kt', 'skl_r', default: 'skl_k')
   - `syncIntervalMinutes` (number, default: 15)
   - `createdAt`, `updatedAt`
3. Реализовать CRUD эндпоинты в NestJS для управления тенантами с Swagger документацией.
4. Написать сидер / скрипт, добавляющий дефолтного тенанта `columb` (`localhost:3306`, `columbDB`, `root`, `rootpassword`).

---

## ✅ Критерии приемки
- [ ] API эндпоинты `/api/v1/tenants` создают, возвращают и обновляют настройки тенантов.
- [ ] Данные сохраняются в SQLite файле между перезапусками приложения.
