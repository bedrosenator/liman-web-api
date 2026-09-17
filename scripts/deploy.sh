#!/bin/bash
# ==============================================================================
# Скрипт автоматического развертывания Liman Web API на сервере Hetzner
# Вызывается из GitHub Actions workflow при push/merge в main/master.
# ==============================================================================
set -e

error_handler() {
  echo "❌ Ошибка во время деплоя на шаге: $1"
  echo "⚠️ Развертывание прервано. Предыдущая стабильная версия продолжает работу."
  exit 1
}

trap 'error_handler "$BASH_COMMAND"' ERR

echo "🚀 [1/5] Начало развертывания Liman Web API..."

# Создаем директории для постоянных данных на хосте
echo "📁 [2/5] Проверка директорий данных и бэкапов..."
mkdir -p data/backups docker/ssl
chmod -R 777 data

# Выбираем файл compose (prod или дефолтный)
COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="docker-compose.yml"
fi

echo "🐳 [3/5] Скачивание свежих Docker-образов из GHCR (файл: $COMPOSE_FILE)..."
docker compose -f "$COMPOSE_FILE" pull

echo "🔄 [4/5] Перезапуск контейнеров с новыми образами..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "⏳ [5/5] Ожидание готовности контейнеров (Healthcheck)..."
MAX_ATTEMPTS=15
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
    echo "⏳ Контейнеры запускаются, ждем 4 сек..."
  else
    if echo "$PS_OUTPUT" | grep -q "Up"; then
      echo "✅ Все контейнеры успешно запущены и работают стабильно!"
      HEALTHY=true
      break
    fi
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  sleep 4
done

if [ "$HEALTHY" = false ]; then
  echo "❌ Превышено время ожидания готовности контейнеров!"
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "🧹 Очистка старых неиспользуемых Docker образов..."
docker image prune -f

echo "--------------------------------------------------"
echo "🎉 Liman Web API успешно развернут и готов к работе!"
echo "--------------------------------------------------"
