# DMCAAny-

En simpel Discord musik-bot der kan afspille sange fra **YouTube** og **SoundCloud** via slash commands.

## Funktioner

**Afspilning:**
- `/play <forespørgsel>` – søg på navn eller indsæt et YouTube/SoundCloud-link
- `/search <forespørgsel>` – søg med autocomplete (top 5 forslag)
- `/pause` / `/resume` – pause og fortsæt
- `/replay` – start nuværende sang forfra
- `/seek <tid>` – spol til position (`90`, `1:30` eller `1:00:00`)
- `/volume <0-200>` – justér lydstyrke

**Kø:**
- `/queue` – vis køen
- `/nowplaying` – detaljeret embed med progress bar og thumbnail
- `/skip` / `/voteskip` – DJ skipper direkte; alle andre stemmer
- `/jump <position>` – hop direkte til et bestemt track
- `/remove <position>` – fjern et bestemt track
- `/clear` – tøm køen (uden at stoppe nuværende)
- `/shuffle` – bland køen
- `/loop <off|track|queue|autoplay>` – loop-mode
- `/stop` – stop og forlad voice channel

**Sociale:**
- `/history` – seneste 10 afspillede tracks
- `/save` – få nuværende sang som DM

**Admin:**
- `/dj set/remove/show <rolle>` – sæt DJ-rolle (kun rolle + admins kan så bruge skip/stop/clear/remove)

**Diverse:**
- `/help` – komplet kommando-oversigt
- `/ping` – latency og uptime

**Knapper:** Hver gang en sang starter får du et embed med knapper – Pause/Resume, Skip, Loop, Shuffle, Stop. Ingen grund til at skrive kommandoer.

**Eastereggs:** prøv `/play rickroll`, `/play darude`, `/play crab rave`, `/play megalovania`...

## Krav

- [Node.js](https://nodejs.org/) **18 eller nyere**
- **FFmpeg** installeret og tilgængeligt i `PATH`
  - Windows: `winget install Gyan.FFmpeg` (eller download fra [ffmpeg.org](https://www.ffmpeg.org/download.html))
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- En Discord-bot oprettet i [Discord Developer Portal](https://discord.com/developers/applications) med:
  - Scopes: `bot` og `applications.commands`
  - Bot-permissions: `Connect`, `Speak`, `Send Messages`

## Opsætning

1. **Klon eller åbn projektet** og installer dependencies:

   ```bash
   npm install
   ```

2. **Lav en `.env`-fil** baseret på `.env.example`:

   ```bash
   cp .env.example .env
   ```

   Udfyld:

   - `DISCORD_TOKEN` – bot-tokenet fra Developer Portal → Bot
   - `CLIENT_ID` – Application ID fra Developer Portal → General Information
   - `GUILD_ID` *(valgfrit)* – server-ID til hurtig deploy under udvikling. Lad stå tomt for global deploy.

3. **Registrer slash commands**:

   ```bash
   npm run deploy
   ```

   Med `GUILD_ID` sat: kommandoer er klar med det samme.
   Uden `GUILD_ID`: global deploy kan tage op til 1 time.

4. **Start botten**:

   ```bash
   npm start
   ```

5. **Brug botten** ved at gå ind i en voice channel og skrive fx:

   ```text
   /play never gonna give you up
   /play https://soundcloud.com/artist/track
   ```

## Kør med Docker

Hvis du hellere vil køre botten i en container (med FFmpeg automatisk installeret), kan du bruge den medfølgende `Dockerfile` og `docker-compose.yml`.

1. Sørg for at `.env` er udfyldt (samme som ved lokal kørsel).

2. **Registrer slash commands** (engangsoperation eller når du tilføjer/ændrer kommandoer):

   ```bash
   docker compose --profile deploy run --rm deploy
   ```

3. **Start botten**:

   ```bash
   docker compose up -d --build
   ```

4. **Følg loggen**:

   ```bash
   docker compose logs -f bot
   ```

5. **Stop botten**:

   ```bash
   docker compose down
   ```

Botten genstarter automatisk hvis containeren går ned (`restart: unless-stopped`).

## Persistens

DJ-rolle og afspilningshistorik gemmes i `/app/data/store.json` inde i containeren. I `docker-compose.yml` mountes en navngivet volume `bot-data` til den sti, så data overlever rebuilds og restarts.

## Projektstruktur

```text
.
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── src/
    ├── index.js                # Entry point – login, command/button/autocomplete dispatcher
    ├── player.js               # discord-player + extractors + history-tracking
    ├── deploy-commands.js      # Slash command registrering
    ├── emoji.js                # Custom emoji helper
    ├── permissions.js          # isDJ() helper
    ├── storage.js              # JSON file store (DJ-rolle, history)
    ├── voteskip.js             # In-memory voteskip state
    ├── components/
    │   └── playerControls.js   # Knapper på "Spiller nu"-embeds
    └── commands/               # En fil pr. slash command
        ├── play.js, skip.js, stop.js, queue.js, pause.js, resume.js
        ├── volume.js, loop.js, shuffle.js, clear.js, remove.js
        ├── jump.js, replay.js, seek.js, search.js, nowplaying.js
        ├── voteskip.js, dj.js, history.js, save.js
        └── help.js, ping.js
```

## Tech stack

- [discord.js](https://discord.js.org/) v14
- [discord-player](https://discord-player.js.org/) v7
- [discord-player-youtubei](https://www.npmjs.com/package/discord-player-youtubei) – YouTube-extractor
- [@discord-player/extractor](https://www.npmjs.com/package/@discord-player/extractor) – SoundCloud m.fl.

## Fejlfinding

- **"FFmpeg not found"** – tjek at `ffmpeg -version` virker i din terminal. Genstart terminalen efter installation.
- **Botten reagerer ikke på kommandoer** – kør `npm run deploy` igen, og bekræft at botten har permission `Use Application Commands` på serveren.
- **YouTube-fejl** – YouTube ændrer ofte deres API. Opdater `discord-player-youtubei` med `npm update discord-player-youtubei`.
- **Bot kan ikke joine voice channel** – tjek at den har `Connect` og `Speak` permissions i den specifikke channel.
