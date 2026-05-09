const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useMainPlayer, QueryType } = require('discord-player');
const { withEmoji } = require('../emoji');

function truncate(str, max = 95) {
  if (!str) return 'Ukendt';
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Søg på YouTube og vælg blandt top-5 resultater')
    .addStringOption((option) =>
      option
        .setName('forespørgsel')
        .setDescription('Begynd at skrive – forslag dukker op')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    if (!focused || focused.length < 2) {
      return interaction.respond([]);
    }

    const player = useMainPlayer();
    try {
      const results = await player.search(focused, {
        searchEngine: QueryType.YOUTUBE_SEARCH,
      });

      const choices = (results.tracks ?? [])
        .slice(0, 5)
        .map((track) => ({
          name: truncate(`${track.title} — ${track.author} [${track.duration}]`),
          value: track.url.length > 100 ? track.url.slice(0, 100) : track.url,
        }));

      return interaction.respond(choices);
    } catch (error) {
      console.error('[search autocomplete] Fejl:', error.message ?? error);
      return interaction.respond([]);
    }
  },

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

      return interaction.followUp(withEmoji(`Tilføjet **${track.title}** til køen.`));
    } catch (error) {
      console.error('Fejl i /search:', error);
      return interaction.followUp(`Kunne ikke afspille: ${error.message ?? 'ukendt fejl'}`);
    }
  },
};
