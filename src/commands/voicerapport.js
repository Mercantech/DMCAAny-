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

const MAX_EMBEDS = 10;
const FIELD_VALUE_MAX = 1000;
const MIN_SEGMENT_MS = 60 * 1000;
const DM_TRIGGERS = /^(?:rapport|voicerapport)(?:\s+(\d{1,2}))?$/i;

function formatClock(ts) {
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

/** Sweep-line: find tidsrum hvor det samme sæt brugere var i kanalen. */
function buildCoPresenceSegments(channelSessions, now) {
  const events = [];
  for (const s of channelSessions) {
    const start = s.joinedAt;
    const end = s.leftAt ?? now;
    if (end <= start) continue;
    events.push({ t: start, d: 1, userId: s.userId });
    events.push({ t: end, d: -1, userId: s.userId });
  }
  // Ends før starts ved samme tidspunkt
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  const present = new Map();
  const segments = [];
  let lastT = null;

  for (const ev of events) {
    if (lastT !== null && ev.t > lastT && present.size > 0) {
      segments.push({
        start: lastT,
        end: ev.t,
        userIds: [...present.keys()].sort(),
      });
    }
    if (ev.d === 1) {
      present.set(ev.userId, (present.get(ev.userId) || 0) + 1);
    } else {
      const next = (present.get(ev.userId) || 1) - 1;
      if (next <= 0) present.delete(ev.userId);
      else present.set(ev.userId, next);
    }
    lastT = ev.t;
  }

  const merged = [];
  for (const seg of segments) {
    const key = seg.userIds.join(',');
    const prev = merged[merged.length - 1];
    if (prev && prev.userIds.join(',') === key && prev.end === seg.start) {
      prev.end = seg.end;
    } else {
      merged.push({ start: seg.start, end: seg.end, userIds: [...seg.userIds] });
    }
  }
  return merged;
}

function groupSessionsByChannel(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.channelId)) {
      map.set(s.channelId, {
        channelId: s.channelId,
        channelName: s.channelName || s.channelId,
        sessions: [],
      });
    }
    const g = map.get(s.channelId);
    if (s.channelName) g.channelName = s.channelName;
    g.sessions.push(s);
  }
  return [...map.values()].sort((a, b) => a.channelName.localeCompare(b.channelName, 'da'));
}

function mentionList(userIds) {
  return userIds.map((id) => `<@${id}>`).join(' · ');
}

function formatChannelBody(channelGroup, now) {
  const segments = buildCoPresenceSegments(channelGroup.sessions, now).filter(
    (seg) => seg.end - seg.start >= MIN_SEGMENT_MS,
  );

  const together = segments.filter((s) => s.userIds.length >= 2);
  const solo = segments.filter((s) => s.userIds.length === 1);

  const openNow = new Set(
    channelGroup.sessions.filter((s) => s.leftAt === null).map((s) => s.userId),
  );

  const lines = [];

  if (together.length > 0) {
    lines.push('**Sammen**');
    for (const seg of together) {
      lines.push(
        `\`${formatClock(seg.start)}–${formatClock(seg.end)}\` (${formatDuration(seg.end - seg.start)})`,
      );
      lines.push(`→ ${mentionList(seg.userIds)}`);
    }
  }

  if (solo.length > 0) {
    if (lines.length) lines.push('');
    lines.push('**Alene**');
    for (const seg of solo) {
      lines.push(
        `\`${formatClock(seg.start)}–${formatClock(seg.end)}\` · ${mentionList(seg.userIds)} (${formatDuration(seg.end - seg.start)})`,
      );
    }
  }

  if (openNow.size > 0) {
    if (lines.length) lines.push('');
    lines.push(`**Nu:** ${mentionList([...openNow].sort())}`);
  }

  if (lines.length === 0) {
    return '_Ingen segmenter over 1 minut._';
  }

  return lines.join('\n');
}

function chunkFieldValue(text) {
  if (text.length <= FIELD_VALUE_MAX) return [text];
  const chunks = [];
  const parts = text.split('\n');
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}\n${part}` : part;
    if (next.length > FIELD_VALUE_MAX && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildReportEmbeds(sessions, days, filterNote) {
  const emoji = getBotEmoji();
  const now = Date.now();

  if (sessions.length === 0) {
    return [
      new EmbedBuilder()
        .setTitle(`${emoji} Voice-rapport`)
        .setDescription(`Ingen voice-aktivitet i de seneste ${days} dag(e).${filterNote ? `\n${filterNote}` : ''}`)
        .setTimestamp(),
    ];
  }

  const channels = groupSessionsByChannel(sessions);
  let togetherCount = 0;
  for (const ch of channels) {
    togetherCount += buildCoPresenceSegments(ch.sessions, now).filter(
      (s) => s.userIds.length >= 2 && s.end - s.start >= MIN_SEGMENT_MS,
    ).length;
  }

  const footer = `${togetherCount} samvær · ${channels.length} kanal(er) · seneste ${days} dage`;
  const fields = [];

  for (const ch of channels) {
    const body = formatChannelBody(ch, now);
    const chunks = chunkFieldValue(body);
    const baseName = `#${ch.channelName}`.slice(0, 250);
    for (let i = 0; i < chunks.length; i++) {
      fields.push({
        name: i === 0 ? baseName : `${baseName} (fortsat)`.slice(0, 256),
        value: chunks[i],
      });
    }
  }

  const embeds = [];
  const FIELDS_PER_EMBED = 25;

  for (let i = 0; i < fields.length && embeds.length < MAX_EMBEDS; i += FIELDS_PER_EMBED) {
    const chunk = fields.slice(i, i + FIELDS_PER_EMBED);
    const embed = new EmbedBuilder()
      .setTitle(i === 0 ? `${emoji} Voice-rapport` : `${emoji} Voice-rapport (fortsat)`)
      .setTimestamp()
      .setFooter({ text: footer })
      .addFields(chunk);

    if (i === 0) {
      embed.setDescription(
        [filterNote || null, 'Hvem sad **sammen** i samme rum — tider er slået sammen.'].filter(Boolean).join('\n'),
      );
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
  const filterNote = filterParts.length ? filterParts.join(' · ') : '';

  const embeds = buildReportEmbeds(sessions, days, filterNote);

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
  buildCoPresenceSegments,
  buildReportEmbeds,

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
