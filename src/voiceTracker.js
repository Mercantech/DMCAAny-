const { Events } = require('discord.js');
const { startVoiceSession, endVoiceSession, reconcileVoiceSessions } = require('./storage');

function channelName(state) {
  return state.channel?.name ?? state.channelId ?? 'ukendt';
}

function isTrackable(memberOrUser) {
  if (!memberOrUser) return false;
  const user = memberOrUser.user ?? memberOrUser;
  return !user.bot;
}

function handleVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId) return;

  const member = newState.member ?? oldState.member;
  if (!isTrackable(member)) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (oldChannelId === newChannelId) return;

  if (oldChannelId) {
    endVoiceSession(guildId, { userId, channelId: oldChannelId });
  }

  if (newChannelId) {
    startVoiceSession(guildId, {
      userId,
      channelId: newChannelId,
      channelName: channelName(newState),
    });
  }
}

function snapshotGuild(guild) {
  const active = [];
  for (const [, state] of guild.voiceStates.cache) {
    if (!state.channelId) continue;
    const member = state.member;
    if (!isTrackable(member ?? state)) continue;
    const userId = member?.id ?? state.id;
    active.push({
      userId,
      channelId: state.channelId,
      channelName: state.channel?.name ?? state.channelId,
    });
  }
  reconcileVoiceSessions(guild.id, active);
}

function setupVoiceTracker(client) {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
      handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error('[voiceTracker] Fejl i VoiceStateUpdate:', error);
    }
  });

  client.once(Events.ClientReady, (c) => {
    for (const guild of c.guilds.cache.values()) {
      try {
        snapshotGuild(guild);
      } catch (error) {
        console.error(`[voiceTracker] Snapshot fejlede for ${guild.id}:`, error);
      }
    }
    console.log('[voiceTracker] Voice-overvågning aktiv (uden VC-join).');
  });
}

module.exports = { setupVoiceTracker };
