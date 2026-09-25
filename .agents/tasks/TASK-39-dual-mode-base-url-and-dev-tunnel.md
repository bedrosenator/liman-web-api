# TASK-39: Dual-Mode Base URL & Dev Tunneling (Cloudflare Quick Tunnels)

- **ID:** TASK-39
- **Эпик:** Prom.ua Integration & Developer Experience
- **Статус:** In Progress
- **Приоритет:** Highest
- **Исполнитель:** Full-Stack & DevOps Engineer

---

## 🎯 Цели задачи

1. **Бесшовный доступ Prom.ua к YML-фидам и вебхукам на локальной машине и на проде**:
   - На продакшене: стабильный домен с SSL (`PUBLIC_BASE_URL` в `.env` или `tenant.publicBaseUrl`).
   - Локально: бесплатный публичный HTTPS-туннель через Cloudflare Quick Tunnels (`trycloudflare.com`) без регистрации и без подтверждающих экранов-заглушек.

2. **Защита от отправки `localhost` в Prom API (`POST /products/import_url`)**:
   - Если `baseUrl` содержит `localhost` или `127.0.0.1`, процессор экспорта `PromExportProcessor` не отправляет заведомо нерабочий запрос в Prom.ua, а формирует понятное предупреждение со ссылкой на команду `npm run tunnel`.

3. **Синхронизация Base URL во фронтенде**:
   - В `usePromTabState.ts` формировать `feedUrl` с учетом `tenant.publicBaseUrl`.
   - В `PromFeedCard.tsx` отображать информационный бейдж, если URL является локальным (`localhost`), подсказывая о необходимости туннеля для работы с маркетплейсом.

4. **Инструмент `npm run tunnel`**:
   - Скрипт `scripts/start-tunnel.mjs`, запускающий `cloudflared tunnel --url http://localhost:3000`, извлекающий публичный HTTPS-домен и выводящий ссылки на фиды тенантов.
