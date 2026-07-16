require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { setupPlayer } = require('./player');
const { deployCommands } = require('./deploy-commands');
const { handleButton } = require('./components/playerControls');
const { handleGuessButton } = require('./components/guessButtons');
const { handleSoundButton } = require('./components/soundboard');
const storage = require('./storage');
const { setupVoiceTracker } = require('./voiceTracker');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN mangler i .env – kopier .env.example til .env og udfyld den.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data?.name && typeof command.execute === 'function') {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] Kommando ${file} mangler data eller execute().`);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Logget ind som ${c.user.tag} – klar til at spille musik!`);
});

const BUTTON_HANDLERS = [
  { prefix: 'player:', handler: handleButton, label: 'player' },
  { prefix: 'guess:', handler: handleGuessButton, label: 'guess' },
  { prefix: 'sound:', handler: handleSoundButton, label: 'sound' },
];

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const match = BUTTON_HANDLERS.find((h) => interaction.customId.startsWith(h.prefix));
    if (match) {
      try {
        await match.handler(interaction);
      } catch (error) {
        console.error(`Fejl i ${match.label}-knap:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: 'Der opstod en fejl.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
      }
      return;
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Fejl i autocomplete /${interaction.commandName}:`, error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Fejl i kommandoen /${interaction.commandName}:`, error);
    const reply = { content: 'Der opstod en fejl under udførelsen af kommandoen.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

(async () => {
  storage.load();
  await setupPlayer(client);
  setupVoiceTracker(client);

  if (process.env.DEPLOY_ON_STARTUP !== 'false' && process.env.CLIENT_ID) {
    try {
      await deployCommands();
    } catch (error) {
      console.error('Kunne ikke registrere slash commands ved opstart:', error);
    }
  }

  await client.login(process.env.DISCORD_TOKEN);
})();
