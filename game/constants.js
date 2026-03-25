const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const NUM_BORDERS = 9;
const HAND_SIZE = 6;
const CARDS_PER_SIDE = 3;

// Official rankings (strongest to weakest):
// Color Run > Three of a Kind > Color > Run > Sum
const COMBINATION_TYPES = {
  NONE: 0,
  SUM: 1,
  RUN: 2,
  COLOR: 3,
  THREE_OF_A_KIND: 4,
  COLOR_RUN: 5,
};

const COMBINATION_NAMES = {
  [COMBINATION_TYPES.NONE]: 'None',
  [COMBINATION_TYPES.SUM]: 'Total',
  [COMBINATION_TYPES.RUN]: 'Sequence',
  [COMBINATION_TYPES.COLOR]: 'Category',
  [COMBINATION_TYPES.THREE_OF_A_KIND]: 'Triplet',
  [COMBINATION_TYPES.COLOR_RUN]: 'Cat. Sequence',
};

const TURN_PHASES = {
  PLAY_CARD: 'play',
  CLAIM: 'claim',
};

module.exports = {
  COLORS,
  VALUES,
  NUM_BORDERS,
  HAND_SIZE,
  CARDS_PER_SIDE,
  COMBINATION_TYPES,
  COMBINATION_NAMES,
  TURN_PHASES,
};
