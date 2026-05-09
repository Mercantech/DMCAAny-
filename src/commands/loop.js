const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue, QueueRepeatMode } = require('discord-player');
const { withEmoji } = require('../emoji');

const MODES = {
  off: { value: QueueRepeatMode.OFF, label: 'slået fra' },
  track: { value: QueueRepeatMode.TRACK, label: 'nuværende sang' },
  queue: { value: QueueRepeatMode.QUEUE, label: 'hele køen' },
  autoplay: { value: QueueRepeatMode.AUTOPLAY, label: 'autoplay (relaterede sange)' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Sæt loop-mode for afspilningen')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Hvordan loopet skal opføre sig')
        .setRequired(true)
        .addChoices(
          { name: 'Slå fra', value: 'off' },
          { name: 'Nuværende sang', value: 'track' },
          { name: 'Hele køen', value: 'queue' },
          { name: 'Autoplay (relaterede sange)', value: 'autoplay' },
        ),
    ),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const mode = MODES[interaction.options.getString('mode', true)];
    queue.setRepeatMode(mode.value);

    return interaction.reply(withEmoji(`Loop sat til **${mode.label}**.`));
  },
};
