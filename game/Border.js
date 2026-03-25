const { Combination, compareCombinations } = require('./Combination');
const { CARDS_PER_SIDE } = require('./constants');

class Border {
  constructor(id) {
    this.id = id;
    this.combinations = {
      1: new Combination(),
      2: new Combination(),
    };
    this.claimed = false;
    this.winner = null; // player id (1 or 2)
  }

  addCard(playerId, card) {
    if (this.claimed) throw new Error('Border is already claimed');
    const combo = this.combinations[playerId];
    if (combo.isFull()) throw new Error('This side of the border is full');
    combo.addCard(card);
  }

  isFull(playerId) {
    return this.combinations[playerId].isFull();
  }

  bothSidesFull() {
    return this.combinations[1].isFull() && this.combinations[2].isFull();
  }

  /**
   * Attempt to claim this border for the given player.
   * Both sides must be full. Returns true if claim succeeds.
   */
  claim(claimerId) {
    if (this.claimed) return false;

    const claimerCombo = this.combinations[claimerId];
    const opponentId = claimerId === 1 ? 2 : 1;
    const opponentCombo = this.combinations[opponentId];

    if (!claimerCombo.isFull()) return false;
    if (!opponentCombo.isFull()) return false;

    const result = compareCombinations(claimerCombo, opponentCombo);

    if (result === 0) return false; // tie — nobody claims
    if (result !== 1) return false; // opponent's combo is better (1 = first arg wins)

    this.claimed = true;
    this.winner = claimerId;
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      claimed: this.claimed,
      winner: this.winner,
      player1Cards: this.combinations[1].toJSON(),
      player2Cards: this.combinations[2].toJSON(),
    };
  }
}

module.exports = Border;
