const DEFAULT_EMOJI = '<:mathiasgs:1502605641515143369>';

function getBotEmoji() {
  const fromEnv = process.env.BOT_EMOJI?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_EMOJI;
}

function withEmoji(text) {
  return `${getBotEmoji()} ${text}`;
}

module.exports = { getBotEmoji, withEmoji };
