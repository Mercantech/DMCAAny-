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

module.exports = {
  TZ,
  getTzParts,
  zonedLocalToUtc,
  formatDateShort,
  getYesterdayBounds,
  msUntilNextLocalTime,
};
