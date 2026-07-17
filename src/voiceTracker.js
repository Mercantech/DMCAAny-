const { Events } = require('discord.js');
const {
  startVoiceSession,
  endVoiceSession,
  updateVoiceMuteDeaf,
  reconcileVoiceSessions,
} = require('./storage');
const { VOICE_TRACK_GUILD_ID } = require('./voiceConfig');

function channelName(state) {
  return state.channel?.name ?? state.channelId ?? 'ukendt';
}

function isTrackable(memberOrUser) {
  if (!memberOrUser) return false;
  const user = memberOrUser.user ?? memberOrUser;
  return !user.bot;
}

function voiceFlags(state) {
  return {
    muted: !!(state.selfMute || state.serverMute),
    deafened: !!(state.selfDeaf || state.serverDeaf),
    // Discord "Go Live" / skærmdeling
    live: !!state.streaming,
  };
}

function flagsChanged(a, b) {
  return a.muted !== b.muted || a.deafened !== b.deafened || a.live !== b.live;
}

function handleVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId || guildId !== VOICE_TRACK_GUILD_ID) return;

  const member = newState.member ?? oldState.member;
  if (!isTrackable(member)) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // Samme kanal: mute/deaf/live-skift
  if (oldChannelId === newChannelId) {
    if (!newChannelId) return;
    const oldF = voiceFlags(oldState);
    const newF = voiceFlags(newState);
    if (flagsChanged(oldF, newF)) {
      updateVoiceMuteDeaf(guildId, {
        userId,
        channelId: newChannelId,
        muted: newF.muted,
        deafened: newF.deafened,
        live: newF.live,
      });
    }
    return;
  }

  if (oldChannelId) {
    endVoiceSession(guildId, { userId, channelId: oldChannelId });
  }

  if (newChannelId) {
    const flags = voiceFlags(newState);
    startVoiceSession(guildId, {
      userId,
      channelId: newChannelId,
      channelName: channelName(newState),
      muted: flags.muted,
      deafened: flags.deafened,
      live: flags.live,
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
    const flags = voiceFlags(state);
    active.push({
      userId,
      channelId: state.channelId,
      channelName: state.channel?.name ?? state.channelId,
      muted: flags.muted,
      deafened: flags.deafened,
      live: flags.live,
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
    const guild = c.guilds.cache.get(VOICE_TRACK_GUILD_ID);
    if (guild) {
      try {
        snapshotGuild(guild);
      } catch (error) {
        console.error(`[voiceTracker] Snapshot fejlede for ${guild.id}:`, error);
      }
    } else {
      console.warn(`[voiceTracker] Guild ${VOICE_TRACK_GUILD_ID} er ikke i cache – snapshot sprunget over.`);
    }
    console.log(
      `[voiceTracker] Voice-overvågning aktiv for guild ${VOICE_TRACK_GUILD_ID} (mute/deaf/live + uden VC-join).`,
    );
  });
}

module.exports = { setupVoiceTracker };
