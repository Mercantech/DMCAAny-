const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const youtubedl = require('youtube-dl-exec');
const { withEmoji } = require('./emoji');
const { addHistory } = require('./storage');
const { buildControls, buildNowPlayingEmbed } = require('./components/playerControls');
const { clearForGuild } = require('./voteskip');

async function streamWithYtDlp(track) {
  const url = await youtubedl(track.url, {
    format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    getUrl: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    youtubeSkipDashManifest: true,
  });

  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('yt-dlp returnerede ingen stream-URL');
  }

  return url.trim().split('\n')[0];
}

async function setupPlayer(client) {
  const player = new Player(client);

  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YoutubeiExtractor, {
    streamOptions: {
      useClient: 'ANDROID',
      highWaterMark: 1 << 25,
    },
    disablePlayer: true,
    createStream: async (track) => {
      try {
        return await streamWithYtDlp(track);
      } catch (error) {
        console.error(`[yt-dlp] Kunne ikke hente stream for "${track.title}":`, error.message ?? error);
        throw error;
      }
    },
  });

  player.events.on('playerStart', (queue, track) => {
    if (queue.guild?.id) {
      addHistory(queue.guild.id, {
        title: track.title,
        url: track.url,
        addedBy: track.requestedBy?.id ?? null,
      });
      clearForGuild(queue.guild.id);
    }

    queue.metadata?.channel
      ?.send({ embeds: [buildNowPlayingEmbed(track)], components: buildControls(queue) })
      .catch(() => {});
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    queue.metadata?.channel?.send(withEmoji(`Tilføjet til kø: **${track.title}**`)).catch(() => {});
  });

  player.events.on('disconnect', (queue) => {
    if (queue.guild?.id) clearForGuild(queue.guild.id);
    queue.metadata?.channel?.send(withEmoji('Forlader voice channel.')).catch(() => {});
  });

  player.events.on('emptyChannel', (queue) => {
    queue.metadata?.channel?.send(withEmoji('Ingen i voice channel – forlader om lidt.')).catch(() => {});
  });

  player.events.on('emptyQueue', (queue) => {
    queue.metadata?.channel?.send(withEmoji('Køen er tom.')).catch(() => {});
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
