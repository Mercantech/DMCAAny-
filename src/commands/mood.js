const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useMainPlayer, QueryType } = require('discord-player');
const { withEmoji } = require('../emoji');

const MOODS = {
  chill: { query: 'lo-fi hip hop chill beats playlist', label: 'Chill (lo-fi)' },
  happy: { query: 'upbeat happy pop hits playlist', label: 'Happy (pop)' },
  workout: { query: 'high energy workout music playlist', label: 'Workout' },
  sad: { query: 'sad acoustic ballads playlist', label: 'Sad (acoustic)' },
  focus: { query: 'instrumental study focus music playlist', label: 'Focus (instrumental)' },
  party: { query: 'edm party hits 2026 playlist', label: 'Party (EDM)' },
  dansk: { query: 'dansk hits 2026 playlist', label: 'Dansk hits' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mood')
    .setDescription('Tilføj en hel kø der matcher en stemning')
    .addStringOption((opt) =>
      opt
        .setName('vibe')
        .setDescription('Vælg stemning')
        .setRequired(true)
        .addChoices(
          ...Object.entries(MOODS).map(([key, val]) => ({ name: val.label, value: key })),
        ),
    ),

  async execute(interaction) {
    const vibe = interaction.options.getString('vibe', true);
    const mood = MOODS[vibe];
    if (!mood) {
      return interaction.reply({
        content: 'Ukendt vibe.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: 'Du skal være i en voice channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    const player = useMainPlayer();

    try {
      const result = await player.play(voiceChannel, mood.query, {
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

      const trackTitle = result.track?.title ?? 'mood-mix';
      return interaction.editReply(withEmoji(`Mood **${mood.label}** startet – nu spiller: **${trackTitle}**.`));
    } catch (error) {
      console.error('[/mood] Fejl:', error);
      return interaction.editReply(`Kunne ikke starte mood: ${error.message ?? 'ukendt fejl'}`);
    }
  },
};
