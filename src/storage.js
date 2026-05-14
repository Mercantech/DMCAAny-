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
    data.guilds[guildId] = {
      djRoleId: null,
      history: [],
      guessScores: {},
      sounds: [],
    };
  }
  const g = data.guilds[guildId];
  if (!Array.isArray(g.history)) g.history = [];
  if (typeof g.djRoleId === 'undefined') g.djRoleId = null;
  if (!g.guessScores || typeof g.guessScores !== 'object') g.guessScores = {};
  if (!Array.isArray(g.sounds)) g.sounds = [];
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

function getGuessScores(guildId) {
  return { ...ensureGuild(guildId).guessScores };
}

function addGuessPoint(guildId, userId, points = 1) {
  const g = ensureGuild(guildId);
  g.guessScores[userId] = (g.guessScores[userId] ?? 0) + points;
  scheduleWrite();
  return g.guessScores[userId];
}

function resetGuessScores(guildId) {
  ensureGuild(guildId).guessScores = {};
  scheduleWrite();
}

function getSounds(guildId) {
  return ensureGuild(guildId).sounds.slice();
}

function findSound(guildId, name) {
  const lower = name.toLowerCase();
  return ensureGuild(guildId).sounds.find((s) => s.name.toLowerCase() === lower) ?? null;
}

function addSound(guildId, sound) {
  const g = ensureGuild(guildId);
  const lower = sound.name.toLowerCase();
  if (g.sounds.some((s) => s.name.toLowerCase() === lower)) {
    throw new Error(`Et sound med navnet "${sound.name}" findes allerede.`);
  }
  if (g.sounds.length >= 25) {
    throw new Error('Maks 25 sounds per server (Discord button-grænse).');
  }
  g.sounds.push({ name: sound.name, url: sound.url, emoji: sound.emoji ?? null });
  scheduleWrite();
  return g.sounds.length;
}

function removeSound(guildId, name) {
  const g = ensureGuild(guildId);
  const lower = name.toLowerCase();
  const before = g.sounds.length;
  g.sounds = g.sounds.filter((s) => s.name.toLowerCase() !== lower);
  if (g.sounds.length !== before) scheduleWrite();
  return before - g.sounds.length;
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
  getGuessScores,
  addGuessPoint,
  resetGuessScores,
  getSounds,
  findSound,
  addSound,
  removeSound,
  flush,
};
