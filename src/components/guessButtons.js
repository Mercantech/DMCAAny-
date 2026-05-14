const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { useMainPlayer, useQueue, QueryType } = require('discord-player');
const { getBotEmoji } = require('../emoji');
const { addGuessPoint } = require('../storage');
const { getActiveGame, endGame, pickOptions, ROUND_DURATION_MS } = require('../games/guess');

const NEXT_ROUND_DELAY_MS = 2_000;

function buildGuessButtons(options, roundId) {
  const rows = [];
  let row = new ActionRowBuilder();
  options.forEach((option, idx) => {
    if (idx > 0 && idx % 2 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`guess:answer:${roundId}:${idx}`)
        .setLabel(`${idx + 1}. ${option.title}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
    );
  });
  if (row.components.length) rows.push(row);
  return rows;
}

function buildGuessEmbed(round) {
  return new EmbedBuilder()
    .setTitle(`${getBotEmoji()} Gæt sangen!`)
    .setDescription('Hvilken sang spilles lige nu? Vælg det rigtige svar nedenfor.')
    .addFields({
      name: 'Runde',
      value: `${round.roundNumber}/${round.totalRounds}`,
      inline: true,
    })
    .setFooter({ text: `Runde slutter automatisk om ${Math.round(round.durationMs / 1000)} sek` });
}

function stopCurrentGuessAudio(guildId) {
  const queue = useQueue(guildId);
  if (!queue) return;

  queue.tracks.clear();
  if (queue.isPlaying()) {
    queue.node.skip();
  }
  setTimeout(() => {
    const latestQueue = useQueue(guildId);
    if (latestQueue) latestQueue.metadata = { ...(latestQueue.metadata ?? {}), guessGame: false };
  }, 1_000);
}

async function playGuessRound(game, { skipCurrent = false } = {}) {
  const player = useMainPlayer();
  const queue = useQueue(game.guildId);

  if (queue) {
    queue.metadata = { ...(queue.metadata ?? {}), channel: game.channel, guessGame: true };
    if (skipCurrent) {
      queue.tracks.clear();
      if (queue.isPlaying()) queue.node.skip();
    }
  }

  const correct = game.tracks[game.roundIndex];
  game.correct = correct;
  game.options = pickOptions(game.pool, correct, 4);
  game.answeredBy = new Set();
  game.roundComplete = false;
  game.roundId = `${game.id}-${game.roundIndex}-${Date.now().toString(36)}`;

  try {
    await player.play(game.voiceChannel, correct.query, {
      searchEngine: QueryType.AUTO,
      nodeOptions: {
        metadata: { channel: game.channel, guessGame: true },
        leaveOnEnd: true,
        leaveOnEndCooldown: 60_000,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        selfDeaf: true,
        volume: 50,
      },
      requestedBy: game.requestedBy,
    });
  } catch (error) {
    console.error('[/guess] Kunne ikke afspille runde:', error);
    endGame(game.guildId);
    await game.message
      .edit({
        content: `Kunne ikke starte næste runde: ${error.message ?? 'ukendt fejl'}`,
        embeds: [],
        components: [],
      })
      .catch(() => {});
    return;
  }

  await game.message
    .edit({
      content: '',
      embeds: [
        buildGuessEmbed({
          ...game,
          roundNumber: game.roundIndex + 1,
          totalRounds: game.tracks.length,
          durationMs: ROUND_DURATION_MS,
        }),
      ],
      components: buildGuessButtons(game.options, game.roundId),
    })
    .catch(() => {});

  game.timer = setTimeout(() => {
    finishGuessRound(game.guildId, { reason: 'timeout' }).catch((error) => {
      console.error('[guess timeout] Fejl:', error);
    });
  }, ROUND_DURATION_MS);
}

async function beginGuessGame(game) {
  await playGuessRound(game);
}

async function advanceOrEndGame(game) {
  const isLastRound = game.roundIndex >= game.tracks.length - 1;

  if (isLastRound) {
    stopCurrentGuessAudio(game.guildId);
    endGame(game.guildId);
    return;
  }

  game.roundIndex += 1;
  setTimeout(() => {
    const stillActive = getActiveGame(game.guildId);
    if (stillActive?.id !== game.id) return;
    playGuessRound(game, { skipCurrent: true }).catch((error) => {
      console.error('[guess next round] Fejl:', error);
    });
  }, NEXT_ROUND_DELAY_MS);
}

async function finishGuessRound(guildId, { interaction = null, reason = 'correct', winner = null } = {}) {
  const game = getActiveGame(guildId);
  if (!game || game.roundComplete) return false;

  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }
  game.roundComplete = true;

  const isLastRound = game.roundIndex >= game.tracks.length - 1;
  let embed;

  if (reason === 'timeout') {
    embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} Tiden er gået!`)
      .setDescription(`Det rigtige svar var **${game.correct.title}**.`)
      .addFields({ name: 'Runde', value: `${game.roundIndex + 1}/${game.tracks.length}`, inline: true });
  } else {
    const newScore = addGuessPoint(guildId, winner.id, 1);
    embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} Korrekt!`)
      .setDescription(`<@${winner.id}> gættede **${game.correct.title}** først!`)
      .addFields(
        { name: 'Runde', value: `${game.roundIndex + 1}/${game.tracks.length}`, inline: true },
        { name: 'Total score', value: `${newScore} point`, inline: true },
      );
  }

  if (isLastRound) {
    embed.setFooter({ text: 'Spillet er slut.' });
  } else {
    embed.setFooter({ text: 'Næste sang starter om lidt.' });
  }

  const payload = { embeds: [embed], components: [] };
  if (interaction) {
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch(() => {});
    });
  } else {
    await game.message.edit(payload).catch(() => {});
  }

  await advanceOrEndGame(game);
  return true;
}

async function handleGuessButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'answer') {
    return interaction.reply({ content: 'Ukendt knap.', flags: MessageFlags.Ephemeral });
  }

  const roundId = parts[2];
  const choiceIdx = parseInt(parts[3], 10);
  const game = getActiveGame(interaction.guildId);

  if (!game || game.roundId !== roundId || game.roundComplete) {
    return interaction.reply({
      content: 'Denne runde er allerede slut.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (game.answeredBy.has(interaction.user.id)) {
    return interaction.reply({
      content: 'Du har allerede gættet denne runde.',
      flags: MessageFlags.Ephemeral,
    });
  }
  game.answeredBy.add(interaction.user.id);

  const chosen = game.options[choiceIdx];
  const isCorrect = chosen?.title === game.correct.title;

  if (!isCorrect) {
    return interaction.reply({
      content: `Forkert! "${chosen?.title ?? '???'}" var ikke det rigtige svar.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await finishGuessRound(interaction.guildId, {
    interaction,
    reason: 'correct',
    winner: interaction.user,
  });
}

module.exports = { buildGuessButtons, buildGuessEmbed, beginGuessGame, handleGuessButton };
