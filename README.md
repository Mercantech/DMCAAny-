# DMCAAny-

En simpel Discord musik-bot der kan afspille sange fra **YouTube** og **SoundCloud** via slash commands.

## Funktioner

- `/play <forespørgsel>` – søg på navn eller indsæt et YouTube/SoundCloud-link
- `/skip` – spring den nuværende sang over
- `/stop` – stop afspilning, ryd kø og forlad voice channel
- `/queue` – vis køen
- `/pause` – sæt afspilningen på pause
- `/resume` – fortsæt afspilningen

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

## Projektstruktur

```text
.
├── Dockerfile            # Container-image med Node.js + FFmpeg
├── docker-compose.yml    # Bot-service + deploy-profil
├── .dockerignore
└── src/
    ├── index.js              # Entry point – login og command-loader
    ├── player.js             # discord-player + extractors
    ├── deploy-commands.js    # Registrer slash commands
    └── commands/             # Én fil pr. slash command
        ├── play.js
        ├── skip.js
        ├── stop.js
        ├── queue.js
        ├── pause.js
        └── resume.js
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
