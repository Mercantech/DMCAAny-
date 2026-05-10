const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { useQueue } = require('discord-player');
const { getBotEmoji } = require('../emoji');
const { addGuessPoint } = require('../storage');
const { getActiveGame, endGame } = require('../games/guess');

function buildGuessButtons(options, gameId) {
  const rows = [];
  let row = new ActionRowBuilder();
  options.forEach((option, idx) => {
    if (idx > 0 && idx % 2 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`guess:answer:${gameId}:${idx}`)
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
    .setFooter({ text: `Runde slutter automatisk om ${Math.round(round.durationMs / 1000)} sek` });
}

async function handleGuessButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'answer') {
    return interaction.reply({ content: 'Ukendt knap.', flags: MessageFlags.Ephemeral });
  }

  const gameId = parts[2];
  const choiceIdx = parseInt(parts[3], 10);
  const game = getActiveGame(interaction.guildId);

  if (!game || game.id !== gameId) {
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

  const newScore = addGuessPoint(interaction.guildId, interaction.user.id, 1);

  const queue = useQueue(interaction.guildId);
  if (queue) {
    queue.node.skip();
  }

  endGame(interaction.guildId);

  const winnerEmbed = new EmbedBuilder()
    .setTitle(`${getBotEmoji()} Korrekt!`)
    .setDescription(`<@${interaction.user.id}> gættede **${game.correct.title}** først!`)
    .addFields({ name: 'Total score', value: `${newScore} point`, inline: true });

  await interaction.update({ embeds: [winnerEmbed], components: [] }).catch(async () => {
    await interaction.reply({ embeds: [winnerEmbed] }).catch(() => {});
  });
}

module.exports = { buildGuessButtons, buildGuessEmbed, handleGuessButton };
