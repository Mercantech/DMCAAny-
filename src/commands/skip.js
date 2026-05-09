const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Spring den nuværende sang over (DJ-only hvis DJ-rolle er sat – ellers brug /voteskip)'),

  async execute(interaction) {
    if (!isDJ(interaction)) {
      return interaction.reply({
        content: `${djOnlyMessage()} Brug \`/voteskip\` i stedet.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.isPlaying()) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = queue.currentTrack;
    queue.node.skip();

    return interaction.reply(withEmoji(`Sprang over: **${current?.title ?? 'nuværende sang'}**`));
  },
};
