const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { TONES, normalizeTone } = require('../openaiFunFact');
const { VOICE_REPORT_USER_ID } = require('../voiceConfig');
const { withEmoji } = require('../emoji');

const PREFIX = 'voicerpt:';
const CONTEXT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const contexts = new Map();
let contextSeq = 0;

const TONE_BUTTON_LABELS = {
  venlig: 'Venlig',
  roast: 'Roast',
  sarkastisk: 'Sarkastisk',
  hyggelig: 'Hyggelig',
  dramatisk: 'Dramatisk',
};

function pruneContexts() {
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  for (const [id, ctx] of contexts) {
    if (ctx.createdAt < cutoff) contexts.delete(id);
  }
  // Hard cap
  if (contexts.size > 200) {
    const oldest = [...contexts.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < oldest.length - 150; i++) {
      contexts.delete(oldest[i][0]);
    }
  }
}

function saveReportContext(ctx) {
  pruneContexts();
  const id = `${Date.now().toString(36)}${(contextSeq++).toString(36)}`;
  contexts.set(id, { ...ctx, createdAt: Date.now() });
  return id;
}

function getReportContext(id) {
  const ctx = contexts.get(id);
  if (!ctx) return null;
  if (Date.now() - ctx.createdAt > CONTEXT_TTL_MS) {
    contexts.delete(id);
    return null;
  }
  return ctx;
}

function buildToneButtons(activeTone, contextId) {
  const tone = normalizeTone(activeTone);
  const row = new ActionRowBuilder();

  for (const key of Object.keys(TONES)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${key}:${contextId}`)
        .setLabel(TONE_BUTTON_LABELS[key] || key)
        .setStyle(key === tone ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  return [row];
}

function parseCustomId(customId) {
  // voicerpt:<tone>:<contextId>
  if (!customId.startsWith(PREFIX)) return null;
  const rest = customId.slice(PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon < 1) return null;
  const tone = normalizeTone(rest.slice(0, colon));
  const contextId = rest.slice(colon + 1);
  if (!contextId) return null;
  return { tone, contextId };
}

async function handleVoiceReportButton(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return interaction.reply({
      content: 'Ugyldig knap.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.user.id !== VOICE_REPORT_USER_ID) {
    return interaction.reply({
      content: 'Kun rapport-brugeren kan skifte tone på rapporten.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const ctx = getReportContext(parsed.contextId);
  if (!ctx) {
    return interaction.reply({
      content: withEmoji('Rapporten er for gammel til at skifte tone. Kør `/voicerapport` igen.'),
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  const { buildVoiceReportPayload } = require('../commands/voicerapport');

  try {
    const payload = await buildVoiceReportPayload(interaction.client, {
      ...ctx,
      tone: parsed.tone,
    });

    const newContextId = saveReportContext({
      days: ctx.days,
      userId: ctx.userId,
      channelId: ctx.channelId,
      channelName: ctx.channelName,
      sinceMs: ctx.sinceMs,
      untilMs: ctx.untilMs,
      title: ctx.title,
      description: ctx.description,
      periodLabel: ctx.periodLabel,
    });

    const components = buildToneButtons(payload.tone, newContextId);
    const embeds = payload.embeds.slice(0, 10);

    await interaction.message.edit({ embeds, components });
  } catch (error) {
    console.error('[voiceReportButtons] Fejl ved tone-skift:', error);
    await interaction
      .followUp({
        content: withEmoji('Kunne ikke generere ny tone. Prøv igen om lidt.'),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }
}

module.exports = {
  PREFIX,
  buildToneButtons,
  saveReportContext,
  handleVoiceReportButton,
};
