const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Bland køen i tilfældig rækkefølge'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || queue.tracks.size === 0) {
      return interaction.reply({
        content: 'Der er ingen sange i køen at blande.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const count = queue.tracks.size;
    queue.tracks.shuffle();

    return interaction.reply(withEmoji(`Blandede **${count}** sange i køen.`));
  },
};
