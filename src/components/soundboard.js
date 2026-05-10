const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { useMainPlayer, useQueue, QueryType } = require('discord-player');
const { getBotEmoji } = require('../emoji');
const { getSounds, findSound } = require('../storage');

function buildSoundboardComponents(sounds) {
  if (!sounds.length) return [];
  const rows = [];
  let row = new ActionRowBuilder();
  sounds.forEach((sound, idx) => {
    if (idx > 0 && idx % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    const button = new ButtonBuilder()
      .setCustomId(`sound:play:${sound.name}`)
      .setLabel(sound.name.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);
    if (sound.emoji) {
      try {
        button.setEmoji(sound.emoji);
      } catch {
        /* invalid emoji – ignore */
      }
    }
    row.addComponents(button);
  });
  if (row.components.length) rows.push(row);
  return rows.slice(0, 5);
}

function buildSoundboardEmbed(sounds) {
  const embed = new EmbedBuilder().setTitle(`${getBotEmoji()} Soundboard`);
  if (!sounds.length) {
    embed.setDescription('Ingen lyde endnu. Brug `/soundboard add` for at tilføje en.');
  } else {
    embed.setDescription(`${sounds.length} lyde tilgængelige – tryk på en knap for at afspille.`);
  }
  return embed;
}

async function handleSoundButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'play') {
    return interaction.reply({ content: 'Ukendt knap.', flags: MessageFlags.Ephemeral });
  }
  const name = parts.slice(2).join(':');
  const sound = findSound(interaction.guildId, name);
  if (!sound) {
    return interaction.reply({
      content: `Lyden "${name}" findes ikke længere.`,
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

  const queue = useQueue(interaction.guildId);
  if (queue && queue.channel?.id !== voiceChannel.id) {
    return interaction.reply({
      content: 'Botten er allerede i en anden voice channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const player = useMainPlayer();

  try {
    if (queue && queue.currentTrack) {
      const result = await player.search(sound.url, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO,
      });
      const soundTrack = result.tracks?.[0];
      if (!soundTrack) {
        return interaction.editReply('Kunne ikke finde lyden.');
      }
      queue.insertTrack(soundTrack, 0);
      queue.node.skip();
      return interaction.editReply(`Spiller **${sound.name}** – nuværende sang skippet.`);
    }

    await player.play(voiceChannel, sound.url, {
      searchEngine: QueryType.AUTO,
      nodeOptions: {
        metadata: { channel: interaction.channel },
        leaveOnEnd: true,
        leaveOnEndCooldown: 60_000,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        selfDeaf: true,
        volume: 75,
      },
      requestedBy: interaction.user,
    });
    return interaction.editReply(`Spiller **${sound.name}**.`);
  } catch (error) {
    console.error('[soundboard] Fejl:', error);
    return interaction.editReply(`Kunne ikke afspille: ${error.message ?? 'ukendt'}`);
  }
}

function buildSoundboardMessage(guildId) {
  const sounds = getSounds(guildId);
  return {
    embeds: [buildSoundboardEmbed(sounds)],
    components: buildSoundboardComponents(sounds),
  };
}

module.exports = { handleSoundButton, buildSoundboardMessage, buildSoundboardComponents, buildSoundboardEmbed };
