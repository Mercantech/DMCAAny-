const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop afspilning, ryd køen og forlad voice channel'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: 'Botten er ikke tilsluttet en voice channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    queue.delete();
    return interaction.reply('Stoppede afspilning og forlod voice channel.');
  },
};
