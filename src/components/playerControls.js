const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { useQueue, QueueRepeatMode } = require('discord-player');
const { getBotEmoji } = require('../emoji');
const { isDJ, djOnlyMessage } = require('../permissions');

const REPEAT_LABEL = {
  [QueueRepeatMode.OFF]: 'Loop: Off',
  [QueueRepeatMode.TRACK]: 'Loop: Track',
  [QueueRepeatMode.QUEUE]: 'Loop: Queue',
  [QueueRepeatMode.AUTOPLAY]: 'Loop: Autoplay',
};

const NEXT_REPEAT = {
  [QueueRepeatMode.OFF]: QueueRepeatMode.TRACK,
  [QueueRepeatMode.TRACK]: QueueRepeatMode.QUEUE,
  [QueueRepeatMode.QUEUE]: QueueRepeatMode.AUTOPLAY,
  [QueueRepeatMode.AUTOPLAY]: QueueRepeatMode.OFF,
};

function buildControls(queue) {
  const isPaused = queue?.node?.isPaused?.() ?? false;
  const repeatMode = queue?.repeatMode ?? QueueRepeatMode.OFF;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(isPaused ? 'player:resume' : 'player:pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('player:skip').setLabel('Skip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('player:loop')
      .setLabel(REPEAT_LABEL[repeatMode] ?? 'Loop')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('player:shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('player:stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
  );

  return [row];
}

function buildNowPlayingEmbed(track) {
  const embed = new EmbedBuilder()
    .setTitle(`${getBotEmoji()} Spiller nu`)
    .setDescription(`**[${track.title}](${track.url})**\n${track.author ? `af *${track.author}*` : ''}`)
    .addFields(
      { name: 'Varighed', value: `\`${track.duration}\``, inline: true },
      {
        name: 'Tilføjet af',
        value: track.requestedBy ? `<@${track.requestedBy.id}>` : 'ukendt',
        inline: true,
      },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

async function refreshMessage(interaction, queue) {
  if (!interaction.message) return;
  try {
    await interaction.message.edit({ components: buildControls(queue) });
  } catch (error) {
    console.error('[playerControls] kunne ikke opdatere kontrolpanel:', error.message);
  }
}

async function handleButton(interaction) {
  const queue = useQueue(interaction.guildId);
  const action = interaction.customId.split(':')[1];

  if (!queue) {
    return interaction.reply({
      content: 'Botten er ikke tilsluttet en voice channel længere.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const memberVoice = interaction.member?.voice?.channel;
  if (!memberVoice || memberVoice.id !== queue.channel?.id) {
    return interaction.reply({
      content: 'Du skal være i samme voice channel som botten.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const djRequired = ['skip', 'stop'];
  if (djRequired.includes(action) && !isDJ(interaction)) {
    return interaction.reply({
      content: action === 'skip' ? `${djOnlyMessage()} Brug \`/voteskip\` i stedet.` : djOnlyMessage(),
      flags: MessageFlags.Ephemeral,
    });
  }

  switch (action) {
    case 'pause': {
      queue.node.pause();
      await interaction.reply({ content: 'Pause.', flags: MessageFlags.Ephemeral });
      return refreshMessage(interaction, queue);
    }
    case 'resume': {
      queue.node.resume();
      await interaction.reply({ content: 'Fortsætter.', flags: MessageFlags.Ephemeral });
      return refreshMessage(interaction, queue);
    }
    case 'skip': {
      const current = queue.currentTrack;
      queue.node.skip();
      return interaction.reply({
        content: `Skippede **${current?.title ?? 'sang'}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    case 'loop': {
      const next = NEXT_REPEAT[queue.repeatMode] ?? QueueRepeatMode.OFF;
      queue.setRepeatMode(next);
      await interaction.reply({
        content: REPEAT_LABEL[next],
        flags: MessageFlags.Ephemeral,
      });
      return refreshMessage(interaction, queue);
    }
    case 'shuffle': {
      if (queue.tracks.size === 0) {
        return interaction.reply({
          content: 'Ingen sange i køen at blande.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const count = queue.tracks.size;
      queue.tracks.shuffle();
      return interaction.reply({
        content: `Blandede ${count} sange.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    case 'stop': {
      queue.delete();
      return interaction.reply({ content: 'Stoppede.', flags: MessageFlags.Ephemeral });
    }
    default:
      return interaction.reply({
        content: 'Ukendt knap.',
        flags: MessageFlags.Ephemeral,
      });
  }
}

module.exports = { buildControls, buildNowPlayingEmbed, handleButton };
