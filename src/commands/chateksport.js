const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const { withEmoji } = require('../emoji');
const { isAdmin } = require('../permissions');
const { VOICE_REPORT_USER_ID } = require('../voiceConfig');

const REPORT_TIMEZONE = 'Europe/Copenhagen';
const MAX_FILE_BYTES = 7.5 * 1024 * 1024; // under Discord's typiske 8–25 MB-grænse
const FETCH_PAUSE_MS = 350;

function canRun(interaction) {
  if (interaction.user.id === VOICE_REPORT_USER_ID) return true;
  if (interaction.inGuild() && isAdmin(interaction.member)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function formatStamp(ts) {
  return new Date(ts).toLocaleString('da-DK', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatMessage(msg) {
  const author = msg.author
    ? `${msg.author.tag || msg.author.username} (${msg.author.id})`
    : 'ukendt';
  const parts = [`[${formatStamp(msg.createdTimestamp)}] ${author}`];

  if (msg.content) {
    parts.push(msg.content);
  } else if (msg.attachments.size === 0 && msg.stickers.size === 0 && msg.embeds.length === 0) {
    parts.push('(intet tekst-indhold)');
  }

  if (msg.attachments.size > 0) {
    for (const att of msg.attachments.values()) {
      parts.push(`  [fil] ${att.name || 'attachment'}: ${att.url}`);
    }
  }
  if (msg.stickers.size > 0) {
    for (const sticker of msg.stickers.values()) {
      parts.push(`  [sticker] ${sticker.name}`);
    }
  }
  if (msg.embeds.length > 0) {
    parts.push(`  [embeds: ${msg.embeds.length}]`);
  }
  if (msg.reference?.messageId) {
    parts.push(`  [svar til: ${msg.reference.messageId}]`);
  }

  return parts.join('\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hent beskeder nyeste→ældste indtil sinceMs, returnér kronologisk.
 */
async function fetchChannelMessages(channel, sinceMs) {
  const collected = [];
  let before = undefined;
  let emptyContentHints = 0;

  while (true) {
    const options = { limit: 100 };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    const sorted = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    let reachedEnd = false;

    for (const msg of sorted) {
      if (msg.createdTimestamp < sinceMs) {
        reachedEnd = true;
        break;
      }
      if (!msg.content && msg.attachments.size === 0 && msg.embeds.length === 0) {
        emptyContentHints += 1;
      }
      collected.push(msg);
    }

    before = sorted[sorted.length - 1]?.id;
    if (reachedEnd || batch.size < 100 || !before) break;
    await sleep(FETCH_PAUSE_MS);
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { messages: collected, emptyContentHints };
}

function buildExportText(channel, days, messages) {
  const header = [
    `Chat-eksport: #${channel.name || channel.id}`,
    `Kanal-ID: ${channel.id}`,
    `Server-ID: ${channel.guildId || 'n/a'}`,
    `Periode: seneste ${days} dag(e) (Europe/Copenhagen)`,
    `Eksporteret: ${formatStamp(Date.now())}`,
    `Ant beskeder: ${messages.length}`,
    ''.padEnd(60, '-'),
    '',
  ].join('\n');

  const body = messages.map(formatMessage).join('\n\n');
  return `${header}${body}\n`;
}

function safeFileName(name) {
  return String(name || 'kanal')
    .replace(/[^\w\-æøåÆØÅ]+/gi, '_')
    .slice(0, 40);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chateksport')
    .setDescription('Eksporter en kanals chat privat som DM (kun dig ser kommandoen)')
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Kanal der skal eksporteres')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.GuildVoice,
          ChannelType.GuildStageVoice,
        )
        .setRequired(true),
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

    const channel = interaction.options.getChannel('kanal', true);
    const days = interaction.options.getInteger('dage') ?? 7;

    if (!channel.isTextBased?.() || channel.isDMBased?.()) {
      return interaction.reply({
        content: 'Vælg en tekstbaseret server-kanal.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Ephemeral = ingen andre ser at kommandoen blev brugt
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const me = channel.guild?.members?.me;
      if (me) {
        const perms = channel.permissionsFor(me);
        if (perms && (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.ReadMessageHistory))) {
          return interaction.editReply({
            content: withEmoji(
              `Botten mangler rettigheder i <#${channel.id}> (View Channel + Read Message History).`,
            ),
          });
        }
      }

      await interaction.editReply({
        content: withEmoji(`Henter beskeder fra <#${channel.id}> (seneste ${days} dage)…`),
      });

      const { messages, emptyContentHints } = await fetchChannelMessages(channel, sinceMs);

      if (messages.length === 0) {
        return interaction.editReply({
          content: withEmoji(`Ingen beskeder i <#${channel.id}> inden for de seneste ${days} dag(e).`),
        });
      }

      let text = buildExportText(channel, days, messages);
      let truncated = false;
      let buffer = Buffer.from(text, 'utf8');

      if (buffer.byteLength > MAX_FILE_BYTES) {
        truncated = true;
        // Behold header + så meget body som muligt
        const headerEnd = text.indexOf('\n\n') + 2;
        const header = text.slice(0, Math.max(headerEnd, 0));
        const budget = MAX_FILE_BYTES - Buffer.byteLength(header, 'utf8') - 200;
        let body = text.slice(header.length);
        while (Buffer.byteLength(body, 'utf8') > budget && body.length > 0) {
          body = body.slice(0, Math.floor(body.length * 0.9));
        }
        text =
          header +
          body +
          `\n\n---\n[AFKORTET: filen oversteg størrelsesgrænsen. Eksporter færre dage.]\n`;
        buffer = Buffer.from(text, 'utf8');
      }

      const fileName = `chat-${safeFileName(channel.name)}-${days}d.txt`;
      const file = new AttachmentBuilder(buffer, { name: fileName });

      const recipient = await interaction.client.users.fetch(VOICE_REPORT_USER_ID);
      const intentHint =
        emptyContentHints > messages.length * 0.5
          ? '\n\n⚠️ Mange beskeder manglede tekst — slå **Message Content Intent** til i Discord Developer Portal og genstart botten.'
          : '';

      await recipient.send({
        content: withEmoji(
          `Chat-eksport af **#${channel.name}** (${messages.length} beskeder, ${days} dage).` +
            (truncated ? ' Filen blev afkortet pga. størrelse.' : '') +
            intentHint,
        ),
        files: [file],
      });

      return interaction.editReply({
        content: withEmoji(
          `Eksport sendt som DM til <@${VOICE_REPORT_USER_ID}> ` +
            `(#${channel.name}, ${messages.length} beskeder, ${days} dage)` +
            (truncated ? ' — afkortet.' : '.') +
            ' Kun du så denne kommando.',
        ),
      });
    } catch (error) {
      console.error('[chateksport] Fejl:', error);
      return interaction.editReply({
        content: withEmoji(
          `Kunne ikke eksportere <#${channel.id}>. Tjek bot-rettigheder og at DM er åben. (${error.message || 'fejl'})`,
        ),
      });
    }
  },
};
