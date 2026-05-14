const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const GUESS_TRACKS_PATH = path.join(DATA_DIR, 'guess-tracks.json');
const SEED_PATH = path.join(__dirname, 'guess-tracks.seed.json');

const ROUND_DURATION_MS = 18_000;
const SNIPPET_DURATION_MS = 15_000;

const activeGames = new Map();

function loadTracks() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(GUESS_TRACKS_PATH) && fs.existsSync(SEED_PATH)) {
      fs.copyFileSync(SEED_PATH, GUESS_TRACKS_PATH);
      console.log('[guess] Seedede guess-tracks.json fra indbygget pool');
    }
    if (!fs.existsSync(GUESS_TRACKS_PATH)) return [];
    const raw = fs.readFileSync(GUESS_TRACKS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[guess] Kunne ikke læse guess-tracks.json:', error.message);
    return [];
  }
}

function pickOptions(tracks, correctTrack, count = 4) {
  const others = tracks.filter((t) => t.title !== correctTrack.title);
  const shuffled = others.sort(() => Math.random() - 0.5);
  const distractors = shuffled.slice(0, count - 1);
  const options = [correctTrack, ...distractors].sort(() => Math.random() - 0.5);
  return options;
}

function pickRandomTrack(tracks) {
  if (!tracks.length) return null;
  return tracks[Math.floor(Math.random() * tracks.length)];
}

function pickRandomTracks(tracks, count) {
  const unique = [];
  const seen = new Set();

  for (const track of tracks.sort(() => Math.random() - 0.5)) {
    const key = String(track.title ?? track.query ?? '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(track);
    if (unique.length >= count) break;
  }

  return unique;
}

function getActiveGame(guildId) {
  return activeGames.get(guildId) ?? null;
}

function startGame(guildId, payload) {
  activeGames.set(guildId, payload);
}

function endGame(guildId) {
  const game = activeGames.get(guildId);
  if (game?.timer) clearTimeout(game.timer);
  activeGames.delete(guildId);
  return game ?? null;
}

module.exports = {
  loadTracks,
  pickRandomTrack,
  pickRandomTracks,
  pickOptions,
  getActiveGame,
  startGame,
  endGame,
  ROUND_DURATION_MS,
  SNIPPET_DURATION_MS,
};
