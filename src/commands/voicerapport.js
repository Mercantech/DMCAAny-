const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getBotEmoji, withEmoji } = require('../emoji');
const { getVoiceSessions, clipSessionsToWindow } = require('../storage');
const { isAdmin } = require('../permissions');
const { VOICE_REPORT_USER_ID, VOICE_TRACK_GUILD_ID } = require('../voiceConfig');
const { generateVoiceFunFact, normalizeTone } = require('../openaiFunFact');
const { formatDateShort, dayKey, prevDayKey, forEachDayOverlap } = require('../copenhagenTime');

const MAX_EMBEDS = 10;
const FIELD_VALUE_MAX = 1000;
const MIN_SEGMENT_MS = 4 * 60 * 1000;
const STREAK_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const REPORT_TIMEZONE = 'Europe/Copenhagen';
const DM_TRIGGERS =
  /^(?:rapport|voicerapport)(?:\s+(\d{1,2}))?(?:\s+(venlig|roast|mega|megaroast|sarkastisk|hyggelig|dramatisk))?$/i;

function formatDate(ts) {
  return new Date(ts).toLocaleString('da-DK', {
    timeZone: REPORT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  });
}

function formatTimeOfDay(ts) {
  return new Date(ts).toLocaleString('da-DK', {
    timeZone: REPORT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Dato én gang pr. linje: `17.07 · 06.24–06.39` (slutdato kun ved døgnskift). */
function formatRange(start, end) {
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  const startTime = formatTimeOfDay(start);
  const endTime = formatTimeOfDay(end);
  if (startDate === endDate) {
    return `${startDate} · ${startTime}–${endTime}`;
  }
  return `${startDate}–${endDate} · ${startTime}–${endTime}`;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}t ${remMins}m` : `${hours}t`;
}

function canRun(interaction) {
  if (interaction.user.id === VOICE_REPORT_USER_ID) return true;
  if (interaction.inGuild() && isAdmin(interaction.member)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Sweep-line: find tidsrum hvor det samme sæt brugere var i kanalen. */
function buildCoPresenceSegments(channelSessions, now) {
  const events = [];
  for (const s of channelSessions) {
    const start = s.joinedAt;
    const end = s.leftAt ?? now;
    if (end <= start) continue;
    events.push({ t: start, d: 1, userId: s.userId });
    events.push({ t: end, d: -1, userId: s.userId });
  }
  // Ends før starts ved samme tidspunkt
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  const present = new Map();
  const segments = [];
  let lastT = null;

  for (const ev of events) {
    if (lastT !== null && ev.t > lastT && present.size > 0) {
      segments.push({
        start: lastT,
        end: ev.t,
        userIds: [...present.keys()].sort(),
      });
    }
    if (ev.d === 1) {
      present.set(ev.userId, (present.get(ev.userId) || 0) + 1);
    } else {
      const next = (present.get(ev.userId) || 1) - 1;
      if (next <= 0) present.delete(ev.userId);
      else present.set(ev.userId, next);
    }
    lastT = ev.t;
  }

  const merged = [];
  for (const seg of segments) {
    const key = seg.userIds.join(',');
    const prev = merged[merged.length - 1];
    if (prev && prev.userIds.join(',') === key && prev.end === seg.start) {
      prev.end = seg.end;
    } else {
      merged.push({ start: seg.start, end: seg.end, userIds: [...seg.userIds] });
    }
  }
  return merged;
}

function groupSessionsByChannel(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.channelId)) {
      map.set(s.channelId, {
        channelId: s.channelId,
        channelName: s.channelName || s.channelId,
        sessions: [],
      });
    }
    const g = map.get(s.channelId);
    if (s.channelName) g.channelName = s.channelName;
    g.sessions.push(s);
  }
  return [...map.values()].sort((a, b) => a.channelName.localeCompare(b.channelName, 'da'));
}

function mentionList(userIds) {
  return userIds.map((id) => `<@${id}>`).join(' · ');
}

function formatChannelBody(channelGroup, now) {
  const segments = buildCoPresenceSegments(channelGroup.sessions, now).filter(
    (seg) => seg.end - seg.start >= MIN_SEGMENT_MS,
  );

  const together = segments.filter((s) => s.userIds.length >= 2);
  const solo = segments.filter((s) => s.userIds.length === 1);

  const openNow = new Set(
    channelGroup.sessions.filter((s) => s.leftAt === null).map((s) => s.userId),
  );

  const lines = [];

  if (together.length > 0) {
    lines.push('**Sammen**');
    for (const seg of together) {
      lines.push(
        `\`${formatRange(seg.start, seg.end)}\` (${formatDuration(seg.end - seg.start)})`,
      );
      lines.push(`→ ${mentionList(seg.userIds)}`);
    }
  }

  if (solo.length > 0) {
    if (lines.length) lines.push('');
    lines.push('**Alene**');
    for (const seg of solo) {
      lines.push(
        `\`${formatRange(seg.start, seg.end)}\` · ${mentionList(seg.userIds)} (${formatDuration(seg.end - seg.start)})`,
      );
    }
  }

  if (openNow.size > 0) {
    if (lines.length) lines.push('');
    lines.push(`**Nu:** ${mentionList([...openNow].sort())}`);
  }

  if (lines.length === 0) {
    return '_Ingen segmenter over 4 minutter._';
  }

  return lines.join('\n');
}

