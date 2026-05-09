const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getBotEmoji } = require('../emoji');
const { getHistory } = require('../storage');

function timeAgo(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s siden`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m siden`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}t siden`;
  return `${Math.floor(diffSec / 86400)}d siden`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Vis seneste afspillede sange i serveren')
    .addIntegerOption((option) =>
      option
        .setName('antal')
        .setDescription('Hvor mange sange (1-25, default 10)')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false),
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('antal') ?? 10;
    const history = getHistory(interaction.guildId, limit);

    if (history.length === 0) {
      return interaction.reply({
        content: 'Ingen afspilningshistorik endnu.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const lines = history.map((entry, i) => {
      const requester = entry.addedBy ? `<@${entry.addedBy}>` : '';
      const link = entry.url ? `[${entry.title}](${entry.url})` : `**${entry.title}**`;
      return `**${i + 1}.** ${link} – ${timeAgo(entry.playedAt)} ${requester}`.trim();
    });

    const embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} Afspilningshistorik`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Seneste ${history.length} sange` });

    return interaction.reply({ embeds: [embed] });
  },
};
