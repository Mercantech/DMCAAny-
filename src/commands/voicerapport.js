const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getBotEmoji, withEmoji } = require('../emoji');
const { getVoiceSessions } = require('../storage');
const { isAdmin } = require('../permissions');
const { VOICE_REPORT_USER_ID, VOICE_TRACK_GUILD_ID } = require('../voiceConfig');

const LINES_PER_EMBED = 25;
const MAX_EMBEDS = 10;
const DM_TRIGGERS = /^(?:rapport|voicerapport)(?:\s+(\d{1,2}))?$/i;

function formatTime(ts) {
  return new Date(ts).toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}t ${remMins}m` : `${hours}t`;
}

function canRun(interaction) {
  if (interaction.user.id === VOICE_REPORT_USER_ID) return true;
  if (interaction.inGuild() && isAdmin(interaction.member)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function buildLines(sessions) {
  const now = Date.now();
  return sessions.map((s) => {
    const end = s.leftAt ?? now;
    const duration = formatDuration(end - s.joinedAt);
    const timeRange = s.leftAt
      ? `${formatTime(s.joinedAt)}–${formatTime(s.leftAt)}`
      : `${formatTime(s.joinedAt)}–nu (stadig i kanal)`;
    const channel = s.channelName ? `#${s.channelName}` : `<#${s.channelId}>`;
    return `<@${s.userId}> · ${channel} · ${timeRange} (${duration})`;
  });
}

function buildEmbeds(lines, days, filterNote) {
  const emoji = getBotEmoji();
  if (lines.length === 0) {
    return [
      new EmbedBuilder()
        .setTitle(`${emoji} Voice-rapport`)
        .setDescription(`Ingen voice-aktivitet i de seneste ${days} dag(e).${filterNote}`)
        .setTimestamp(),
    ];
  }

  const maxLines = LINES_PER_EMBED * MAX_EMBEDS;
  const shown = lines.slice(0, maxLines);
  const embeds = [];

  for (let i = 0; i < shown.length; i += LINES_PER_EMBED) {
    const chunk = shown.slice(i, i + LINES_PER_EMBED);
    const page = Math.floor(i / LINES_PER_EMBED) + 1;
    const totalPages = Math.ceil(shown.length / LINES_PER_EMBED);
    const embed = new EmbedBuilder()
      .setTitle(page === 1 ? `${emoji} Voice-rapport` : `${emoji} Voice-rapport (${page}/${totalPages})`)
      .setDescription(chunk.join('\n'))
      .setFooter({
        text:
          lines.length > maxLines
            ? `Viser ${shown.length} af ${lines.length} sessioner · seneste ${days} dage`
            : `${lines.length} sessioner · seneste ${days} dage`,
      })
      .setTimestamp();

    if (page === 1 && filterNote) {
      embed.setDescription(`${filterNote.trim()}\n\n${chunk.join('\n')}`);
    }

    embeds.push(embed);
  }

  return embeds;
}

/**
 * Bygger og sender voice-rapport som DM til rapport-brugeren.
 * Data hentes altid fra VOICE_TRACK_GUILD_ID.
 */
async function sendVoiceReport(client, { days = 7, userId = null, channelId = null, channelName = null } = {}) {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = getVoiceSessions(VOICE_TRACK_GUILD_ID, {
    userId: userId ?? undefined,
    channelId: channelId ?? undefined,
    sinceMs,
  });

  const filterParts = [];
  if (userId) filterParts.push(`Bruger: <@${userId}>`);
  if (channelName || channelId) {
    filterParts.push(`Kanal: #${channelName ?? channelId}`);
  }
  const filterNote = filterParts.length ? `\n${filterParts.join(' · ')}` : '';

  const lines = buildLines(sessions);
  const embeds = buildEmbeds(lines, days, filterNote);

  const recipient = await client.users.fetch(VOICE_REPORT_USER_ID);
  for (let i = 0; i < embeds.length; i += 10) {
    await recipient.send({ embeds: embeds.slice(i, i + 10) });
  }

  return { sessions, recipient };
}

async function handleVoiceReportDm(message) {
  if (message.author.bot) return false;
  if (message.author.id !== VOICE_REPORT_USER_ID) return false;
  if (message.guild) return false;

  // Uden Message Content Intent er content ofte tomt – enhver DM fra
  // rapport-brugeren triggere derfor en standardrapport (7 dage).
  // Hvis content findes, accepteres også "rapport" / "rapport 14".
  const text = message.content?.trim() ?? '';
  let days = 7;
  if (text.length > 0) {
    const match = text.match(DM_TRIGGERS);
    if (!match) return false;
    if (match[1]) days = Number.parseInt(match[1], 10);
  }

  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > 90) days = 90;

  try {
    const { sessions } = await sendVoiceReport(message.client, { days });
    await message.reply(withEmoji(`Voice-rapport sendt (${sessions.length} sessioner, ${days} dage).`));
  } catch (error) {
    console.error('[voicerapport] DM-rapport fejlede:', error);
    await message.reply(withEmoji('Kunne ikke sende rapporten. Prøv igen om lidt.')).catch(() => {});
  }
  return true;
}

module.exports = {
  VOICE_REPORT_USER_ID,
  VOICE_TRACK_GUILD_ID,
  sendVoiceReport,
  handleVoiceReportDm,

  data: new SlashCommandBuilder()
    .setName('voicerapport')
    .setDescription('Send voice-aktivitetsrapport som DM til rapport-modtageren')
    .addUserOption((option) =>
      option.setName('bruger').setDescription('Filtrér på en bestemt bruger').setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Filtrér på en voice channel')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('dage')
        .setDescription('Hvor mange dage tilbage (1-90, default 7)')
        .setMinValue(1)
        .setMaxValue(90)
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!canRun(interaction)) {
      return interaction.reply({
        content: 'Kun server-admins (eller den konfigurerede rapport-bruger) kan bruge denne kommando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const days = interaction.options.getInteger('dage') ?? 7;
    const user = interaction.options.getUser('bruger');
    const channel = interaction.options.getChannel('kanal');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { sessions } = await sendVoiceReport(interaction.client, {
        days,
        userId: user?.id ?? null,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
      });
      return interaction.editReply(
        withEmoji(`Voice-rapport sendt som DM til <@${VOICE_REPORT_USER_ID}> (${sessions.length} sessioner).`),
      );
    } catch (error) {
      console.error('[voicerapport] Kunne ikke sende DM:', error);
      return interaction.editReply({
        content: withEmoji(
          `Kunne ikke sende DM til <@${VOICE_REPORT_USER_ID}>. Tjek at brugeren tillader DM fra botten.`,
        ),
      });
    }
  },
};
