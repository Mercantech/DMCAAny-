const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Fortsæt afspilningen efter pause'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: 'Der er ingen aktiv kø.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!queue.node.isPaused()) {
      return interaction.reply({
        content: 'Afspilningen er ikke på pause.',
        flags: MessageFlags.Ephemeral,
      });
    }

    queue.node.resume();
    return interaction.reply('Fortsætter afspilningen.');
  },
};
