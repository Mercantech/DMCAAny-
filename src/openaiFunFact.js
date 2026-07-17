const DEFAULT_MODEL = 'gpt-4o-mini';

const TONES = {
  venlig: {
    label: 'Fun fact',
    temperature: 0.9,
    system:
      'Du er en venlig dansk kommentator for en Discord-server. ' +
      'Skriv PRÆCIS én kort fun fact (1–2 sætninger) om voice-aktiviteten. ' +
      'Vær sjov, observant og ufarlig — ingen drillerier der kan såre. ' +
      'Ingen overskrifter, bullets eller emoji-spam. Kun fakta baseret på dataene.',
  },
  roast: {
    label: 'Roast',
    temperature: 1.0,
    system:
      'Du er en dansk roast-komiker for en Discord-server blandt venner. ' +
      'Skriv PRÆCIS én kort roast (1–2 sætninger) om voice-aktiviteten. ' +
      'Vær skarp, sjov og drilsk — men hold dig til dataene, ingen personlige angreb på udseende/identitet, ' +
      'ingen hadefuldt indhold. Ingen overskrifter, bullets eller emoji-spam.',
  },
  sarkastisk: {
    label: 'Sarkasme',
    temperature: 0.95,
    system:
      'Du er en tør, sarkastisk dansk kommentator. ' +
      'Skriv PRÆCIS én kort bemærkning (1–2 sætninger) om voice-aktiviteten med understatement og ironi. ' +
      'Hold dig til dataene. Ingen overskrifter, bullets eller emoji-spam.',
  },
  hyggelig: {
    label: 'Hygge-fact',
    temperature: 0.85,
    system:
      'Du er en varm, hyggelig dansk kommentator. ' +
      'Skriv PRÆCIS én kort, positiv observation (1–2 sætninger) om voice-aktiviteten — ' +
      'som en venlig værtsnote. Hold dig til dataene. Ingen overskrifter, bullets eller emoji-spam.',
  },
  dramatisk: {
    label: 'Drama',
    temperature: 1.0,
    system:
      'Du er en overdramatisk sports-/dokumentar-kommentator på dansk. ' +
      'Skriv PRÆCIS én kort, episk linje (1–2 sætninger) om voice-aktiviteten. ' +
      'Hold dig til dataene, men gør det teatralsk. Ingen overskrifter, bullets eller emoji-spam.',
  },
};

function normalizeTone(tone) {
  const key = String(tone || 'venlig').toLowerCase().trim();
  return TONES[key] ? key : 'venlig';
}

/**
 * Generér én kort dansk fun fact ud fra en plain-text voice-rapport.
 * Returnerer null hvis OPENAI_API_KEY mangler eller kaldet fejler.
 * @returns {Promise<{ text: string, tone: string, label: string } | null>}
 */
async function generateVoiceFunFact(reportSummary, tone = 'venlig') {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!reportSummary || !reportSummary.trim()) return null;

  const toneKey = normalizeTone(tone);
  const toneCfg = TONES[toneKey];
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: toneCfg.temperature,
        max_tokens: 180,
        messages: [
          { role: 'system', content: toneCfg.system },
          {
            role: 'user',
            content: `Voice-data:\n\n${reportSummary.slice(0, 6000)}\n\nSkriv din ${toneKey}-kommentar nu.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[openai] Fun fact fejlede (${res.status}):`, body.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text: text.slice(0, 500), tone: toneKey, label: toneCfg.label };
  } catch (error) {
    console.error('[openai] Fun fact fejl:', error.message);
    return null;
  }
}

module.exports = {
  generateVoiceFunFact,
  normalizeTone,
  TONES,
};
