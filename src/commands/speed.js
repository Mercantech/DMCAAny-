const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');
const { setSpeed } = require('../audio/filters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('speed')
    .setDescription('Justér afspilningshastighed (0.5-2.0)')
    .addNumberOption((opt) =>
      opt
        .setName('value')
        .setDescription('Hastighed: 1.0 = normal, 0.5 = halv, 2.0 = dobbelt')
        .setRequired(true)
        .setMinValue(0.5)
        .setMaxValue(2.0),
    ),

  async execute(interaction) {
    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    const queue = useQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const value = interaction.options.getNumber('value', true);

    try {
      await setSpeed(queue, value);
      return interaction.reply(withEmoji(`Hastighed sat til **${value}x**.`));
    } catch (error) {
      console.error('[/speed] Fejl:', error);
      return interaction.reply({
        content: `Kunne ikke ændre hastighed: ${error.message ?? 'ukendt fejl'}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
