const votes = new Map();

function getKey(guildId, trackId) {
  return `${guildId}:${trackId}`;
}

function clearForGuild(guildId) {
  for (const key of votes.keys()) {
    if (key.startsWith(`${guildId}:`)) votes.delete(key);
  }
}

function addVote(guildId, trackId, userId) {
  const key = getKey(guildId, trackId);
  let set = votes.get(key);
  if (!set) {
    set = new Set();
    votes.set(key, set);
  }
  set.add(userId);
  return set.size;
}

function getVotes(guildId, trackId) {
  return votes.get(getKey(guildId, trackId))?.size ?? 0;
}

function reset(guildId, trackId) {
  votes.delete(getKey(guildId, trackId));
}

function requiredVotes(listenerCount) {
  return Math.max(2, Math.ceil(listenerCount / 2));
}

module.exports = { addVote, getVotes, reset, clearForGuild, requiredVotes };
