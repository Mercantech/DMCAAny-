const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Vis de næste sange i køen'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Køen er tom.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const tracks = queue.tracks.toArray();
    const upcoming = tracks
      .slice(0, 10)
      .map((track, index) => `**${index + 1}.** ${track.title} \`[${track.duration}]\``)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('Musikkø')
      .setDescription(upcoming || '*Ingen sange i kø*')
      .addFields({
        name: 'Spiller nu',
        value: `${queue.currentTrack.title} \`[${queue.currentTrack.duration}]\``,
      })
      .setFooter({
        text: tracks.length > 10 ? `Viser 10 af ${tracks.length} sange i kø` : `${tracks.length} sang(e) i kø`,
      });

    return interaction.reply({ embeds: [embed] });
  },
};
