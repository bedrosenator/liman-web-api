#!/bin/bash
# ==============================================================================
# Скрипт автоматического развертывания Liman Web API на сервере Hetzner
# Вызывается из GitHub Actions workflow при push/merge в main/master
# или напрямую администратором по SSH.
# ==============================================================================
set -e

error_handler() {
  echo "❌ Ошибка во время деплоя на шаге: $1"
  echo "⚠️ Развертывание прервано. Проверьте логи: docker compose ps && docker compose logs --tail=50"
  exit 1
}

trap 'error_handler "$BASH_COMMAND"' ERR

echo "🚀 [1/6] Начало развертывания Liman Web API..."

# Создаем директории для постоянных данных на хосте
echo "📁 [2/6] Проверка директорий данных, бэкапов и статики..."
mkdir -p data/backups docker/ssl public/app
chmod -R 777 data

# Выбираем файл compose (prod или дефолтный)
COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="docker-compose.yml"
fi

echo "🐳 [3/6] Скачивание свежих Docker-образов (файл: $COMPOSE_FILE)..."
if ! docker compose -f "$COMPOSE_FILE" pull; then
  echo "⚠️ Не удалось скачать все образы из GHCR, будет выполнена локальная сборка (--build)..."
fi

echo "🔄 [4/6] Перезапуск контейнеров..."
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

# Подключаем Caddy к сети liman_network (для прямого обращения к liman_nginx:80)
if docker ps -q --filter "name=restaurantify-caddy-1" | grep -q .; then
  echo "🌐 Подключение Caddy (restaurantify-caddy-1) к сети liman_network..."
  docker network connect liman_network restaurantify-caddy-1 2>/dev/null || true
fi

# Синхронизируем статические файлы SPA из API-контейнера на хост для Nginx
echo "📦 Синхронизация файлов SPA фронтенда..."
docker cp liman_api:/app/public/app/. ./public/app/ 2>/dev/null || true

echo "⏳ [5/6] Ожидание готовности контейнеров (Healthcheck)..."
MAX_ATTEMPTS=20
ATTEMPT=1
HEALTHY=false

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "🔍 Проверка #$ATTEMPT: Статус контейнеров..."
  
  PS_OUTPUT=$(docker compose -f "$COMPOSE_FILE" ps)
  
  if echo "$PS_OUTPUT" | grep -q "unhealthy"; then
    echo "❌ Один или несколько контейнеров перешли в статус UNHEALTHY!"
    docker compose -f "$COMPOSE_FILE" ps
    exit 1
  elif echo "$PS_OUTPUT" | grep -q "starting"; then
    echo "⏳ Контейнеры еще запускаются, ждем 5 сек..."
  else
    if echo "$PS_OUTPUT" | grep -q "healthy"; then
      echo "✅ Все контейнеры успешно запущены и находятся в статусе HEALTHY!"
      HEALTHY=true
      break
    elif echo "$PS_OUTPUT" | grep -q "Up"; then
      echo "✅ Контейнеры запущены и работают!"
      HEALTHY=true
      break
    fi
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  sleep 5
done

if [ "$HEALTHY" = false ]; then
  echo "❌ Превышено время ожидания готовности контейнеров!"
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "🧹 [6/6] Очистка старых неиспользуемых Docker слоев..."
docker image prune -f

echo "--------------------------------------------------"
echo "🎉 Liman Web API успешно развернут и готов к работе!"
echo "--------------------------------------------------"
