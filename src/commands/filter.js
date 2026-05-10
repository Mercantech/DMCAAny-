const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji, getBotEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');
const { FILTER_PRESETS } = require('../audio/presets');
const { addFilter, removeFilter, clearFilters, getActiveFilters } = require('../audio/filters');

const PRESET_CHOICES = FILTER_PRESETS.map((p) => ({ name: p, value: p }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Audio-filtre (bassboost, nightcore, 8D osv.)')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Aktivér et filter')
        .addStringOption((opt) =>
          opt.setName('preset').setDescription('Filter at aktivere').setRequired(true).addChoices(...PRESET_CHOICES.slice(0, 25)),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Fjern et filter')
        .addStringOption((opt) =>
          opt
            .setName('preset')
            .setDescription('Filter at fjerne')
            .setRequired(true)
            .addChoices(...PRESET_CHOICES.slice(0, 25)),
        ),
    )
    .addSubcommand((sub) => sub.setName('clear').setDescription('Fjern alle filtre'))
    .addSubcommand((sub) => sub.setName('list').setDescription('Vis aktive filtre')),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const active = getActiveFilters(queue);
      const embed = new EmbedBuilder()
        .setTitle(`${getBotEmoji()} Aktive filtre`)
        .setDescription(active.length ? active.map((f) => `\`${f}\``).join('\n') : '*Ingen aktive filtre*');
      return interaction.reply({ embeds: [embed] });
    }

    if (!isDJ(interaction)) {
      return interaction.reply({ content: djOnlyMessage(), flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      if (sub === 'add') {
        const preset = interaction.options.getString('preset', true);
        const active = await addFilter(queue, preset);
        return interaction.editReply(withEmoji(`Aktiverede **${preset}**. Aktive filtre: \`${active.join('`, `') || 'ingen'}\``));
      }

      if (sub === 'remove') {
        const preset = interaction.options.getString('preset', true);
        const active = await removeFilter(queue, preset);
        return interaction.editReply(withEmoji(`Fjernede **${preset}**. Aktive filtre: \`${active.join('`, `') || 'ingen'}\``));
      }

      if (sub === 'clear') {
        await clearFilters(queue);
        return interaction.editReply(withEmoji('Alle filtre fjernet.'));
      }
    } catch (error) {
      console.error('[/filter] Fejl:', error);
      return interaction.editReply(`Fejl: ${error.message ?? 'ukendt'}`);
    }
  },
};
