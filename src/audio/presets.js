const FILTER_PRESETS = [
  'bassboost',
  'bassboost_low',
  'bassboost_high',
  'nightcore',
  'vaporwave',
  '8D',
  'karaoke',
  'treble',
  'subboost',
  'vibrato',
  'tremolo',
  'mono',
  'normalizer',
  'softlimiter',
  'reverse',
  'fadein',
  'compressor',
  'expander',
];

const EQ_PRESETS = {
  flat: Array(15).fill(0),
  bass: [10, 8, 6, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 6, 8, 8, 10],
  vocal: [-2, -2, 0, 2, 4, 4, 4, 2, 2, 0, 0, 0, 0, 0, 0],
  party: [6, 5, 4, 3, 2, 0, 0, 0, 2, 3, 4, 5, 6, 6, 6],
  classical: [3, 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 2, 3, 3, 3],
  rock: [5, 4, 3, 2, 0, -2, -2, 0, 2, 4, 5, 5, 5, 5, 5],
};

const EQ_LABELS = {
  flat: 'Flat (neutral)',
  bass: 'Bass boost',
  treble: 'Treble boost',
  vocal: 'Vocal forward',
  party: 'Party (V-shape)',
  classical: 'Classical',
  rock: 'Rock',
};

module.exports = { FILTER_PRESETS, EQ_PRESETS, EQ_LABELS };
