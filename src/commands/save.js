const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { getBotEmoji } = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Få nuværende sang sendt som DM'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const track = queue.currentTrack;

    const embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} Gemt sang`)
      .setDescription(`**[${track.title}](${track.url})**\n${track.author ? `af *${track.author}*` : ''}`)
      .addFields(
        { name: 'Varighed', value: `\`${track.duration}\``, inline: true },
        { name: 'Server', value: interaction.guild?.name ?? 'ukendt', inline: true },
      );

    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    try {
      await interaction.user.send({ embeds: [embed] });
      return interaction.reply({
        content: 'Sang sendt til dine DMs.',
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      return interaction.reply({
        content: 'Kunne ikke sende DM til dig. Slå "Tillad direkte beskeder fra serverens medlemmer" til i Discords privatlivsindstillinger.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
