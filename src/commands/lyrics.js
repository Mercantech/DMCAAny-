const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const { getBotEmoji } = require('../emoji');
const {
  findLyricsForTrack,
  parseSyncedLyrics,
  findActiveLineIndex,
} = require('../lyrics/lrclib');

const LIVE_INTERVAL_MS = 2500;
const LIVE_MAX_DURATION_MS = 8 * 60 * 1000;
const liveSessions = new Map();

function chunkLyrics(plain, maxChars = 4000) {
  const chunks = [];
  let current = '';
  for (const line of plain.split('\n')) {
    if (current.length + line.length + 1 > maxChars) {
      chunks.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function buildLiveEmbed(track, lines, idx) {
  const before = idx > 0 ? lines[idx - 1].text : '...';
  const current = idx >= 0 ? `**▶ ${lines[idx].text}**` : '*(venter på første linje)*';
  const after1 = idx + 1 < lines.length ? lines[idx + 1].text : '';
  const after2 = idx + 2 < lines.length ? lines[idx + 2].text : '';
  const after3 = idx + 3 < lines.length ? lines[idx + 3].text : '';

  return new EmbedBuilder()
    .setTitle(`${getBotEmoji()} Live lyrics – ${track.title}`)
    .setDescription([before, current, after1, after2, after3].filter(Boolean).join('\n'))
    .setFooter({ text: 'Opdateres automatisk – stoppes når sangen ender eller efter 8 min' });
}

function stopLiveSession(guildId) {
  const session = liveSessions.get(guildId);
  if (!session) return;
  clearInterval(session.timer);
  clearTimeout(session.maxTimeout);
  liveSessions.delete(guildId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Lyrics til den nuværende sang')
    .addSubcommand((sub) => sub.setName('show').setDescription('Vis hele lyrics som embed'))
    .addSubcommand((sub) => sub.setName('live').setDescription('Live scrolling lyrics (synced)'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Stop live lyrics-session')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const queue = useQueue(interaction.guildId);

    if (!queue?.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'stop') {
      const had = liveSessions.has(interaction.guildId);
      stopLiveSession(interaction.guildId);
      return interaction.reply({
        content: had ? 'Live lyrics stoppet.' : 'Ingen aktiv live-lyrics-session.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    const track = queue.currentTrack;

    let lyrics;
    try {
      lyrics = await findLyricsForTrack(track);
    } catch (error) {
      console.error('[/lyrics] LRCLib fejl:', error);
      return interaction.editReply('Kunne ikke kontakte LRCLib lige nu.');
    }

    if (!lyrics) {
      return interaction.editReply(`Ingen lyrics fundet for **${track.title}**.`);
    }

    if (sub === 'show') {
      const text = lyrics.plainLyrics || lyrics.syncedLyrics?.replace(/\[\d+:\d+(?:[.:]\d+)?\]\s?/g, '') || '';
      if (!text.trim()) {
        return interaction.editReply('Lyrics blev fundet, men er tomme.');
      }

      const chunks = chunkLyrics(text);
      const first = new EmbedBuilder()
        .setTitle(`${getBotEmoji()} ${track.title}`)
        .setDescription(chunks[0])
        .setFooter({ text: `Kilde: LRCLib · Side 1 af ${chunks.length}` });

      await interaction.editReply({ embeds: [first] });

      for (let i = 1; i < chunks.length && i < 4; i++) {
        const embed = new EmbedBuilder()
          .setDescription(chunks[i])
          .setFooter({ text: `Side ${i + 1} af ${chunks.length}` });
        await interaction.followUp({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (sub === 'live') {
      const synced = parseSyncedLyrics(lyrics.syncedLyrics);
      if (!synced.length) {
        return interaction.editReply(`Ingen synkroniserede lyrics for **${track.title}** – prøv \`/lyrics show\`.`);
      }

      stopLiveSession(interaction.guildId);

      const initial = buildLiveEmbed(track, synced, -1);
      const message = await interaction.editReply({ embeds: [initial] });

      const startedTrack = track;
      const timer = setInterval(async () => {
        const liveQueue = useQueue(interaction.guildId);
        if (!liveQueue?.currentTrack || liveQueue.currentTrack.url !== startedTrack.url) {
          stopLiveSession(interaction.guildId);
          message.edit({ embeds: [new EmbedBuilder().setTitle(`${getBotEmoji()} Live lyrics`).setDescription('Sangen sluttede – live-session stoppet.')] }).catch(() => {});
          return;
        }
        const currentMs = liveQueue.node.getTimestamp()?.current?.value ?? 0;
        const idx = findActiveLineIndex(synced, currentMs);
        message.edit({ embeds: [buildLiveEmbed(startedTrack, synced, idx)] }).catch(() => {});
      }, LIVE_INTERVAL_MS);

      const maxTimeout = setTimeout(() => {
        stopLiveSession(interaction.guildId);
        message.edit({ embeds: [new EmbedBuilder().setTitle(`${getBotEmoji()} Live lyrics`).setDescription('Live-session afsluttet (8 min grænse).')] }).catch(() => {});
      }, LIVE_MAX_DURATION_MS);

      liveSessions.set(interaction.guildId, { timer, maxTimeout, messageId: message.id });
    }
  },
};
