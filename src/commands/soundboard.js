const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { withEmoji, getBotEmoji } = require('../emoji');
const { isAdmin } = require('../permissions');
const { getSounds, addSound, removeSound } = require('../storage');
const { buildSoundboardMessage } = require('../components/soundboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('soundboard')
    .setDescription('Server-soundboard med korte lyde')
    .addSubcommand((sub) => sub.setName('show').setDescription('Vis soundboardet med knapper'))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Tilføj en ny lyd (admin)')
        .addStringOption((opt) => opt.setName('navn').setDescription('Kort navn (vises på knappen)').setRequired(true))
        .addStringOption((opt) => opt.setName('url').setDescription('URL til lyden (mp3, YouTube, etc.)').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Valgfri emoji til knappen').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Fjern en lyd (admin)')
        .addStringOption((opt) => opt.setName('navn').setDescription('Lydens navn').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Vis liste over alle lyde')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      return interaction.reply(buildSoundboardMessage(interaction.guildId));
    }

    if (sub === 'list') {
      const sounds = getSounds(interaction.guildId);
      const embed = new EmbedBuilder().setTitle(`${getBotEmoji()} Soundboard – ${sounds.length} lyde`);
      if (!sounds.length) {
        embed.setDescription('Ingen lyde endnu.');
      } else {
        embed.setDescription(sounds.map((s) => `• ${s.emoji ?? ''} **${s.name}** – \`${s.url}\``).join('\n').slice(0, 4000));
      }
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'add') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'Kun admins kan tilføje lyde.', flags: MessageFlags.Ephemeral });
      }
      const navn = interaction.options.getString('navn', true).trim();
      const url = interaction.options.getString('url', true).trim();
      const emoji = interaction.options.getString('emoji')?.trim() || null;

      if (navn.length < 1 || navn.length > 30) {
        return interaction.reply({ content: 'Navn skal være 1-30 tegn.', flags: MessageFlags.Ephemeral });
      }
      try {
        new URL(url);
      } catch {
        return interaction.reply({ content: 'Ugyldig URL.', flags: MessageFlags.Ephemeral });
      }

      try {
        const total = addSound(interaction.guildId, { name: navn, url, emoji });
        return interaction.reply(withEmoji(`Tilføjede **${navn}** (${total} lyde i alt).`));
      } catch (error) {
        return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'remove') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'Kun admins kan fjerne lyde.', flags: MessageFlags.Ephemeral });
      }
      const navn = interaction.options.getString('navn', true);
      const removed = removeSound(interaction.guildId, navn);
      if (!removed) {
        return interaction.reply({ content: `Ingen lyd fundet med navnet "${navn}".`, flags: MessageFlags.Ephemeral });
      }
      return interaction.reply(withEmoji(`Fjernede **${navn}**.`));
    }
  },
};
