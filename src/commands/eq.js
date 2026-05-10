const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');
const { EQ_PRESETS, EQ_LABELS } = require('../audio/presets');
const { applyEqualizer, disableEqualizer } = require('../audio/filters');

const PRESET_CHOICES = Object.keys(EQ_PRESETS).map((name) => ({
  name: EQ_LABELS[name] ?? name,
  value: name,
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eq')
    .setDescription('Anvend en equalizer-preset')
    .addStringOption((opt) =>
      opt
        .setName('preset')
        .setDescription('Vælg preset (eller "off" for at slå EQ fra)')
        .setRequired(true)
        .addChoices({ name: 'Off (deaktivér EQ)', value: 'off' }, ...PRESET_CHOICES),
    ),

  async execute(interaction) {
    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    const queue = useQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const preset = interaction.options.getString('preset', true);

    try {
      if (preset === 'off') {
        await disableEqualizer(queue);
        return interaction.reply(withEmoji('Equalizer slået fra.'));
      }

      await applyEqualizer(queue, preset);
      return interaction.reply(withEmoji(`EQ-preset: **${EQ_LABELS[preset] ?? preset}**.`));
    } catch (error) {
      console.error('[/eq] Fejl:', error);
      return interaction.reply({
        content: `Kunne ikke anvende EQ: ${error.message ?? 'ukendt fejl'}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
