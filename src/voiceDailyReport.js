const { getBotEmoji } = require('./emoji');
const { sendVoiceReport } = require('./commands/voicerapport');
const { getVoiceSessions, clipSessionsToWindow } = require('./storage');
const { VOICE_TRACK_GUILD_ID } = require('./voiceConfig');
const { getYesterdayBounds, msUntilNextLocalTime, TZ } = require('./copenhagenTime');

const DEFAULT_HOUR = 6;
const DEFAULT_TONE = 'mega';
/** Samme tærskel som rapporten: under 4 min tæller ikke. */
const MIN_MEANINGFUL_MS = 4 * 60 * 1000;

function isEnabled() {
  const raw = process.env.VOICE_DAILY_REPORT?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true;
}

function getHour() {
  const n = Number.parseInt(process.env.VOICE_DAILY_HOUR || String(DEFAULT_HOUR), 10);
  if (!Number.isFinite(n) || n < 0 || n > 23) return DEFAULT_HOUR;
  return n;
}

function getTone() {
  return process.env.VOICE_DAILY_TONE?.trim() || DEFAULT_TONE;
}

function hasMeaningfulVoiceActivity(windowStart, windowEnd) {
  const raw = getVoiceSessions(VOICE_TRACK_GUILD_ID, {
    sinceMs: windowStart,
    untilMs: windowEnd,
  });
  const clipped = clipSessionsToWindow(raw, windowStart, windowEnd);
  return clipped.some((s) => (s.leftAt ?? 0) - s.joinedAt >= MIN_MEANINGFUL_MS);
}

async function runYesterdayReview(client) {
  const { start, end, label } = getYesterdayBounds();
  const emoji = getBotEmoji();
  const tone = getTone();

  if (!hasMeaningfulVoiceActivity(start, end)) {
    console.log(`[voiceDaily] Springer aften-review for ${label} over — ingen VC ≥ 4 min.`);
    return null;
  }

  console.log(`[voiceDaily] Sender aften-review for ${label} (tone: ${tone})…`);

  const result = await sendVoiceReport(client, {
    sinceMs: start,
    untilMs: end,
    tone,
    title: `${emoji} Aften-review · ${label}`,
    description: `Opsummering af **${label}** (dagen før) — hvem sad **sammen** hvornår.`,
    periodLabel: label,
  });

  console.log(
    `[voiceDaily] Aften-review sendt (${result.sessions.length} sessioner, tone: ${result.tone}).`,
  );
  return result;
}

function setupVoiceDailyReport(client) {
  if (!isEnabled()) {
    console.log('[voiceDaily] Daglig aften-review er slået fra (VOICE_DAILY_REPORT=false).');
    return;
  }

  const hour = getHour();

  const scheduleNext = () => {
    const wait = msUntilNextLocalTime(hour, 0);
    const nextAt = new Date(Date.now() + wait);
    console.log(
      `[voiceDaily] Næste aften-review kl. ${String(hour).padStart(2, '0')}:00 ${TZ} (om ${Math.round(wait / 60000)} min → ${nextAt.toISOString()}).`,
    );

    const timer = setTimeout(async () => {
      try {
        await runYesterdayReview(client);
      } catch (error) {
        console.error('[voiceDaily] Kunne ikke sende aften-review:', error);
      } finally {
        scheduleNext();
      }
    }, wait);

    if (typeof timer.unref === 'function') timer.unref();
  };

  scheduleNext();
}

module.exports = { setupVoiceDailyReport, runYesterdayReview };