/** Plain-text overblik til OpenAI (display-navne, ikke Discord-mentions). */
function buildAiSummary(sessions, days, nameOf) {
  const now = Date.now();
  const channels = groupSessionsByChannel(sessions);
  const lines = [
    `Periode: seneste ${days} dage`,
    '',
    'NØGLETAL (læs først — bland IKKE TOTAL og ALENE):',
    'TOTAL = al tid i voice. ALENE = kun uden andre. MED_ANDRE = TOTAL minus ALENE.',
  ];

  const totals = buildUserTotals(sessions, now);
  if (totals.length) {
    for (const [userId, { totalMs, aloneMs, mutedMs, deafMs, liveMs, camMs }] of totals) {
      const withOthersMs = Math.max(0, totalMs - aloneMs);
      const name = nameOf(userId);
      lines.push(
        `- ${name}: TOTAL ${formatDuration(totalMs)} | ALENE ${formatDuration(aloneMs)} | MED_ANDRE ${formatDuration(withOthersMs)}` +
          ` | mute ${formatDuration(mutedMs || 0)} | deaf ${formatDuration(deafMs || 0)}` +
          ` | live ${formatDuration(liveMs || 0)} | cam ${formatDuration(camMs || 0)}`,
      );
    }
  } else {
    lines.push('- (ingen nøgletal)');
  }

  const pairs = buildPairTotals(sessions, now).slice(0, 3);
  if (pairs.length) {
    lines.push('');
    lines.push('Top-duoer (tid de TO sad sammen — ikke det samme som MED_ANDRE):');
    for (const row of pairs) {
      lines.push(`- ${nameOf(row.a)} + ${nameOf(row.b)}: ${formatDuration(row.ms)}`);
    }
  }

  lines.push('');
  lines.push('Segmenter (detaljer):');

  for (const ch of channels) {
    lines.push(`Kanal: #${ch.channelName}`);
    const segments = buildCoPresenceSegments(ch.sessions, now).filter(
      (seg) => seg.end - seg.start >= MIN_SEGMENT_MS,
    );
    for (const seg of segments) {
      const people = seg.userIds.map((id) => nameOf(id)).join(', ');
      const label = seg.userIds.length >= 2 ? 'Sammen' : 'Alene';
      lines.push(
        `- ${label}: ${formatRange(seg.start, seg.end)} (${formatDuration(seg.end - seg.start)}) — ${people}`,
      );
    }
    const openNow = ch.sessions.filter((s) => s.leftAt === null).map((s) => nameOf(s.userId));
    if (openNow.length) lines.push(`- Nu: ${[...new Set(openNow)].join(', ')}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

async function resolveDisplayNames(client, userIds) {
  const map = new Map();
  const guild = client.guilds.cache.get(VOICE_TRACK_GUILD_ID);
  for (const userId of userIds) {
    let name = `bruger-${userId.slice(-4)}`;
    try {
      let member = guild?.members.cache.get(userId);
      if (!member && guild) {
        member = await guild.members.fetch(userId).catch(() => null);
      }
      if (member) name = member.displayName || member.user?.username || name;
      else {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) name = user.username;
      }
    } catch {
      // keep fallback
    }
    map.set(userId, name);
  }
  return (userId) => map.get(userId) || `bruger-${String(userId).slice(-4)}`;
}

function chunkFieldValue(text) {
  if (text.length <= FIELD_VALUE_MAX) return [text];
  const chunks = [];
  const parts = text.split('\n');
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}\n${part}` : part;
    if (next.length > FIELD_VALUE_MAX && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Samlet VC-tid pr. bruger + alenetid (fra co-presence-segmenter) + mute/deaf/live/cam. */
function buildUserTotals(sessions, now) {
  const totals = new Map();
  for (const ch of groupSessionsByChannel(sessions)) {
    const segments = buildCoPresenceSegments(ch.sessions, now).filter(
      (seg) => seg.end - seg.start >= MIN_SEGMENT_MS,
    );
    for (const seg of segments) {
      const dur = seg.end - seg.start;
      const alone = seg.userIds.length === 1;
      for (const uid of seg.userIds) {
        if (!totals.has(uid)) {
          totals.set(uid, { totalMs: 0, aloneMs: 0, mutedMs: 0, deafMs: 0, liveMs: 0, camMs: 0 });
        }
        const row = totals.get(uid);
        row.totalMs += dur;
        if (alone) row.aloneMs += dur;
      }
    }
  }

  for (const s of sessions) {
    if (!totals.has(s.userId)) {
      totals.set(s.userId, { totalMs: 0, aloneMs: 0, mutedMs: 0, deafMs: 0, liveMs: 0, camMs: 0 });
    }
    const row = totals.get(s.userId);
    let mutedMs = s.mutedMs || 0;
    let deafMs = s.deafMs || 0;
    let liveMs = s.liveMs || 0;
    let camMs = s.camMs || 0;
    const end = s.leftAt ?? now;
    if (s.muteSince != null) mutedMs += Math.max(0, end - s.muteSince);
    if (s.deafSince != null) deafMs += Math.max(0, end - s.deafSince);
    if (s.liveSince != null) liveMs += Math.max(0, end - s.liveSince);
    if (s.camSince != null) camMs += Math.max(0, end - s.camSince);
    row.mutedMs += mutedMs;
    row.deafMs += deafMs;
    row.liveMs += liveMs;
    row.camMs += camMs;
  }

  return [...totals.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
}

/**
 * Nuværende VC-streak pr. bruger: sammenhængende kalenderdage (DK)
 * med ≥ 4 min VC, der ender i dag eller i går.
 */
function buildUserStreaks(sessions, now = Date.now()) {
  const byUser = new Map(); // userId -> Map<dayKey, ms>

  for (const s of sessions) {
    const start = s.joinedAt;
    const end = s.leftAt ?? now;
    if (end <= start) continue;
    if (!byUser.has(s.userId)) byUser.set(s.userId, new Map());
    const days = byUser.get(s.userId);
    forEachDayOverlap(start, end, (key, ms) => {
      days.set(key, (days.get(key) || 0) + ms);
    });
  }

  const today = dayKey(now);
  const yesterday = prevDayKey(today);
  const streaks = new Map();

  for (const [userId, dayMap] of byUser) {
    const active = [...dayMap.entries()]
      .filter(([, ms]) => ms >= MIN_SEGMENT_MS)
      .map(([k]) => k)
      .sort();

    if (active.length === 0) {
      streaks.set(userId, 0);
      continue;
    }

    const last = active[active.length - 1];
    // Streak skal være "levende": aktivitet i dag eller i går
    if (last !== today && last !== yesterday) {
      streaks.set(userId, 0);
      continue;
    }

    let streak = 0;
    let expect = last;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i] === expect) {
        streak += 1;
        expect = prevDayKey(expect);
      } else if (active[i] < expect) {
        break;
      }
    }
    streaks.set(userId, streak);
  }

  return streaks;
}

function formatTotalsTable(sessions, now) {
  const rows = buildUserTotals(sessions, now);
  if (rows.length === 0) return null;

  // Streak fra op til 90 dages historik (ikke kun rapport-vinduet)
  const streakSessions = getVoiceSessions(VOICE_TRACK_GUILD_ID, {
    sinceMs: now - STREAK_LOOKBACK_MS,
  });
  const streaks = buildUserStreaks(streakSessions, now);

  const lines = rows.map(([userId, { totalMs, aloneMs, mutedMs, deafMs, liveMs, camMs }]) => {
    const parts = [
      `<@${userId}> · **${formatDuration(totalMs)}** total`,
      `${formatDuration(aloneMs)} alene`,
    ];
    if (mutedMs >= MIN_SEGMENT_MS) parts.push(`mute ${formatDuration(mutedMs)}`);
    if (deafMs >= MIN_SEGMENT_MS) parts.push(`deaf ${formatDuration(deafMs)}`);
    if (liveMs >= MIN_SEGMENT_MS) parts.push(`live ${formatDuration(liveMs)}`);
    if (camMs >= MIN_SEGMENT_MS) parts.push(`cam ${formatDuration(camMs)}`);
    const streak = streaks.get(userId) || 0;
    if (streak >= 1) parts.push(`streak ${streak}d`);
    return parts.join(' · ');
  });

  return [`Bruger · total · alene`, ...lines].join('\n');
}

/** Tid sammen pr. duo (alle par i multi-person segmenter). */
function buildPairTotals(sessions, now) {
  const pairs = new Map();
  for (const ch of groupSessionsByChannel(sessions)) {
    const segments = buildCoPresenceSegments(ch.sessions, now).filter(
      (seg) => seg.userIds.length >= 2 && seg.end - seg.start >= MIN_SEGMENT_MS,
    );
    for (const seg of segments) {
      const dur = seg.end - seg.start;
      const ids = [...seg.userIds].sort();
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}|${ids[j]}`;
          pairs.set(key, (pairs.get(key) || 0) + dur);
        }
      }
    }
  }
  return [...pairs.entries()]
    .map(([key, ms]) => {
      const [a, b] = key.split('|');
      return { a, b, ms };
    })
    .sort((x, y) => y.ms - x.ms);
}

function formatDuoTable(sessions, now, { limit = 3 } = {}) {
  const rows = buildPairTotals(sessions, now).slice(0, limit);
  if (rows.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((row, i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} <@${row.a}> · <@${row.b}> — **${formatDuration(row.ms)}**`;
  });
  return lines.join('\n');
}

function buildReportEmbeds(sessions, days, filterNote, funFact = null, options = {}) {
  const emoji = getBotEmoji();
  const now = Date.now();
  const title = options.title || `${emoji} Voice-rapport`;
  const descriptionExtra =
    options.description || 'Hvem sad **sammen** i samme rum — tider er slået sammen.';
  const periodLabel = options.periodLabel || `seneste ${days} dage`;
  const duoLabel = options.duoLabel || (days <= 1 ? 'Dagens duo' : 'Ugens par');
  const weekDuoSessions = options.weekDuoSessions || null;
  const weekDuoLabel = options.weekDuoLabel || 'Ugens par';

  if (sessions.length === 0 && !weekDuoSessions?.length) {
    return [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `Ingen voice-aktivitet (${periodLabel}).${filterNote ? `\n${filterNote}` : ''}`,
        )
        .setTimestamp(),
    ];
  }

  const channels = groupSessionsByChannel(sessions);
  let togetherCount = 0;
  for (const ch of channels) {
    togetherCount += buildCoPresenceSegments(ch.sessions, now).filter(
      (s) => s.userIds.length >= 2 && s.end - s.start >= MIN_SEGMENT_MS,
    ).length;
  }

  const footer = `${togetherCount} samvær · ${channels.length} kanal(er) · ${periodLabel}`;
  const fields = [];

  if (funFact?.text) {
    fields.push({
      name: funFact.label || 'Fun fact',
      value: funFact.text.slice(0, FIELD_VALUE_MAX),
    });
  }

  // Ugens par (fx på dagsrapport: separat 7-dages vindue)
  if (weekDuoSessions?.length) {
    const weekDuo = formatDuoTable(weekDuoSessions, now);
    if (weekDuo) {
      fields.push({ name: weekDuoLabel, value: weekDuo });
    }
  } else if (sessions.length) {
    const periodDuo = formatDuoTable(sessions, now);
    if (periodDuo) {
      fields.push({ name: duoLabel, value: periodDuo });
    }
  }

  // Dagens duo når ugens par allerede er vist separat
  if (weekDuoSessions?.length && sessions.length && duoLabel !== weekDuoLabel) {
    const dayDuo = formatDuoTable(sessions, now);
    if (dayDuo) {
      fields.push({ name: duoLabel, value: dayDuo });
    }
  }

  for (const ch of channels) {
    const body = formatChannelBody(ch, now);
    const chunks = chunkFieldValue(body);
    const baseName = `#${ch.channelName}`.slice(0, 250);
    for (let i = 0; i < chunks.length; i++) {
      fields.push({
        name: i === 0 ? baseName : `${baseName} (fortsat)`.slice(0, 256),
        value: chunks[i],
      });
    }
  }

  const totalsBody = formatTotalsTable(sessions, now);
  if (totalsBody) {
    for (const chunk of chunkFieldValue(totalsBody)) {
      fields.push({
        name: fields.some((f) => f.name.startsWith('Samlet tid')) ? 'Samlet tid (fortsat)' : 'Samlet tid',
        value: chunk,
      });
    }
  }

  if (fields.length === 0) {
    return [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `Ingen voice-aktivitet (${periodLabel}).${filterNote ? `\n${filterNote}` : ''}`,
        )
        .setTimestamp(),
    ];
  }

  const embeds = [];
  const FIELDS_PER_EMBED = 25;

  for (let i = 0; i < fields.length && embeds.length < MAX_EMBEDS; i += FIELDS_PER_EMBED) {
    const chunk = fields.slice(i, i + FIELDS_PER_EMBED);
    const embed = new EmbedBuilder()
      .setTitle(i === 0 ? title : `${title} (fortsat)`)
      .setTimestamp()
      .setFooter({ text: footer })
      .addFields(chunk);

    if (i === 0) {
      embed.setDescription([filterNote || null, descriptionExtra].filter(Boolean).join('\n'));
    }

    embeds.push(embed);
  }

  return embeds;
}

