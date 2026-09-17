# TASK-30: CI/CD пайплайн GitHub Actions и продакшн-деплой на сервер Hetzner

- **ID:** TASK-30
- **Эпик:** DevOps, Infrastructure & Continuous Deployment
- **Статус:** Ready for Push & Deploy
- **Приоритет:** Highest
- **Исполнитель:** DevOps & Infrastructure Architect

---

## 🎯 Цели задачи

1. **Автоматизация сборки и деплоя (GitHub Actions CI/CD)**:
   - Автоматический запуск пайплайна при `push` или `merge` в ветки `main` / `master`.
   - Прогон unit-тестов перед сборкой образов (`npm run test`).
   - Сборка легковесного Docker-образа в GitHub Container Registry (`ghcr.io/bedrosenator/liman-web-api:latest`).
   - Деплой по SSH на боевой сервер Hetzner с помощью `appleboy/ssh-action@v1.0.3`.
   - Автоматическая очистка старых нетегированных слоев образов.

2. **Сосуществование с проектом `restaurantify` на одном сервере Hetzner**:
   - Полное отсутствие конфликтов портов:
     - `restaurantify` слушает порты `80` и `443` через Caddy;
     - `liman_nginx` привязывается к локальному порту хоста `127.0.0.1:8088`;
     - `liman_postgres` работает на порту `5433` внутри изолированной сети `liman_network` (не конфликтует с портом `5432` базы `restaurant_db`).
   - Использование работающего Caddy в качестве Ingress-прокси с автоматическим получением SSL-сертификатов Let's Encrypt.

3. **Отказоустойчивость развертывания (Zero-Downtime & Graceful Recovery)**:
   - Скрипт `scripts/deploy.sh` с перехватом системных ошибок (`trap ERR`).
   - Сохранение предыдущей рабочей версии в случае сбоя нового релиза.
   - Проверка жизнеспособности (Healthcheck) контейнеров перед завершением пайплайна.

---

## 📁 Артефакты реализации

- **[Dockerfile](file:///Users/bedrosenator/Work/liman-web-api/Dockerfile)**: 3-этапная multi-stage сборка (React SPA + NestJS + Node 22 Alpine runtime);
- **[.github/workflows/deploy.yml](file:///Users/bedrosenator/Work/liman-web-api/.github/workflows/deploy.yml)**: GitHub Actions workflow;
- **[scripts/deploy.sh](file:///Users/bedrosenator/Work/liman-web-api/scripts/deploy.sh)**: bash-скрипт развертывания с проверкой здоровья;
- **[docker-compose.prod.yml](file:///Users/bedrosenator/Work/liman-web-api/docker-compose.prod.yml)**: продакшн-стек (`redis`, `postgres`, `api`, `nginx`);
- **[.env.production.example](file:///Users/bedrosenator/Work/liman-web-api/.env.production.example)**: шаблон переменных окружения.

---

## ✅ Инструкция по настройке

1. **GitHub Secrets**:
   - `HOST`: IP-адрес сервера Hetzner;
   - `USERNAME`: `root` (или deploy-пользователь);
   - `SSH_KEY`: приватный ключ SSH.
2. **Caddyfile на Hetzner**:
   ```caddy
   liman.yourdomain.com {
       reverse_proxy 127.0.0.1:8088
   }
   ```
3. **Первичный клон на Hetzner**:
   ```bash
   cd /root && git clone git@github.com:bedrosenator/liman-web-api.git
   cd liman-web-api && cp .env.production.example .env
   chmod +x scripts/deploy.sh
   ```
