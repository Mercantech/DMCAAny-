const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const HISTORY_LIMIT = 50;
const WRITE_DEBOUNCE_MS = 1000;

const defaultData = () => ({ guilds: {} });

let data = defaultData();
let writeTimer = null;
let loaded = false;

function load() {
  if (loaded) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        data = { ...defaultData(), ...parsed };
        if (!data.guilds || typeof data.guilds !== 'object') data.guilds = {};
      }
    }
  } catch (error) {
    console.error('[storage] Kunne ikke indlæse store.json, starter med tom data:', error.message);
    data = defaultData();
  }
  loaded = true;
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${STORE_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, STORE_PATH);
    } catch (error) {
      console.error('[storage] Skrivning fejlede:', error.message);
    }
  }, WRITE_DEBOUNCE_MS);
}

function ensureGuild(guildId) {
  load();
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { djRoleId: null, history: [] };
  }
  const g = data.guilds[guildId];
  if (!Array.isArray(g.history)) g.history = [];
  if (typeof g.djRoleId === 'undefined') g.djRoleId = null;
  return g;
}

function getDjRole(guildId) {
  return ensureGuild(guildId).djRoleId || null;
}

function setDjRole(guildId, roleId) {
  ensureGuild(guildId).djRoleId = roleId || null;
  scheduleWrite();
}

function addHistory(guildId, entry) {
  const g = ensureGuild(guildId);
  g.history.unshift({
    title: entry.title,
    url: entry.url,
    addedBy: entry.addedBy ?? null,
    playedAt: Date.now(),
  });
  if (g.history.length > HISTORY_LIMIT) g.history.length = HISTORY_LIMIT;
  scheduleWrite();
}

function getHistory(guildId, limit = 10) {
  return ensureGuild(guildId).history.slice(0, limit);
}

function flush() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[storage] flush fejlede:', error.message);
  }
}

process.on('SIGTERM', flush);
process.on('SIGINT', flush);

module.exports = {
  load,
  getDjRole,
  setDjRole,
  addHistory,
  getHistory,
  flush,
};
