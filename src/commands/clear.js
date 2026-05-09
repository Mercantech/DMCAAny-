const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Tøm køen (uden at stoppe den nuværende sang)'),

  async execute(interaction) {
    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    const queue = useQueue(interaction.guildId);

    if (!queue || queue.tracks.size === 0) {
      return interaction.reply({
        content: 'Køen er allerede tom.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const count = queue.tracks.size;
    queue.tracks.clear();

    return interaction.reply(withEmoji(`Fjernede **${count}** sange fra køen.`));
  },
};
