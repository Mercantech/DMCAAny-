require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

function loadCommandData() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command?.data) {
      commands.push(command.data.toJSON());
    }
  }
  return commands;
}

async function deployCommands({ token, clientId, guildId } = {}) {
  const t = token ?? process.env.DISCORD_TOKEN;
  const c = clientId ?? process.env.CLIENT_ID;
  const g = guildId ?? process.env.GUILD_ID;

  if (!t || !c) {
    throw new Error('DISCORD_TOKEN og CLIENT_ID skal være sat for at registrere kommandoer.');
  }

  const commands = loadCommandData();
  const rest = new REST({ version: '10' }).setToken(t);
  const route = g ? Routes.applicationGuildCommands(c, g) : Routes.applicationCommands(c);

  console.log(`Deployer ${commands.length} slash commands...`);
  const data = await rest.put(route, { body: commands });
  console.log(
    `Færdig! ${data.length} kommandoer registreret ${
      g ? `på guild ${g}` : 'globalt (kan tage op til 1 time at vises)'
    }.`,
  );

  return data;
}

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error('Fejl ved deploy af kommandoer:', error);
    process.exit(1);
  });
}

module.exports = { deployCommands, loadCommandData };
