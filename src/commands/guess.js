const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji, getBotEmoji } = require('../emoji');
const { getGuessScores, resetGuessScores } = require('../storage');
const { isAdmin } = require('../permissions');
const {
  loadTracks,
  pickRandomTracks,
  startGame,
  endGame,
  getActiveGame,
} = require('../games/guess');
const { beginGuessGame } = require('../components/guessButtons');

const DEFAULT_ROUNDS = 10;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 25;

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription('Gæt sangen – minigame')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start et nyt spil')
        .addIntegerOption((option) =>
          option
            .setName('antal')
            .setDescription(`Antal sange/runder (${MIN_ROUNDS}-${MAX_ROUNDS}, default ${DEFAULT_ROUNDS})`)
            .setMinValue(MIN_ROUNDS)
            .setMaxValue(MAX_ROUNDS)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName('stop').setDescription('Afslut det aktive spil'))
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Top 10 spillere på serveren'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Nulstil alle scores (admin)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'leaderboard') {
      const scores = getGuessScores(interaction.guildId);
      const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const embed = new EmbedBuilder().setTitle(`${getBotEmoji()} Gæt sangen – top 10`);
      if (!entries.length) {
        embed.setDescription('Ingen scores endnu. Start et spil med `/guess start`!');
      } else {
        embed.setDescription(entries.map(([id, score], i) => `\`#${i + 1}\` <@${id}> – **${score}** point`).join('\n'));
      }
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'reset') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: 'Kun admins kan nulstille scores.',
          flags: MessageFlags.Ephemeral,
        });
      }
      resetGuessScores(interaction.guildId);
      return interaction.reply(withEmoji('Alle gæt-scores nulstillet.'));
    }

    if (sub === 'stop') {
      const game = endGame(interaction.guildId);
      const queue = useQueue(interaction.guildId);
      if (queue && game) {
        queue.tracks.clear();
        if (queue.isPlaying()) queue.node.skip();
        setTimeout(() => {
          const latestQueue = useQueue(interaction.guildId);
          if (latestQueue) latestQueue.metadata = { ...(latestQueue.metadata ?? {}), guessGame: false };
        }, 1_000);
      }
      return interaction.reply({
        content: game ? `Stoppede spillet. Sidste svar var **${game.correct?.title ?? 'ukendt'}**.` : 'Intet aktivt spil.',
      });
    }

    if (sub === 'start') {
      if (getActiveGame(interaction.guildId)) {
        return interaction.reply({
          content: 'Der kører allerede et spil – brug `/guess stop` først.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: 'Du skal være i en voice channel for at starte spillet.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const queue = useQueue(interaction.guildId);
      if (queue && queue.channel?.id !== voiceChannel.id) {
        return interaction.reply({
          content: 'Botten er allerede i en anden voice channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const tracks = loadTracks();
      if (tracks.length < 4) {
        return interaction.reply({
          content: 'Track-poolen er for lille (kræver mindst 4 sange).',
          flags: MessageFlags.Ephemeral,
        });
      }

      const requestedRounds = interaction.options.getInteger('antal') ?? DEFAULT_ROUNDS;
      const selectedTracks = pickRandomTracks(tracks, Math.min(requestedRounds, tracks.length));

      if (selectedTracks.length < requestedRounds) {
        return interaction.reply({
          content: `Der er kun ${selectedTracks.length} unikke sange i poolen lige nu.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      if (queue) {
        queue.metadata = { ...(queue.metadata ?? {}), channel: interaction.channel, guessGame: true };
        queue.tracks.clear();
        if (queue.isPlaying()) queue.node.skip();
      }

      const message = await interaction.editReply({
        content: `Starter gæt sangen med **${selectedTracks.length}** sange...`,
        embeds: [],
        components: [],
      });

      const game = {
        id: randomId(),
        guildId: interaction.guildId,
        channel: interaction.channel,
        voiceChannel,
        requestedBy: interaction.user,
        pool: tracks,
        tracks: selectedTracks,
        roundIndex: 0,
        message,
        timer: null,
        roundComplete: false,
      };

      startGame(interaction.guildId, game);

      try {
        await beginGuessGame(game);
      } catch (error) {
        endGame(interaction.guildId);
        console.error('[/guess start] Kunne ikke starte spillet:', error);
        return interaction.editReply({
          content: `Kunne ikke starte spillet: ${error.message ?? 'ukendt fejl'}`,
          embeds: [],
          components: [],
        });
      }
    }
  },
};
