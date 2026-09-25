#!/usr/bin/env node

/**
 * Liman Web API — Cloudflare Quick Tunnel for Local Marketplace Testing
 * 
 * Автоматически запускает бесплатный HTTPS-туннель к локальному серверу NestJS (порт 3000),
 * перехватывает сгенерированный публичный домен trycloudflare.com и обновляет
 * publicBaseUrl для тенанта columb в Master DB.
 */

import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Чтение .env для MASTER_API_KEY и PORT
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  const env = { PORT: 3000, MASTER_API_KEY: 'liman-master-key-dev-12345' };
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key && val) env[key] = val;
      }
    }
  }
  return env;
}

const env = loadEnv();
const LOCAL_PORT = process.env.PORT || env.PORT || 3000;
const MASTER_KEY = process.env.MASTER_API_KEY || env.MASTER_API_KEY;

console.log('\n🚀 [Liman Dev Tunnel] Запуск Cloudflare Quick Tunnel к http://localhost:' + LOCAL_PORT + '...\n');

// Запуск cloudflared
const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${LOCAL_PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let tunnelUrl = null;
const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

function onTunnelUrlDiscovered(url) {
  if (tunnelUrl) return;
  tunnelUrl = url;

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`🌐 ПУБЛИЧНЫЙ HTTPS ТУННЕЛЬ АКТИВЕН:`);
  console.log(`   👉 ${url}`);
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log(`📡 Ссылки для маркетплейсов (Prom.ua / Horoshop / Rozetka):`);
  console.log(`   📦 Prom.ua YML Feed:  ${url}/api/v1/prom/columb/feed.xml`);
  console.log(`   🛒 Prom.ua Webhook:   ${url}/api/v1/prom/columb/webhook/order`);
  console.log(`   📦 Horoshop XML Feed: ${url}/api/v1/horoshop/columb/feed.xml`);
  console.log(`   📦 Rozetka XML Feed:  ${url}/api/v1/rozetka/columb/feed.xml`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // Автоматическое обновление publicBaseUrl для тенанта columb
  updateTenantPublicBaseUrl('columb', url);
}

function updateTenantPublicBaseUrl(tenantId, publicUrl) {
  const payload = JSON.stringify({ publicBaseUrl: publicUrl });
  const options = {
    hostname: '127.0.0.1',
    port: LOCAL_PORT,
    path: `/api/v1/tenants/${tenantId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': MASTER_KEY,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = http.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`✅ [Авто-синхронизация] publicBaseUrl для тенанта "${tenantId}" успешно обновлен в Master DB!`);
      console.log(`💡 Теперь Prom.ua может напрямую скачивать фид и отправлять вебхуки.\n`);
    } else {
      console.log(`⚠️ Не удалось обновить тенант "${tenantId}" (HTTP ${res.statusCode}). Проверьте, запущен ли backend.`);
    }
  });

  req.on('error', (err) => {
    console.log(`ℹ️ Локальный сервер еще не отвечает на http://localhost:${LOCAL_PORT} (${err.message}).`);
    console.log(`   Запустите "npm run start:dev", и адрес подхватится автоматически.\n`);
  });

  req.write(payload);
  req.end();
}

function processOutput(data) {
  const text = data.toString();
  const match = text.match(urlRegex);
  if (match) {
    onTunnelUrlDiscovered(match[0]);
  }
}

tunnelProcess.stdout.on('data', processOutput);
tunnelProcess.stderr.on('data', processOutput);

tunnelProcess.on('error', (err) => {
  console.error('\n❌ Ошибка запуска cloudflared:', err.message);
  console.error('Убедитесь, что cloudflared установлен в системе (brew install cloudflared).\n');
  process.exit(1);
});

tunnelProcess.on('close', (code) => {
  console.log(`\n🛑 Туннель закрыт (код: ${code})\n`);
});

process.on('SIGINT', () => {
  console.log('\nОстановка туннеля...');
  tunnelProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  tunnelProcess.kill('SIGTERM');
  process.exit(0);
});
