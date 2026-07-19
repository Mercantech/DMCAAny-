const TZ = 'Europe/Copenhagen';

function getTzParts(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** UTC-ms for et lokalt klokkeslæt i Europe/Copenhagen. */
function zonedLocalToUtc(year, month, day, hour = 0, minute = 0, second = 0, timeZone = TZ) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const p = getTzParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    utc += target - asUtc;
  }
  return utc;
}

function formatDateShort(ts, timeZone = TZ) {
  return new Date(ts).toLocaleString('da-DK', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
  });
}

/** Gårsdagens [start, slut) i dansk tid (slut = i dag midnat). */
function getYesterdayBounds(now = Date.now(), timeZone = TZ) {
  const today = getTzParts(new Date(now), timeZone);
  const todayStart = zonedLocalToUtc(today.year, today.month, today.day, 0, 0, 0, timeZone);
  // gå en dag tilbage via midnat - 1ms → gårsdagens dato
  const y = getTzParts(new Date(todayStart - 1), timeZone);
  const start = zonedLocalToUtc(y.year, y.month, y.day, 0, 0, 0, timeZone);
  const end = todayStart;
  return { start, end, label: formatDateShort(start, timeZone) };
}

/** ms indtil næste lokale kl. hour:minute i TZ. */
function msUntilNextLocalTime(hour, minute = 0, now = Date.now(), timeZone = TZ) {
  const p = getTzParts(new Date(now), timeZone);
  let target = zonedLocalToUtc(p.year, p.month, p.day, hour, minute, 0, timeZone);
  if (target <= now) {
    // næste kalenderdag i TZ
    const tomorrowParts = getTzParts(new Date(zonedLocalToUtc(p.year, p.month, p.day, 23, 59, 59, timeZone) + 2000), timeZone);
    target = zonedLocalToUtc(
      tomorrowParts.year,
      tomorrowParts.month,
      tomorrowParts.day,
      hour,
      minute,
      0,
      timeZone,
    );
  }
  return Math.max(1000, target - now);
}

/** Kalenderdag-nøgle i TZ: YYYY-MM-DD */
function dayKey(ts, timeZone = TZ) {
  const p = getTzParts(new Date(ts), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Forrige kalenderdag (YYYY-MM-DD) i TZ. */
function prevDayKey(key, timeZone = TZ) {
  const [y, m, d] = key.split('-').map(Number);
  const dayStart = zonedLocalToUtc(y, m, d, 0, 0, 0, timeZone);
  const prev = getTzParts(new Date(dayStart - 1), timeZone);
  return `${prev.year}-${String(prev.month).padStart(2, '0')}-${String(prev.day).padStart(2, '0')}`;
}

/** Start af næste kalenderdag efter ts i TZ. */
function nextDayStart(ts, timeZone = TZ) {
  const p = getTzParts(new Date(ts), timeZone);
  const dayStart = zonedLocalToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone);
  const jump = getTzParts(new Date(dayStart + 26 * 60 * 60 * 1000), timeZone);
  return zonedLocalToUtc(jump.year, jump.month, jump.day, 0, 0, 0, timeZone);
}

/**
 * Iterér over kalenderdage et interval overlapper i TZ.
 * cb(dayKey, overlapMs)
 */
function forEachDayOverlap(startMs, endMs, cb, timeZone = TZ) {
  let cursor = startMs;
  while (cursor < endMs) {
    const key = dayKey(cursor, timeZone);
    const sliceEnd = Math.min(endMs, nextDayStart(cursor, timeZone));
    cb(key, sliceEnd - cursor);
    cursor = sliceEnd;
  }
}

module.exports = {
  TZ,
  getTzParts,
  zonedLocalToUtc,
  formatDateShort,
  getYesterdayBounds,
  msUntilNextLocalTime,
  dayKey,
  prevDayKey,
  nextDayStart,
  forEachDayOverlap,
};
