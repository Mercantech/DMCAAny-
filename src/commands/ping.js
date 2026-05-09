const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBotEmoji } = require('../emoji');

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}t`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Vis bot-latency og uptime'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinger...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;
    const uptime = formatUptime(interaction.client.uptime ?? 0);

    const embed = new EmbedBuilder().setTitle(`${getBotEmoji()} Pong!`).addFields(
      { name: 'Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
      { name: 'WebSocket', value: `\`${Math.round(wsPing)}ms\``, inline: true },
      { name: 'Uptime', value: `\`${uptime}\``, inline: true },
    );

    return interaction.editReply({ content: '', embeds: [embed] });
  },
};
