const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji, getBotEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');
const { getAudioQuality, setAudioQuality } = require('../storage');
const { addFilter, removeFilter, getActiveFilters } = require('../audio/filters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audio')
    .setDescription('Audio-kvalitet (loudness-norm + anti-klipping)')
    .addSubcommand((sub) =>
      sub
        .setName('quality')
        .setDescription('Slå auto loudness-normalisering + softlimiter til/fra')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('on / off / status')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' },
              { name: 'status', value: 'status' },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'quality') return;

    const mode = interaction.options.getString('mode', true);
    const guildId = interaction.guildId;

    if (mode === 'status') {
      const active = getAudioQuality(guildId);
      const queue = useQueue(guildId);
      const liveFilters = queue ? getActiveFilters(queue) : [];
      const embed = new EmbedBuilder()
        .setTitle(`${getBotEmoji()} Audio-kvalitet`)
        .setDescription(active ? '**ON** – softlimiter aktiveres automatisk' : '**OFF**')
        .addFields({ name: 'Aktive filtre nu', value: liveFilters.length ? liveFilters.map((f) => `\`${f}\``).join(' ') : '*ingen*' });
      return interaction.reply({ embeds: [embed] });
    }

    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    const enabled = mode === 'on';
    setAudioQuality(guildId, enabled);

    const queue = useQueue(guildId);
    if (queue) {
      try {
        if (enabled) {
          await addFilter(queue, 'softlimiter');
        } else {
          await removeFilter(queue, 'softlimiter');
        }
      } catch (error) {
        console.warn('[/audio quality] kunne ikke opdatere live-filter:', error.message);
      }
    }

    return interaction.reply(withEmoji(enabled ? 'Audio-kvalitet **ON** (softlimiter aktiveret automatisk).' : 'Audio-kvalitet **OFF**.'));
  },
};
