const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { useMainPlayer, useQueue, QueryType } = require('discord-player');
const { withEmoji, getBotEmoji } = require('../emoji');
const { getGuessScores, resetGuessScores } = require('../storage');
const { isAdmin } = require('../permissions');
const {
  loadTracks,
  pickRandomTrack,
  pickOptions,
  startGame,
  endGame,
  getActiveGame,
  ROUND_DURATION_MS,
} = require('../games/guess');
const { buildGuessButtons, buildGuessEmbed } = require('../components/guessButtons');

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription('Gæt sangen – minigame')
    .addSubcommand((sub) => sub.setName('start').setDescription('Start en ny runde'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Afslut den aktive runde'))
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
      if (queue && game) queue.node.skip();
      return interaction.reply({
        content: game ? `Stoppede runden. Svaret var **${game.correct.title}**.` : 'Ingen aktiv runde.',
      });
    }

    if (sub === 'start') {
      if (getActiveGame(interaction.guildId)) {
        return interaction.reply({
          content: 'Der kører allerede en runde – brug `/guess stop` først.',
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

      const tracks = loadTracks();
      if (tracks.length < 4) {
        return interaction.reply({
          content: 'Track-poolen er for lille (kræver mindst 4 sange).',
          flags: MessageFlags.Ephemeral,
        });
      }

      const correct = pickRandomTrack(tracks);
      const options = pickOptions(tracks, correct, 4);
      const gameId = randomId();
      const player = useMainPlayer();

      await interaction.deferReply();

      try {
        await player.play(voiceChannel, correct.query, {
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
      } catch (error) {
        console.error('[/guess start] Kunne ikke afspille:', error);
        return interaction.editReply(`Kunne ikke starte runden: ${error.message ?? 'ukendt fejl'}`);
      }

      const round = {
        id: gameId,
        correct,
        options,
        durationMs: ROUND_DURATION_MS,
        answeredBy: new Set(),
      };

      const message = await interaction.editReply({
        embeds: [buildGuessEmbed(round)],
        components: buildGuessButtons(options, gameId),
      });

      const timer = setTimeout(async () => {
        const stillActive = getActiveGame(interaction.guildId);
        if (stillActive?.id !== gameId) return;
        endGame(interaction.guildId);
        const queue = useQueue(interaction.guildId);
        if (queue) queue.node.skip();
        await message
          .edit({
            embeds: [
              new EmbedBuilder()
                .setTitle(`${getBotEmoji()} Tiden er gået!`)
                .setDescription(`Det rigtige svar var **${correct.title}**.`),
            ],
            components: [],
          })
          .catch(() => {});
      }, ROUND_DURATION_MS);

      startGame(interaction.guildId, { ...round, timer });
    }
  },
};
