const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const HISTORY_LIMIT = 50;
const WRITE_DEBOUNCE_MS = 1000;
const VOICE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

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
      voiceSessions: [],
    };
  }
  const g = data.guilds[guildId];
  if (!Array.isArray(g.history)) g.history = [];
  if (typeof g.djRoleId === 'undefined') g.djRoleId = null;
  if (!g.guessScores || typeof g.guessScores !== 'object') g.guessScores = {};
  if (!Array.isArray(g.sounds)) g.sounds = [];
  if (!Array.isArray(g.voiceSessions)) g.voiceSessions = [];
  return g;
}

function pruneVoiceSessions(g) {
  const cutoff = Date.now() - VOICE_RETENTION_MS;
  const before = g.voiceSessions.length;
  g.voiceSessions = g.voiceSessions.filter((s) => s.leftAt === null || s.leftAt >= cutoff);
  return g.voiceSessions.length !== before;
}

function ensureMuteDeafFields(session) {
  if (typeof session.mutedMs !== 'number') session.mutedMs = 0;
  if (typeof session.deafMs !== 'number') session.deafMs = 0;
  if (typeof session.muteSince === 'undefined') session.muteSince = null;
  if (typeof session.deafSince === 'undefined') session.deafSince = null;
}

/** Læg pending mute/deaf-tid ind i accumulator og nulstil since-felter. */
function flushMuteDeaf(session, at = Date.now()) {
  ensureMuteDeafFields(session);
  if (session.muteSince != null) {
    session.mutedMs += Math.max(0, at - session.muteSince);
    session.muteSince = null;
  }
  if (session.deafSince != null) {
    session.deafMs += Math.max(0, at - session.deafSince);
    session.deafSince = null;
  }
}

/** Synkroniser mute/deaf-state (skift til/fra muted/deaf). */
function applyMuteDeafState(session, { muted = false, deafened = false } = {}, at = Date.now()) {
  ensureMuteDeafFields(session);

  if (session.muteSince != null && !muted) {
    session.mutedMs += Math.max(0, at - session.muteSince);
    session.muteSince = null;
  } else if (session.muteSince == null && muted) {
    session.muteSince = at;
  }

  if (session.deafSince != null && !deafened) {
    session.deafMs += Math.max(0, at - session.deafSince);
    session.deafSince = null;
  } else if (session.deafSince == null && deafened) {
    session.deafSince = at;
  }
}

function startVoiceSession(guildId, { userId, channelId, channelName, muted = false, deafened = false }) {
  const g = ensureGuild(guildId);
  const now = Date.now();
  g.voiceSessions.push({
    userId,
    channelId,
    channelName: channelName ?? channelId,
    joinedAt: now,
    leftAt: null,
    mutedMs: 0,
    deafMs: 0,
    muteSince: muted ? now : null,
    deafSince: deafened ? now : null,
  });
  pruneVoiceSessions(g);
  scheduleWrite();
}

function endVoiceSession(guildId, { userId, channelId }) {
  const g = ensureGuild(guildId);
  const now = Date.now();
  for (let i = g.voiceSessions.length - 1; i >= 0; i--) {
    const s = g.voiceSessions[i];
    if (s.userId === userId && s.channelId === channelId && s.leftAt === null) {
      flushMuteDeaf(s, now);
      s.leftAt = now;
      pruneVoiceSessions(g);
      scheduleWrite();
      return true;
    }
  }
  return false;
}

function updateVoiceMuteDeaf(guildId, { userId, channelId, muted = false, deafened = false }) {
  const g = ensureGuild(guildId);
  const now = Date.now();
  for (let i = g.voiceSessions.length - 1; i >= 0; i--) {
    const s = g.voiceSessions[i];
    if (s.userId === userId && s.channelId === channelId && s.leftAt === null) {
      applyMuteDeafState(s, { muted, deafened }, now);
      scheduleWrite();
      return true;
    }
  }
  return false;
}

