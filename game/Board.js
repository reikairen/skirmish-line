const Border = require('./Border');
const { NUM_BORDERS } = require('./constants');

class Board {
  constructor() {
    this.borders = [];
    for (let i = 0; i < NUM_BORDERS; i++) {
      this.borders.push(new Border(i));
    }
  }

  getBorder(id) {
    if (id < 0 || id >= NUM_BORDERS) throw new Error('Invalid border id');
    return this.borders[id];
  }

  /**
   * Check for a winner.
   * Returns player id (1 or 2) if someone won, null otherwise.
   * Win conditions: 5+ borders claimed OR 3 adjacent borders claimed.
   */
  checkWinner() {
    const counts = { 1: 0, 2: 0 };

    // Count total claimed borders
    for (const border of this.borders) {
      if (border.claimed && border.winner) {
        counts[border.winner]++;
      }
    }

    if (counts[1] >= 5) return 1;
    if (counts[2] >= 5) return 2;

    // Check 3 adjacent
    let adj1 = 0, adj2 = 0;
    for (const border of this.borders) {
      if (border.claimed && border.winner === 1) {
        adj1++;
        adj2 = 0;
      } else if (border.claimed && border.winner === 2) {
        adj2++;
        adj1 = 0;
      } else {
        adj1 = 0;
        adj2 = 0;
      }
      if (adj1 >= 3) return 1;
      if (adj2 >= 3) return 2;
    }

    return null;
  }

  toJSON() {
    return this.borders.map(b => b.toJSON());
  }
}

module.exports = Board;
