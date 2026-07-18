const DEFAULT_MODEL = 'gpt-4o-mini';

/** Fælles regel så modellen ikke blander total / alene / sammen. */
const DATA_ACCURACY_RULES =
  'VIGTIGT om tallene: ' +
  'TOTAL = al tid i voice (alene + med andre). ' +
  'ALENE = kun tid uden andre i samme kanal. ' +
  'MED_ANDRE = tid med mindst én anden. ' +
  'Sig ALDRIG at TOTAL er alenetid. ' +
  'Hvis du nævner "alene", brug KUN ALENE-tallet. ' +
  'Hvis du nævner "i voice"/"samlet", brug TOTAL. ' +
  'Duo-tid er tid to specifikke personer sad sammen — ikke det samme som MED_ANDRE totalt. ';

const TONES = {
  venlig: {
    label: 'Fun fact',
    temperature: 0.9,
    max_tokens: 180,
    system:
      'Du er en venlig dansk kommentator for en Discord-server. ' +
      'Skriv PRÆCIS én kort fun fact (1–2 sætninger) om voice-aktiviteten. ' +
      'Vær sjov, observant og ufarlig — ingen drillerier der kan såre. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam. Kun fakta baseret på dataene.',
  },
  roast: {
    label: 'Roast',
    temperature: 1.0,
    max_tokens: 180,
    system:
      'Du er en dansk roast-komiker for en Discord-server blandt venner. ' +
      'Skriv PRÆCIS én kort roast (1–2 sætninger) om voice-aktiviteten. ' +
      'Vær skarp, sjov og drilsk — men hold dig til dataene, ingen personlige angreb på udseende/identitet, ' +
      'ingen hadefuldt indhold. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam.',
  },
  mega: {
    label: 'Mega roast',
    temperature: 1.15,
    max_tokens: 320,
    system:
      'Du er en MAXIMAL dansk roast-komiker til en Discord-server blandt gode venner. ' +
      'Skriv en MEGA roast (2–4 sætninger) om voice-aktiviteten: overdrevet, kreativ, nådesløst sjov. ' +
      'Brug dataene hårdt (ALENE vs MED_ANDRE, duoer, mute/live/cam). ' +
      'Stadig kun venner-imellem: ingen had, ingen angreb på udseende/identitet/privatliv, intet seksuelt. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam.',
  },
  sarkastisk: {
    label: 'Sarkasme',
    temperature: 0.95,
    max_tokens: 180,
    system:
      'Du er en tør, sarkastisk dansk kommentator. ' +
      'Skriv PRÆCIS én kort bemærkning (1–2 sætninger) om voice-aktiviteten med understatement og ironi. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam.',
  },
  hyggelig: {
    label: 'Hygge-fact',
    temperature: 0.85,
    max_tokens: 180,
    system:
      'Du er en varm, hyggelig dansk kommentator. ' +
      'Skriv PRÆCIS én kort, positiv observation (1–2 sætninger) om voice-aktiviteten — ' +
      'som en venlig værtsnote. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam.',
  },
  dramatisk: {
    label: 'Drama',
    temperature: 1.0,
    max_tokens: 180,
    system:
      'Du er en overdramatisk sports-/dokumentar-kommentator på dansk. ' +
      'Skriv PRÆCIS én kort, episk linje (1–2 sætninger) om voice-aktiviteten. ' +
      'Hold dig til dataene, men gør det teatralsk. ' +
      DATA_ACCURACY_RULES +
      'Ingen overskrifter, bullets eller emoji-spam.',
  },
};

function normalizeTone(tone) {
  const key = String(tone || 'venlig').toLowerCase().trim();
  // aliases
  if (key === 'megaroast' || key === 'mega_roast' || key === 'mega-roast') return 'mega';
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
        max_tokens: toneCfg.max_tokens || 180,
        messages: [
          { role: 'system', content: toneCfg.system },
          {
            role: 'user',
            content:
              `Voice-data:\n\n${reportSummary.slice(0, 6000)}\n\n` +
              `Skriv din ${toneKey}-kommentar nu. Husk: TOTAL ≠ ALENE. Brug tallene præcist.`,
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
    // Mega må gerne fylde lidt mere
    const maxLen = toneKey === 'mega' ? 900 : 500;
    return { text: text.slice(0, maxLen), tone: toneKey, label: toneCfg.label };
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
