const { getBotEmoji } = require('./emoji');
const { sendVoiceReport } = require('./commands/voicerapport');
const { getYesterdayBounds, msUntilNextLocalTime, TZ } = require('./copenhagenTime');

const DEFAULT_HOUR = 6;
const DEFAULT_TONE = 'roast';

function isEnabled() {
  const raw = process.env.VOICE_DAILY_REPORT?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true; // default: tændt
}

function getHour() {
  const n = Number.parseInt(process.env.VOICE_DAILY_HOUR || String(DEFAULT_HOUR), 10);
  if (!Number.isFinite(n) || n < 0 || n > 23) return DEFAULT_HOUR;
  return n;
}

function getTone() {
  return process.env.VOICE_DAILY_TONE?.trim() || DEFAULT_TONE;
}

async function runYesterdayReview(client) {
  const { start, end, label } = getYesterdayBounds();
  const emoji = getBotEmoji();
  const tone = getTone();

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
  let timer = null;

  const scheduleNext = () => {
    const wait = msUntilNextLocalTime(hour, 0);
    const nextAt = new Date(Date.now() + wait);
    console.log(
      `[voiceDaily] Næste aften-review kl. ${String(hour).padStart(2, '0')}:00 ${TZ} (om ${Math.round(wait / 60000)} min → ${nextAt.toISOString()}).`,
    );

    timer = setTimeout(async () => {
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
