const BASE_URL = 'https://lrclib.net/api';
const USER_AGENT = 'DMCAAny-Discord-Bot (https://github.com/dmcaany)';

async function lrclibRequest(pathWithQuery) {
  const url = `${BASE_URL}${pathWithQuery}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`LRCLib HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function buildQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  return usp.toString();
}

async function getLyricsSigned({ artist, track, album, durationSeconds }) {
  const qs = buildQuery({
    artist_name: artist,
    track_name: track,
    album_name: album,
    duration: durationSeconds ? Math.round(durationSeconds) : undefined,
  });
  return lrclibRequest(`/get?${qs}`);
}

async function searchLyrics({ artist, track }) {
  const qs = buildQuery({ artist_name: artist, track_name: track });
  const result = await lrclibRequest(`/search?${qs}`);
  if (!Array.isArray(result)) return [];
  return result;
}

function parseSyncedLyrics(synced) {
  if (typeof synced !== 'string' || !synced.trim()) return [];

  const lines = [];
  const lineRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)/g;

  for (const raw of synced.split('\n')) {
    const matches = [...raw.matchAll(lineRegex)];
    if (!matches.length) continue;
    let text = matches[matches.length - 1][4] ?? '';
    text = text.trim();
    if (!text) continue;
    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const timeMs = minutes * 60_000 + seconds * 1000 + ms;
      lines.push({ timeMs, text });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

function findActiveLineIndex(lines, currentMs) {
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= currentMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function cleanArtist(author) {
  if (!author) return '';
  return author
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/\s*\(official.*?\)/gi, '')
    .replace(/\s*\[official.*?\]/gi, '')
    .trim();
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s*\(official.*?\)/gi, '')
    .replace(/\s*\[official.*?\]/gi, '')
    .replace(/\s*\(lyrics?\)/gi, '')
    .replace(/\s*\[lyrics?\]/gi, '')
    .replace(/\s*\(audio\)/gi, '')
    .replace(/\s*\(hd\)/gi, '')
    .replace(/\s*\(4k\)/gi, '')
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .trim();
}

async function findLyricsForTrack(track) {
  const artist = cleanArtist(track.author);
  const title = cleanTitle(track.title);
  const durationSeconds = track.durationMS ? Math.round(track.durationMS / 1000) : undefined;

  if (artist) {
    const exact = await getLyricsSigned({ artist, track: title, durationSeconds }).catch(() => null);
    if (exact) return exact;
  }

  const searchTerms = artist ? { artist, track: title } : { artist: '', track: `${track.author ?? ''} ${title}`.trim() };
  const results = await searchLyrics(searchTerms).catch(() => []);
  return results.length ? results[0] : null;
}

module.exports = {
  getLyricsSigned,
  searchLyrics,
  parseSyncedLyrics,
  findActiveLineIndex,
  findLyricsForTrack,
  cleanArtist,
  cleanTitle,
};
