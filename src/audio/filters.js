const { EQ_PRESETS } = require('./presets');

function getActiveFilters(queue) {
  try {
    return queue.filters.ffmpeg.getFiltersEnabled() ?? [];
  } catch {
    return [];
  }
}

async function setFilters(queue, filters) {
  await queue.filters.ffmpeg.setFilters(filters);
}

async function addFilter(queue, name) {
  const active = new Set(getActiveFilters(queue));
  active.add(name);
  await setFilters(queue, [...active]);
  return [...active];
}

async function removeFilter(queue, name) {
  const active = new Set(getActiveFilters(queue));
  active.delete(name);
  await setFilters(queue, [...active]);
  return [...active];
}

async function clearFilters(queue) {
  await setFilters(queue, []);
  try {
    await queue.filters.ffmpeg.setInputArgs(undefined);
  } catch {
    /* noop */
  }
  return [];
}

async function applyEqualizer(queue, presetName) {
  const bands = EQ_PRESETS[presetName];
  if (!bands) throw new Error(`Ukendt EQ-preset: ${presetName}`);

  if (queue.filters.equalizer) {
    queue.filters.equalizer.setEQ(bands.map((gain, band) => ({ band, gain })));
    queue.filters.equalizer.enable();
  } else {
    throw new Error('Equalizer er ikke tilgængelig på denne kø');
  }
}

async function disableEqualizer(queue) {
  if (queue.filters.equalizer) {
    queue.filters.equalizer.disable();
  }
}

async function setSpeed(queue, speed) {
  if (speed < 0.5 || speed > 2.0) {
    throw new Error('Hastighed skal være mellem 0.5 og 2.0');
  }
  await queue.filters.ffmpeg.setFilters({ tempo: speed });
}

async function ensureDefaultFilters(queue, { quality = true } = {}) {
  if (!quality) return;
  try {
    const active = new Set(getActiveFilters(queue));
    if (!active.has('softlimiter')) {
      active.add('softlimiter');
      await setFilters(queue, [...active]);
    }
  } catch (error) {
    console.warn('[audio] Kunne ikke aktivere softlimiter:', error.message);
  }
}

module.exports = {
  getActiveFilters,
  setFilters,
  addFilter,
  removeFilter,
  clearFilters,
  applyEqualizer,
  disableEqualizer,
  setSpeed,
  ensureDefaultFilters,
};
