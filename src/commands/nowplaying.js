const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { useQueue, QueueRepeatMode } = require('discord-player');
const { getBotEmoji } = require('../emoji');

const REPEAT_LABEL = {
  [QueueRepeatMode.OFF]: 'Off',
  [QueueRepeatMode.TRACK]: 'Track',
  [QueueRepeatMode.QUEUE]: 'Queue',
  [QueueRepeatMode.AUTOPLAY]: 'Autoplay',
};

function buildProgressBar(progressPercent, length = 20) {
  const safe = Math.max(0, Math.min(100, progressPercent));
  const filled = Math.round((safe / 100) * length);
  return `${'▬'.repeat(filled)}🔘${'▬'.repeat(Math.max(0, length - filled - 1))}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Vis info om sangen der spiller lige nu'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const track = queue.currentTrack;
    const ts = queue.node.getTimestamp();
    const progressBar = ts && ts.progress != null ? buildProgressBar(ts.progress) : null;
    const requestedBy = track.requestedBy ? `<@${track.requestedBy.id}>` : 'ukendt';

    const embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} Spiller nu`)
      .setDescription(`**[${track.title}](${track.url})**\n${track.author ? `af *${track.author}*` : ''}`)
      .addFields(
        {
          name: 'Tid',
          value: ts ? `\`${ts.current?.label ?? '0:00'} / ${ts.total?.label ?? track.duration}\`` : `\`${track.duration}\``,
          inline: true,
        },
        { name: 'Volume', value: `\`${queue.node.volume}%\``, inline: true },
        { name: 'Loop', value: `\`${REPEAT_LABEL[queue.repeatMode] ?? 'Off'}\``, inline: true },
        { name: 'Tilføjet af', value: requestedBy, inline: true },
        { name: 'Kø-længde', value: `\`${queue.tracks.size} sange\``, inline: true },
        { name: 'Pause', value: `\`${queue.node.isPaused() ? 'Ja' : 'Nej'}\``, inline: true },
      );

    if (progressBar) {
      embed.addFields({ name: 'Progress', value: progressBar });
    }

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    return interaction.reply({ embeds: [embed] });
  },
};