function getVoiceSessions(guildId, { userId, channelId, sinceMs, untilMs } = {}) {
  const g = ensureGuild(guildId);
  const since = typeof sinceMs === 'number' ? sinceMs : 0;
  const until = typeof untilMs === 'number' ? untilMs : Number.POSITIVE_INFINITY;
  return g.voiceSessions
    .filter((s) => {
      if (userId && s.userId !== userId) return false;
      if (channelId && s.channelId !== channelId) return false;
      const end = s.leftAt === null ? Number.POSITIVE_INFINITY : s.leftAt;
      return s.joinedAt < until && end > since;
    })
    .slice()
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/** Effektiv mute/deaf-tid inkl. igangværende perioder. */
function effectiveMuteDeaf(session, now = Date.now()) {
  let mutedMs = session.mutedMs || 0;
  let deafMs = session.deafMs || 0;
  const end = session.leftAt ?? now;
  if (session.muteSince != null) mutedMs += Math.max(0, end - session.muteSince);
  if (session.deafSince != null) deafMs += Math.max(0, end - session.deafSince);
  return { mutedMs, deafMs };
}

/** Klip sessioner til vindue (til dagsrapporter) — altid lukkede leftAt. */
function clipSessionsToWindow(sessions, windowStart, windowEnd, now = Date.now()) {
  const out = [];
  for (const s of sessions) {
    const sessionEnd = s.leftAt ?? now;
    if (sessionEnd <= windowStart || s.joinedAt >= windowEnd) continue;
    const joinedAt = Math.max(s.joinedAt, windowStart);
    const leftAt = Math.min(sessionEnd, windowEnd);
    if (leftAt <= joinedAt) continue;

    const origDur = Math.max(1, sessionEnd - s.joinedAt);
    const clipDur = leftAt - joinedAt;
    const ratio = Math.min(1, clipDur / origDur);
    const { mutedMs, deafMs } = effectiveMuteDeaf(s, now);

    out.push({
      ...s,
      joinedAt,
      leftAt,
      mutedMs: Math.round(mutedMs * ratio),
      deafMs: Math.round(deafMs * ratio),
      muteSince: null,
      deafSince: null,
    });
  }
  return out;
}

function reconcileVoiceSessions(guildId, activeList) {
  const g = ensureGuild(guildId);
  const now = Date.now();
  const activeKeys = new Set(activeList.map((a) => `${a.userId}:${a.channelId}`));
  let changed = false;

  for (const s of g.voiceSessions) {
    if (s.leftAt !== null) continue;
    const key = `${s.userId}:${s.channelId}`;
    if (!activeKeys.has(key)) {
      flushMuteDeaf(s, now);
      s.leftAt = now;
      changed = true;
    }
  }

  const openByKey = new Map(
    g.voiceSessions.filter((s) => s.leftAt === null).map((s) => [`${s.userId}:${s.channelId}`, s]),
  );

  for (const active of activeList) {
    const key = `${active.userId}:${active.channelId}`;
    const existing = openByKey.get(key);
    if (existing) {
      applyMuteDeafState(
        existing,
        { muted: !!active.muted, deafened: !!active.deafened },
        now,
      );
      changed = true;
      continue;
    }
    g.voiceSessions.push({
      userId: active.userId,
      channelId: active.channelId,
      channelName: active.channelName ?? active.channelId,
      joinedAt: now,
      leftAt: null,
      mutedMs: 0,
      deafMs: 0,
      muteSince: active.muted ? now : null,
      deafSince: active.deafened ? now : null,
    });
    openByKey.set(key, g.voiceSessions[g.voiceSessions.length - 1]);
    changed = true;
  }

  if (pruneVoiceSessions(g)) changed = true;
  if (changed) scheduleWrite();
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
  startVoiceSession,
  endVoiceSession,
  updateVoiceMuteDeaf,
  getVoiceSessions,
  clipSessionsToWindow,
  effectiveMuteDeaf,
  reconcileVoiceSessions,
  flush,
};
