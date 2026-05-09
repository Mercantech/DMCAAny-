const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Spring den nuværende sang over'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.isPlaying()) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = queue.currentTrack;
    queue.node.skip();

    return interaction.reply(`Sprang over: **${current?.title ?? 'nuværende sang'}**`);
  },
};