/**
 * Bygger voice-rapport embeds (+ metadata) uden at sende.
 */
async function buildVoiceReportPayload(
  client,
  {
    days = 7,
    userId = null,
    channelId = null,
    channelName = null,
    tone = 'venlig',
    sinceMs = null,
    untilMs = null,
    title = null,
    description = null,
    periodLabel = null,
  } = {},
) {
  const emoji = getBotEmoji();
  const rangeSince =
    typeof sinceMs === 'number' ? sinceMs : Date.now() - days * 24 * 60 * 60 * 1000;
  const rangeUntil = typeof untilMs === 'number' ? untilMs : undefined;

  let sessions = getVoiceSessions(VOICE_TRACK_GUILD_ID, {
    userId: userId ?? undefined,
    channelId: channelId ?? undefined,
    sinceMs: rangeSince,
    untilMs: rangeUntil,
  });

  if (typeof untilMs === 'number') {
    sessions = clipSessionsToWindow(sessions, rangeSince, untilMs);
  }

  const filterParts = [];
  if (userId) filterParts.push(`Bruger: <@${userId}>`);
  if (channelName || channelId) {
    filterParts.push(`Kanal: #${channelName ?? channelId}`);
  }
  const filterNote = filterParts.length ? filterParts.join(' · ') : '';

  const resolvedPeriod =
    periodLabel ||
    (typeof untilMs === 'number' ? formatDateShort(rangeSince) : `seneste ${days} dage`);

  const isDayReport = typeof untilMs === 'number';
  const duoLabel = isDayReport || days <= 1 ? 'Dagens duo' : 'Ugens par';

  let weekDuoSessions = null;
  if (isDayReport) {
    const weekSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
    weekDuoSessions = getVoiceSessions(VOICE_TRACK_GUILD_ID, {
      userId: userId ?? undefined,
      channelId: channelId ?? undefined,
      sinceMs: weekSince,
    });
  }

  const toneKey = normalizeTone(tone);
  let funFact = null;
  if (sessions.length > 0 || weekDuoSessions?.length) {
    const idSet = new Set(sessions.map((s) => s.userId));
    if (weekDuoSessions) {
      for (const s of weekDuoSessions) idSet.add(s.userId);
    }
    const nameOf = await resolveDisplayNames(client, [...idSet]);
    const summaryDays = isDayReport ? 1 : days;
    let summary = buildAiSummary(sessions, summaryDays, nameOf);
    if (weekDuoSessions?.length) {
      const weekPairs = buildPairTotals(weekDuoSessions, Date.now()).slice(0, 3);
      if (weekPairs.length) {
        summary += '\n\nUgens par (seneste 7 dage):\n';
        summary += weekPairs
          .map((row) => `- ${nameOf(row.a)} + ${nameOf(row.b)}: ${formatDuration(row.ms)}`)
          .join('\n');
      }
    }
    funFact = await generateVoiceFunFact(summary, toneKey);
  }

  const resolvedTitle = title || `${emoji} Voice-rapport`;
  const resolvedDescription =
    description || 'Hvem sad **sammen** i samme rum — tider er slået sammen.';

  const embeds = buildReportEmbeds(sessions, isDayReport ? 1 : days, filterNote, funFact, {
    title: resolvedTitle,
    description: resolvedDescription,
    periodLabel: resolvedPeriod,
    duoLabel,
    weekDuoSessions,
    weekDuoLabel: 'Ugens par',
  });

  return {
    embeds,
    sessions,
    funFact,
    tone: toneKey,
    context: {
      days,
      userId,
      channelId,
      channelName,
      sinceMs: typeof sinceMs === 'number' ? sinceMs : null,
      untilMs: typeof untilMs === 'number' ? untilMs : null,
      title: resolvedTitle,
      description: resolvedDescription,
      periodLabel: resolvedPeriod,
    },
  };
}

