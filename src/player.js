const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const youtubedl = require('youtube-dl-exec');
const { withEmoji } = require('./emoji');
const { addHistory } = require('./storage');
const { buildControls, buildNowPlayingEmbed } = require('./components/playerControls');
const { clearForGuild } = require('./voteskip');

async function streamWithYtDlp(track, { source = 'youtube' } = {}) {
  const opts = {
    format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    getUrl: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
  };
  if (source === 'youtube') {
    opts.youtubeSkipDashManifest = true;
  }

  const url = await youtubedl(track.url, opts);

  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('yt-dlp returnerede ingen stream-URL');
  }

  return url.trim().split('\n')[0];
}

function patchSoundCloudExtractor(player) {
  const ext = [...player.extractors.store.values()].find((e) =>
    (e.identifier ?? '').toLowerCase().includes('soundcloud'),
  );

  if (!ext) {
    console.warn('[SoundCloud] Extractor ikke fundet – kan ikke patche stream() til yt-dlp.');
    return;
  }

  const originalStream = ext.stream.bind(ext);
  ext.stream = async (track) => {
    try {
      const url = await streamWithYtDlp(track, { source: 'soundcloud' });
      return url;
    } catch (error) {
      console.error(
        `[SoundCloud yt-dlp] Fejl for "${track.title}" (${track.url}):`,
        error.shortMessage ?? error.message ?? error,
      );
      try {
        return await originalStream(track);
      } catch (fallbackError) {
        console.error(
          '[SoundCloud original stream] Fallback fejlede også:',
          fallbackError.message ?? fallbackError,
        );
        throw fallbackError;
      }
    }
  };

  console.log(`[SoundCloud] Stream-metoden er nu routet gennem yt-dlp (extractor: ${ext.identifier}).`);
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
        return await streamWithYtDlp(track, { source: 'youtube' });
      } catch (error) {
        console.error(
          `[YouTube yt-dlp] Fejl for "${track.title}" (${track.url}):`,
          error.shortMessage ?? error.message ?? error,
        );
        throw error;
      }
    },
  });

  patchSoundCloudExtractor(player);

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

  function logPlayerError(label, queue, error) {
    const track = queue.currentTrack;
    console.error(
      `[${label}] guild=${queue.guild?.name} track="${track?.title}" url=${track?.url} source=${track?.source}\n` +
        `  message: ${error?.message}\n` +
        `  code: ${error?.code}\n` +
        `  stack: ${error?.stack}`,
    );
    queue.metadata?.channel
      ?.send(withEmoji(`Fejl ved afspilning af **${track?.title ?? 'sang'}**: \`${error?.message ?? 'ukendt'}\``))
      .catch(() => {});
  }

  player.events.on('error', (queue, error) => logPlayerError('Player error', queue, error));
  player.events.on('playerError', (queue, error) => logPlayerError('Audio player error', queue, error));
  player.events.on('playerSkip', (queue, track) => {
    console.warn(`[playerSkip] Auto-skipped "${track.title}" (${track.url}) – stream fejlede sandsynligvis.`);
  });

  return player;
}

module.exports = { setupPlayer };
