const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBotEmoji } = require('../emoji');

const CATEGORIES = [
  {
    name: 'Afspilning',
    commands: [
      ['/play', 'Søg eller indsæt YouTube/SoundCloud-link'],
      ['/search', 'Søg med autocomplete (top 5 forslag)'],
      ['/pause', 'Sæt afspilning på pause'],
      ['/resume', 'Fortsæt afspilning'],
      ['/replay', 'Start nuværende sang forfra'],
      ['/seek', 'Spol til en bestemt position'],
      ['/volume', 'Vis eller justér volume (0-200%)'],
    ],
  },
  {
    name: 'Kø',
    commands: [
      ['/queue', 'Vis køen'],
      ['/nowplaying', 'Detaljeret info om nuværende sang'],
      ['/skip', 'Skip nuværende sang (DJ-only hvis DJ-rolle er sat)'],
      ['/voteskip', 'Stem om at skippe – kræver flertal i voice'],
      ['/jump', 'Hop direkte til et bestemt track'],
      ['/remove', 'Fjern et bestemt track fra køen'],
      ['/clear', 'Tøm køen'],
      ['/shuffle', 'Bland køen'],
      ['/loop', 'Sæt loop-mode (off/track/queue/autoplay)'],
      ['/stop', 'Stop afspilning og forlad voice'],
    ],
  },
  {
    name: 'Sociale',
    commands: [
      ['/history', 'Seneste afspillede sange'],
      ['/save', 'Få nuværende sang sendt som DM'],
    ],
  },
  {
    name: 'Admin',
    commands: [
      ['/dj set', 'Sæt en rolle som DJ-rolle'],
      ['/dj remove', 'Fjern DJ-rolle (alle får adgang igen)'],
      ['/dj show', 'Vis nuværende DJ-rolle'],
    ],
  },
  {
    name: 'Diverse',
    commands: [
      ['/help', 'Vis denne hjælp'],
      ['/ping', 'Vis bot-latency og uptime'],
    ],
  },
];

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Vis alle kommandoer'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle(`${getBotEmoji()} DMCAAny – kommandoer`)
      .setDescription('Her er alt botten kan. Kommandoer der kræver DJ-rolle markeres tydeligt nedenfor.');

    for (const category of CATEGORIES) {
      embed.addFields({
        name: category.name,
        value: category.commands.map(([cmd, desc]) => `\`${cmd}\` – ${desc}`).join('\n'),
      });
    }

    embed.setFooter({ text: 'Tip: brug /play <søgeord> i en voice channel for at komme i gang' });

    return interaction.reply({ embeds: [embed] });
  },
};
