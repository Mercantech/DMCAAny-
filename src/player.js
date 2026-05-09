const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');

async function setupPlayer(client) {
  const player = new Player(client);

  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YoutubeiExtractor, {});

  player.events.on('playerStart', (queue, track) => {
    queue.metadata?.channel?.send(`Spiller nu: **${track.title}**`).catch(() => {});
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    queue.metadata?.channel?.send(`Tilføjet til kø: **${track.title}**`).catch(() => {});
  });

  player.events.on('disconnect', (queue) => {
    queue.metadata?.channel?.send('Forlader voice channel.').catch(() => {});
  });

  player.events.on('emptyChannel', (queue) => {
    queue.metadata?.channel?.send('Ingen i voice channel – forlader om lidt.').catch(() => {});
  });

  player.events.on('emptyQueue', (queue) => {
    queue.metadata?.channel?.send('Køen er tom.').catch(() => {});
  });

  player.events.on('error', (queue, error) => {
    console.error(`[Player error] ${queue.guild?.name}:`, error);
  });

  player.events.on('playerError', (queue, error) => {
    console.error(`[Player error] ${queue.guild?.name}:`, error);
  });

  return player;
}

module.exports = { setupPlayer };
