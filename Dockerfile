# ==============================================================================
# Stage 1: Build React SPA Frontend (Vite)
# ==============================================================================
FROM node:24-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Build NestJS API Backend
# ==============================================================================
FROM node:24-alpine AS api-builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Копируем собранный SPA фронтенд в public/app
COPY --from=client-builder /app/public/app ./public/app
RUN npm run build

# ==============================================================================
# Stage 3: Production Runner
# ==============================================================================
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Необходимые системные пакеты для работы MariaDB клиента и healthcheck
RUN apk add --no-cache curl wget

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Копируем скомпилированный бэкенд и статику фронтенда
COPY --from=api-builder /app/dist ./dist
COPY --from=api-builder /app/public ./public

# Создаем симлинк dist/main.js на dist/src/main.js для обратной совместимости
RUN [ -f dist/main.js ] || ln -sf src/main.js dist/main.js

# Создаем директории для хранения данных, медиа и бэкапов
RUN mkdir -p /app/data/backups && chmod -R 777 /app/data

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/src/main.js"]