/**
 * Bygger og sender voice-rapport som DM til rapport-brugeren.
 * Data hentes altid fra VOICE_TRACK_GUILD_ID.
 */
async function sendVoiceReport(client, options = {}) {
  const { buildToneButtons, saveReportContext } = require('../components/voiceReportButtons');

  const payload = await buildVoiceReportPayload(client, options);
  const contextId = saveReportContext(payload.context);
  const components = buildToneButtons(payload.tone, contextId);

  const recipient = await client.users.fetch(VOICE_REPORT_USER_ID);
  const embedChunks = [];
  for (let i = 0; i < payload.embeds.length; i += 10) {
    embedChunks.push(payload.embeds.slice(i, i + 10));
  }

  for (let i = 0; i < embedChunks.length; i++) {
    const msgPayload = { embeds: embedChunks[i] };
    // Knapper kun på første besked
    if (i === 0) msgPayload.components = components;
    await recipient.send(msgPayload);
  }

  return {
    sessions: payload.sessions,
    recipient,
    funFact: payload.funFact,
    tone: payload.tone,
  };
}

async function handleVoiceReportDm(message) {
  if (message.author.bot) return false;
  if (message.author.id !== VOICE_REPORT_USER_ID) return false;
  if (message.guild) return false;

  const text = message.content?.trim() ?? '';
  let days = 7;
  let tone = 'venlig';
  if (text.length > 0) {
    const match = text.match(DM_TRIGGERS);
    if (!match) return false;
    if (match[1]) days = Number.parseInt(match[1], 10);
    if (match[2]) tone = match[2].toLowerCase();
  }

  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > 90) days = 90;

  try {
    const { sessions, tone: usedTone } = await sendVoiceReport(message.client, { days, tone });
    await message.reply(
      withEmoji(`Voice-rapport sendt (${sessions.length} sessioner, ${days} dage, tone: ${usedTone}).`),
    );
  } catch (error) {
    console.error('[voicerapport] DM-rapport fejlede:', error);
    await message.reply(withEmoji('Kunne ikke sende rapporten. Prøv igen om lidt.')).catch(() => {});
  }
  return true;
}

