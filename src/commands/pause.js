const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Sæt afspilningen på pause'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.isPlaying()) {
      return interaction.reply({
        content: 'Der spilles ikke noget at sætte på pause.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (queue.node.isPaused()) {
      return interaction.reply({
        content: 'Afspilningen er allerede på pause. Brug `/resume` for at fortsætte.',
        flags: MessageFlags.Ephemeral,
      });
    }

    queue.node.pause();
    return interaction.reply(withEmoji('Afspilning sat på pause.'));
  },
};
