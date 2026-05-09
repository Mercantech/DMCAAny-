const { PermissionsBitField } = require('discord.js');
const { getDjRole } = require('./storage');

function isAdmin(member) {
  if (!member) return false;
  const perms = member.permissions;
  if (!perms || typeof perms.has !== 'function') return false;
  return perms.has(PermissionsBitField.Flags.Administrator) || perms.has(PermissionsBitField.Flags.ManageGuild);
}

function hasDjRole(member, djRoleId) {
  if (!member || !djRoleId) return false;
  return member.roles?.cache?.has(djRoleId) ?? false;
}

function isDJ(interaction) {
  const djRoleId = getDjRole(interaction.guildId);
  if (!djRoleId) return true;
  if (isAdmin(interaction.member)) return true;
  return hasDjRole(interaction.member, djRoleId);
}

function djOnlyMessage() {
  return 'Kun brugere med DJ-rollen (eller admins) kan bruge denne kommando.';
}

module.exports = { isDJ, isAdmin, djOnlyMessage };