module.exports = {
  VOICE_REPORT_USER_ID,
  VOICE_TRACK_GUILD_ID,
  sendVoiceReport,
  buildVoiceReportPayload,
  handleVoiceReportDm,
  buildCoPresenceSegments,
  buildReportEmbeds,

  data: new SlashCommandBuilder()
    .setName('voicerapport')
    .setDescription('Send voice-aktivitetsrapport som DM til rapport-modtageren')
    .addUserOption((option) =>
      option.setName('bruger').setDescription('Filtrér på en bestemt bruger').setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Filtrér på en voice channel')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('dage')
        .setDescription('Hvor mange dage tilbage (1-90, default 7)')
        .setMinValue(1)
        .setMaxValue(90)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('tone')
        .setDescription('Tone på AI-fun fact (default: venlig)')
        .setRequired(false)
        .addChoices(
          { name: 'Venlig', value: 'venlig' },
          { name: 'Roast', value: 'roast' },
          { name: 'Mega roast', value: 'mega' },
          { name: 'Sarkastisk', value: 'sarkastisk' },
          { name: 'Hyggelig', value: 'hyggelig' },
          { name: 'Dramatisk', value: 'dramatisk' },
        ),
    ),

  async execute(interaction) {
    if (!canRun(interaction)) {
      return interaction.reply({
        content: 'Kun server-admins (eller den konfigurerede rapport-bruger) kan bruge denne kommando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const days = interaction.options.getInteger('dage') ?? 7;
    const user = interaction.options.getUser('bruger');
    const channel = interaction.options.getChannel('kanal');
    const tone = interaction.options.getString('tone') ?? 'venlig';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { sessions, tone: usedTone } = await sendVoiceReport(interaction.client, {
        days,
        userId: user?.id ?? null,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        tone,
      });
      return interaction.editReply(
        withEmoji(
          `Voice-rapport sendt som DM til <@${VOICE_REPORT_USER_ID}> (${sessions.length} sessioner, tone: ${usedTone}).`,
        ),
      );
    } catch (error) {
      console.error('[voicerapport] Kunne ikke sende DM:', error);
      return interaction.editReply({
        content: withEmoji(
          `Kunne ikke sende DM til <@${VOICE_REPORT_USER_ID}>. Tjek at brugeren tillader DM fra botten.`,
        ),
      });
    }
  },
};
