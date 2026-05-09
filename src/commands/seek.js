const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');

function parseTimeToMs(input) {
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }

  const parts = trimmed.split(':').map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;

  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else {
    return null;
  }
  return seconds * 1000;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Spol til en bestemt position i nuværende sang')
    .addStringOption((option) =>
      option
        .setName('tid')
        .setDescription('Position som sekunder (90), mm:ss (1:30) eller hh:mm:ss (1:00:00)')
        .setRequired(true),
    ),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ms = parseTimeToMs(interaction.options.getString('tid', true));
    if (ms === null || ms < 0) {
      return interaction.reply({
        content: 'Ugyldigt tidsformat. Brug fx `90`, `1:30` eller `1:00:00`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const durationMs = queue.currentTrack.durationMS;
    if (durationMs && ms > durationMs) {
      return interaction.reply({
        content: `Sangen er kun ${queue.currentTrack.duration} lang.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const ok = await queue.node.seek(ms);
    if (!ok) {
      return interaction.reply({
        content: 'Kunne ikke spole til den ønskede position.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return interaction.reply(withEmoji(`Spolede til **${m}:${String(s).padStart(2, '0')}**.`));
  },
};
