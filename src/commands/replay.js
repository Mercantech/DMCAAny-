const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('replay')
    .setDescription('Start den nuværende sang forfra'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ok = await queue.node.seek(0);
    if (!ok) {
      return interaction.reply({
        content: 'Kunne ikke spole tilbage til start.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply(withEmoji(`Starter **${queue.currentTrack.title}** forfra.`));
  },
};
