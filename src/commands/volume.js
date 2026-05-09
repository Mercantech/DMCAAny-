const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Vis eller justér afspilnings-volume (0-200%)')
    .addIntegerOption((option) =>
      option
        .setName('niveau')
        .setDescription('Volume i procent (0-200). Spring over for at se nuværende niveau.')
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(false),
    ),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const level = interaction.options.getInteger('niveau');

    if (level === null) {
      return interaction.reply(withEmoji(`Nuværende volume: **${queue.node.volume}%**`));
    }

    const ok = queue.node.setVolume(level);
    if (!ok) {
      return interaction.reply({
        content: 'Kunne ikke ændre volume.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply(withEmoji(`Volume sat til **${level}%** af ${interaction.user}.`));
  },
};
