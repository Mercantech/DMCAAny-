const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Hop direkte til en bestemt sang i køen')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Positionen i køen (se /queue for numre)')
        .setMinValue(1)
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    const queue = useQueue(interaction.guildId);

    if (!queue || queue.tracks.size === 0) {
      return interaction.reply({
        content: 'Køen er tom.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const position = interaction.options.getInteger('position', true);
    if (position > queue.tracks.size) {
      return interaction.reply({
        content: `Køen har kun ${queue.tracks.size} sange.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const track = queue.tracks.at(position - 1);
    queue.node.jump(position - 1);

    return interaction.reply(withEmoji(`Hopper til **${track?.title ?? 'sang'}**.`));
  },
};
