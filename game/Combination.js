const { COMBINATION_TYPES, CARDS_PER_SIDE } = require('./constants');

class Combination {
  constructor() {
    this.cards = [];
    this.maxCards = CARDS_PER_SIDE;
  }

  addCard(card) {
    if (this.cards.length >= this.maxCards) {
      throw new Error('Combination is already full');
    }
    this.cards.push({ value: card.value, color: card.color });
  }

  isFull() {
    return this.cards.length >= this.maxCards;
  }

  getSum() {
    return this.cards.reduce((sum, c) => sum + c.value, 0);
  }

  getType() {
    if (this.cards.length < this.maxCards) return COMBINATION_TYPES.NONE;

    const isCol = this._isColor();
    const isRn = this._isRun();

    if (isCol && isRn) return COMBINATION_TYPES.COLOR_RUN;
    if (isRn) return COMBINATION_TYPES.RUN;
    if (isCol) return COMBINATION_TYPES.COLOR;
    if (this._isThreeOfAKind()) return COMBINATION_TYPES.THREE_OF_A_KIND;
    return COMBINATION_TYPES.SUM;
  }

  getRank() {
    return this.getType();
  }

  _isColor() {
    if (this.cards.length < this.maxCards) return false;
    return this.cards.every(c => c.color === this.cards[0].color);
  }

  _isRun() {
    if (this.cards.length < this.maxCards) return false;
    const sorted = [...this.cards].sort((a, b) => a.value - b.value);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].value !== sorted[i].value + 1) return false;
    }
    return true;
  }

  _isThreeOfAKind() {
    if (this.cards.length < this.maxCards) return false;
    return this.cards.every(c => c.value === this.cards[0].value);
  }

  toJSON() {
    return this.cards.map(c => ({ value: c.value, color: c.color }));
  }
}

/**
 * Compare two complete combinations.
 * Returns: 1 if combo1 wins, 2 if combo2 wins, 0 if tie.
 */
function compareCombinations(combo1, combo2) {
  const rank1 = combo1.getRank();
  const rank2 = combo2.getRank();

  if (rank1 > rank2) return 1;
  if (rank2 > rank1) return 2;

  // Same rank — compare sums
  const sum1 = combo1.getSum();
  const sum2 = combo2.getSum();

  if (sum1 > sum2) return 1;
  if (sum2 > sum1) return 2;

  return 0; // perfect tie
}

/**
 * Given an array of complete Combinations, return the index of the best one.
 */
function findBestCombination(combinations) {
  if (combinations.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < combinations.length; i++) {
    const result = compareCombinations(combinations[i], combinations[bestIdx]);
    if (result === 1) {
      bestIdx = i;
    }
  }
  return bestIdx;
}

module.exports = { Combination, compareCombinations, findBestCombination };
