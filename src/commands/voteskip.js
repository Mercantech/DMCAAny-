const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { withEmoji } = require('../emoji');
const { addVote, getVotes, reset, requiredVotes } = require('../voteskip');
const { isDJ } = require('../permissions');

function countListeners(voiceChannel, botUserId) {
  if (!voiceChannel) return 0;
  return voiceChannel.members.filter((m) => !m.user.bot && m.id !== botUserId).size;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voteskip')
    .setDescription('Start eller deltag i en afstemning om at skippe nuværende sang'),

  async execute(interaction) {
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: 'Der spilles ikke noget i øjeblikket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const memberVoiceChannel = interaction.member?.voice?.channel;
    if (!memberVoiceChannel || memberVoiceChannel.id !== queue.channel?.id) {
      return interaction.reply({
        content: 'Du skal være i samme voice channel som botten for at stemme.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const track = queue.currentTrack;
    const trackId = track.id ?? track.url;

    if (isDJ(interaction)) {
      reset(interaction.guildId, trackId);
      queue.node.skip();
      return interaction.reply(withEmoji(`DJ skippede: **${track.title}**`));
    }

    const listenerCount = countListeners(queue.channel, interaction.client.user?.id);
    const needed = requiredVotes(listenerCount);
    const currentVotes = addVote(interaction.guildId, trackId, interaction.user.id);

    if (currentVotes >= needed) {
      reset(interaction.guildId, trackId);
      queue.node.skip();
      return interaction.reply(withEmoji(`Voteskip vedtaget (${currentVotes}/${needed}) – skipper **${track.title}**.`));
    }

    return interaction.reply(
      withEmoji(`Stemme registreret: **${currentVotes}/${needed}** for at skippe **${track.title}**.`),
    );
  },
};
