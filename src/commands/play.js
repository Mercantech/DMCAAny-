const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useMainPlayer, QueryType } = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Afspil en sang fra YouTube eller SoundCloud')
    .addStringOption((option) =>
      option
        .setName('forespørgsel')
        .setDescription('Søgeord, YouTube-link eller SoundCloud-link')
        .setRequired(true),
    ),

  async execute(interaction) {
    const query = interaction.options.getString('forespørgsel', true);
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: 'Du skal være i en voice channel for at bruge denne kommando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const player = useMainPlayer();

    try {
      const { track } = await player.play(voiceChannel, query, {
        searchEngine: QueryType.AUTO,
        nodeOptions: {
          metadata: { channel: interaction.channel },
          leaveOnEnd: true,
          leaveOnEndCooldown: 60_000,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          selfDeaf: true,
          volume: 50,
        },
        requestedBy: interaction.user,
      });

      return interaction.followUp(`Tilføjet **${track.title}** til køen.`);
    } catch (error) {
      console.error('Fejl i /play:', error);
      return interaction.followUp(`Kunne ikke afspille: ${error.message ?? 'ukendt fejl'}`);
    }
  },
};
