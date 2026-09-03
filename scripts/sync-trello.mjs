import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Чтение .env.trello
const envPath = path.join(rootDir, '.env.trello');
if (!fs.existsSync(envPath)) {
  console.error(`❌ Файл ${envPath} не найден. Создайте его и укажите TRELLO_API_KEY и TRELLO_TOKEN.`);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = Object.fromEntries(
  envContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const { TRELLO_API_KEY, TRELLO_TOKEN } = envVars;
let TRELLO_BOARD_ID = envVars.TRELLO_BOARD_ID;

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error('❌ TRELLO_API_KEY или TRELLO_TOKEN отсутствуют в .env.trello');
  process.exit(1);
}

const authQuery = `key=${encodeURIComponent(TRELLO_API_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`;

async function trelloFetch(endpoint, options = {}) {
  const url = `https://api.trello.com/1${endpoint}${endpoint.includes('?') ? '&' : '?'}${authQuery}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Trello API Error [${res.status} ${res.statusText}] at ${endpoint}: ${errorText}`);
  }
  return res.json();
}

async function main() {
  console.log('🚀 Синхронизация задач с Trello...');

  // 2. Получить текущего пользователя для проверки ключей
  const me = await trelloFetch('/members/me');
  console.log(`👤 Авторизован как: ${me.fullName} (@${me.username})`);

  // 3. Найти или создать доску
  let board;
  if (TRELLO_BOARD_ID) {
    board = await trelloFetch(`/boards/${TRELLO_BOARD_ID}`);
    console.log(`📌 Используем существующую доску: "${board.name}" (${board.id})`);
  } else {
    const boards = await trelloFetch('/members/me/boards');
    board = boards.find(b => b.name === 'Liman Web API');
    if (board) {
      console.log(`📌 Найдена существующая доска: "${board.name}" (${board.id})`);
    } else {
      console.log('✨ Создаем новую доску "Liman Web API"...');
      board = await trelloFetch('/boards', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Liman Web API',
          defaultLists: false,
          desc: 'Доска задач сервиса liman-web-api (NestJS, MariaDB, BullMQ, Prom.ua, Rozetka, WooCommerce)',
        }),
      });
      console.log(`✅ Доска создана: ${board.url}`);
    }
  }

  // 4. Получить или создать списки (колонки)
  const requiredLists = [
    'Backlog',
    'To Do (Sprint 1)',
    'In Progress',
    'In Review / QA',
    'Done',
  ];

  const existingLists = await trelloFetch(`/boards/${board.id}/lists`);
  const listMap = new Map();

  for (const listName of requiredLists) {
    let list = existingLists.find(l => l.name === listName);
    if (!list) {
      console.log(`➕ Создаем колонку: "${listName}"`);
      list = await trelloFetch(`/boards/${board.id}/lists`, {
        method: 'POST',
        body: JSON.stringify({ name: listName }),
      });
    }
    listMap.set(listName, list);
  }

  // 5. Получить существующие карточки на доске
  const existingCards = await trelloFetch(`/boards/${board.id}/cards`);

  // 6. Прочитать локальные задачи из .agents/tasks/
  const tasksDir = path.join(rootDir, '.agents', 'tasks');
  const taskFiles = fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir).filter(f => f.endsWith('.md')) : [];

  console.log(`📂 Найдено локальных задач: ${taskFiles.length}`);

  for (const file of taskFiles) {
    const filePath = path.join(tasksDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Извлечь ID задачи и заголовок
    const firstLine = content.split('\n')[0] || '';
    const matchId = firstLine.match(/TASK-\d+/);
    const taskId = matchId ? matchId[0] : null;
    const cardTitle = firstLine.replace(/^#\s*/, '').trim();

    if (!taskId) continue;

    // Определить колонку
    let targetListName = 'To Do (Sprint 1)';
    if (content.includes('Статус:** Done')) targetListName = 'Done';
    else if (content.includes('Статус:** In Progress')) targetListName = 'In Progress';
    else if (content.includes('Статус:** In Review')) targetListName = 'In Review / QA';
    else if (content.includes('Статус:** Backlog')) targetListName = 'Backlog';

    const targetList = listMap.get(targetListName);
    if (!targetList) continue;

    // Проверить, есть ли уже карточка с таким TASK-ID
    const existingCard = existingCards.find(c => c.name.includes(taskId));

    if (!existingCard) {
      console.log(`📝 Создаем карточку: "${cardTitle}" -> [${targetListName}]`);
      const newCard = await trelloFetch('/cards', {
        method: 'POST',
        body: JSON.stringify({
          idList: targetList.id,
          name: cardTitle,
          desc: content,
        }),
      });

      // Извлечь критерии приемки в чеклист
      const dodMatch = content.match(/## ✅ Критерии приемки[^#]*/);
      if (dodMatch) {
        const checkItems = dodMatch[0]
          .split('\n')
          .filter(l => l.trim().startsWith('- [ ]') || l.trim().startsWith('- [x]'))
          .map(l => l.replace(/^- \[[ x]\]\s*/, '').trim());

        if (checkItems.length > 0) {
          const checklist = await trelloFetch(`/cards/${newCard.id}/checklists`, {
            method: 'POST',
            body: JSON.stringify({ name: 'Критерии приемки (Definition of Done)' }),
          });

          for (const item of checkItems) {
            await trelloFetch(`/checklists/${checklist.id}/checkItems`, {
              method: 'POST',
              body: JSON.stringify({ name: item }),
            });
          }
        }
      }
    } else {
      if (existingCard.idList !== targetList.id) {
        console.log(`🔄 Перемещаем карточку "${cardTitle}" -> [${targetListName}]`);
        await trelloFetch(`/cards/${existingCard.id}`, {
          method: 'PUT',
          body: JSON.stringify({ idList: targetList.id }),
        });
      } else {
        console.log(`ℹ️ Карточка "${cardTitle}" актуальна в [${targetListName}].`);
      }
    }
  }

  console.log(`\n🎉 Синхронизация успешно завершена!`);
  console.log(`🔗 Ссылка на доску Trello: ${board.url || `https://trello.com/b/${board.id}`}`);
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err.message);
  process.exit(1);
});
