const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Generér én kort dansk fun fact ud fra en plain-text voice-rapport.
 * Returnerer null hvis OPENAI_API_KEY mangler eller kaldet fejler.
 */
async function generateVoiceFunFact(reportSummary) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!reportSummary || !reportSummary.trim()) return null;

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
        temperature: 0.95,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'Du er en venlig dansk kommentator for en Discord-server. ' +
              'Skriv PRÆCIS én kort fun fact (1–2 sætninger) om voice-aktiviteten. ' +
              'Vær sjov, observant og ufarlig — ingen drillerier der kan såre. ' +
              'Ingen overskrifter, bullets eller emoji-spam. Kun fakta baseret på dataene.',
          },
          {
            role: 'user',
            content: `Voice-data:\n\n${reportSummary.slice(0, 6000)}\n\nSkriv fun facten nu.`,
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
    return text.slice(0, 500);
  } catch (error) {
    console.error('[openai] Fun fact fejl:', error.message);
    return null;
  }
}

module.exports = { generateVoiceFunFact };
