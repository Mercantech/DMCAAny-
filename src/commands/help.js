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
    name: 'Lyrics',
    commands: [
      ['/lyrics show', 'Hent og vis lyrics for nuværende sang'],
      ['/lyrics live', 'Live scrolling lyrics (synced)'],
      ['/lyrics stop', 'Stop live lyrics'],
    ],
  },
  {
    name: 'Sjov & spil',
    commands: [
      ['/guess start', 'Start "gæt sangen" med valgfrit antal sange'],
      ['/guess stop', 'Afslut den aktive runde'],
      ['/guess leaderboard', 'Top 10 spillere'],
      ['/guess reset', 'Nulstil alle scores (admin)'],
      ['/mood', 'Tilføj en hel kø der matcher en vibe'],
      ['/soundboard show', 'Vis soundboardet med knapper'],
      ['/soundboard add', 'Tilføj en lyd (admin)'],
      ['/soundboard remove', 'Fjern en lyd (admin)'],
      ['/soundboard list', 'Vis alle lyde med URLs'],
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
      ['/voicerapport', 'Send voice-historik som DM (eller DM botten som rapport-bruger)'],
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
