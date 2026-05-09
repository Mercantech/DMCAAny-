const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { withEmoji } = require('../emoji');
const { getDjRole, setDjRole } = require('../storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dj')
    .setDescription('Konfigurér DJ-rollen for serveren')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Sæt en rolle som DJ-rolle')
        .addRoleOption((option) => option.setName('rolle').setDescription('Rollen der får DJ-rettigheder').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('remove').setDescription('Fjern DJ-rollen (alle kan så bruge alle kommandoer)'))
    .addSubcommand((sub) => sub.setName('show').setDescription('Vis hvilken rolle der er sat som DJ')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const role = interaction.options.getRole('rolle', true);
      setDjRole(interaction.guildId, role.id);
      return interaction.reply(withEmoji(`DJ-rolle sat til <@&${role.id}>.`));
    }

    if (sub === 'remove') {
      setDjRole(interaction.guildId, null);
      return interaction.reply(withEmoji('DJ-rolle fjernet – alle kan nu bruge alle kommandoer.'));
    }

    const current = getDjRole(interaction.guildId);
    if (!current) {
      return interaction.reply({
        content: 'Der er ingen DJ-rolle sat. Alle kan bruge alle kommandoer.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: withEmoji(`Nuværende DJ-rolle: <@&${current}>`),
      flags: MessageFlags.Ephemeral,
    });
  },
};
