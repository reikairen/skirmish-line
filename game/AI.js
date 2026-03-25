const { Combination, compareCombinations, findBestCombination } = require('./Combination');
const { COMBINATION_TYPES, NUM_BORDERS, COLORS, VALUES } = require('./constants');

const AI = {
  /**
   * Choose a move for the AI player based on difficulty.
   */
  chooseMove(game) {
    const difficulty = game.aiDifficulty || 'medium';
    switch (difficulty) {
      case 'easy': return this._chooseMoveEasy(game);
      case 'hard': return this._chooseMoveHard(game);
      default: return this._chooseMoveMedium(game);
    }
  },

  /**
   * EASY: plays randomly — picks a random card and a random valid border.
   */
  _chooseMoveEasy(game) {
    const hand = game.players[2].hand;
    const board = game.board;
    if (hand.length === 0) return null;

    const validBorders = [];
    for (let bi = 0; bi < NUM_BORDERS; bi++) {
      const border = board.getBorder(bi);
      if (!border.claimed && !border.isFull(2)) validBorders.push(bi);
    }
    if (validBorders.length === 0) return null;

    const borderIndex = validBorders[Math.floor(Math.random() * validBorders.length)];
    const cardIndex = Math.floor(Math.random() * hand.length);
    return { cardIndex, borderIndex };
  },

  /**
   * MEDIUM: basic heuristics — matches values/colors, completes combos.
   */
  _chooseMoveMedium(game) {
    const hand = game.players[2].hand;
    const board = game.board;
    if (hand.length === 0) return null;

    let bestScore = -1;
    let bestCard = 0;
    let bestBorder = 0;

    for (let bi = 0; bi < NUM_BORDERS; bi++) {
      const border = board.getBorder(bi);
      if (border.claimed || border.isFull(2)) continue;

      const myCards = border.combinations[2].cards;

      for (let ci = 0; ci < hand.length; ci++) {
        const card = hand[ci];
        let score = 0;

        if (myCards.length === 0) {
          score = card.value;
        } else if (myCards.length === 1) {
          const existing = myCards[0];
          if (card.value === existing.value) score += 10;
          if (Math.abs(card.value - existing.value) === 1) score += 8;
          if (Math.abs(card.value - existing.value) === 2) score += 5;
          if (card.color === existing.color) score += 7;
          score += card.value;
        } else if (myCards.length === 2) {
          const testCombo = new Combination();
          myCards.forEach(c => testCombo.addCard(c));
          testCombo.addCard(card);
          score = testCombo.getRank() * 30 + testCombo.getSum();
        }

        if (score > bestScore) {
          bestScore = score;
          bestCard = ci;
          bestBorder = bi;
        }
      }
    }

    if (bestScore < 0) {
      for (let bi = 0; bi < NUM_BORDERS; bi++) {
        const border = board.getBorder(bi);
        if (!border.claimed && !border.isFull(2)) {
          return { cardIndex: 0, borderIndex: bi };
        }
      }
      return null; // no valid moves
    }

    return { cardIndex: bestCard, borderIndex: bestBorder };
  },

  /**
   * HARD: strategic AI — considers opponent's board, prioritizes winning combos,
   * focuses on adjacent stones, avoids wasting high cards.
   */
  _chooseMoveHard(game) {
    const hand = game.players[2].hand;
    const board = game.board;
    if (hand.length === 0) return null;

    // Track which cards have been played (for probability estimation)
    const playedCards = new Set();
    for (let bi = 0; bi < NUM_BORDERS; bi++) {
      const border = board.getBorder(bi);
      for (const c of border.combinations[1].cards) playedCards.add(`${c.value}_${c.color}`);
      for (const c of border.combinations[2].cards) playedCards.add(`${c.value}_${c.color}`);
    }

    // Count our claimed borders and find adjacency opportunities
    const claimedBy = [];
    for (let bi = 0; bi < NUM_BORDERS; bi++) {
      const border = board.getBorder(bi);
      claimedBy.push(border.claimed ? border.winner : 0);
    }

    let bestScore = -Infinity;
    let bestCard = 0;
    let bestBorder = 0;

    for (let bi = 0; bi < NUM_BORDERS; bi++) {
      const border = board.getBorder(bi);
      if (border.claimed || border.isFull(2)) continue;

      const myCards = border.combinations[2].cards;
      const oppCards = border.combinations[1].cards;

      // Strategic border value: higher for borders that could give us 3-adjacent
      const adjacencyBonus = this._adjacencyValue(claimedBy, bi, 2);
      // Also consider blocking opponent's adjacency
      const blockingBonus = this._adjacencyValue(claimedBy, bi, 1) * 0.5;

      for (let ci = 0; ci < hand.length; ci++) {
        const card = hand[ci];
        let score = 0;

        if (myCards.length === 2) {
          // Completing a combo — this is the most important decision
          const testCombo = new Combination();
          myCards.forEach(c => testCombo.addCard(c));
          testCombo.addCard(card);
          const rank = testCombo.getRank();
          const sum = testCombo.getSum();

          // High score for strong combinations
          score = rank * 50 + sum;

          // If opponent also has cards, check if we'd actually win
          if (oppCards.length === 3) {
            const oppCombo = new Combination();
            oppCards.forEach(c => oppCombo.addCard(c));
            const cmpResult = compareCombinations(testCombo, oppCombo);
            if (cmpResult === 1) score += 200;     // guaranteed win
            else if (cmpResult === 2) score -= 100; // guaranteed loss, don't waste card
            else score -= 50; // tie
          } else if (oppCards.length > 0) {
            // Estimate if opponent could beat us
            const canBeat = this._estimateOpponentThreat(oppCards, testCombo, playedCards);
            if (!canBeat) score += 100; // likely unbeatable
          }
        } else if (myCards.length === 1) {
          const existing = myCards[0];
          // Score based on combo potential
          if (card.value === existing.value) score += 25; // three-of-a-kind track
          if (card.color === existing.color) {
            score += 15; // color track
            if (Math.abs(card.value - existing.value) <= 2) score += 20; // color run track
          }
          if (Math.abs(card.value - existing.value) === 1) score += 18; // run track
          if (Math.abs(card.value - existing.value) === 2) score += 12; // run possible
          score += card.value * 0.5;
        } else {
          // Empty border — prefer placing mid-high cards that have combo potential
          // Count how many cards in hand share value or color
          const sameValue = hand.filter(h => h.value === card.value).length;
          const sameColor = hand.filter(h => h.color === card.color).length;
          const adjacent = hand.filter(h => Math.abs(h.value - card.value) === 1 && h.color === card.color).length;

          score = card.value * 0.5;
          if (sameValue >= 2) score += 15; // three-of-a-kind potential in hand
          if (sameColor >= 2) score += 10; // color potential
          if (adjacent >= 1) score += 20; // color run potential
        }

        // Apply strategic bonuses
        score += adjacencyBonus * 15;
        score += blockingBonus * 10;

        // Penalize spreading too thin — prefer borders we've already invested in
        if (myCards.length > 0) score += 8;

        if (score > bestScore) {
          bestScore = score;
          bestCard = ci;
          bestBorder = bi;
        }
      }
    }

    if (bestScore === -Infinity) {
      for (let bi = 0; bi < NUM_BORDERS; bi++) {
        const border = board.getBorder(bi);
        if (!border.claimed && !border.isFull(2)) {
          return { cardIndex: 0, borderIndex: bi };
        }
      }
      return null; // no valid moves
    }

    return { cardIndex: bestCard, borderIndex: bestBorder };
  },

  /**
   * Calculate adjacency value — how close is this border to giving
   * the player 3 adjacent claimed stones?
   */
  _adjacencyValue(claimedBy, borderIndex, playerId) {
    let value = 0;

    // Check left neighbors
    let leftCount = 0;
    for (let i = borderIndex - 1; i >= 0; i--) {
      if (claimedBy[i] === playerId) leftCount++;
      else break;
    }

    // Check right neighbors
    let rightCount = 0;
    for (let i = borderIndex + 1; i < claimedBy.length; i++) {
      if (claimedBy[i] === playerId) rightCount++;
      else break;
    }

    // 2 adjacent already = this would win
    if (leftCount + rightCount >= 2) value = 5;
    else if (leftCount + rightCount >= 1) value = 2;

    return value;
  },

  /**
   * Estimate whether opponent could beat our completed combination
   * based on their current cards and remaining deck.
   */
  _estimateOpponentThreat(oppCards, myCombo, playedCards) {
    // Simple heuristic: if opponent has 2 cards that are already strong,
    // assume they might complete something good
    if (oppCards.length < 2) return true; // unknown, assume possible

    const sorted = [...oppCards].sort((a, b) => a.value - b.value);
    const sameColor = oppCards.every(c => c.color === oppCards[0].color);
    const sameValue = oppCards.every(c => c.value === oppCards[0].value);
    const consecutive = sorted.every((c, i) => i === 0 || c.value === sorted[i - 1].value + 1);

    // Check if they could potentially form something that beats us
    const myRank = myCombo.getRank();

    if (sameColor && consecutive && myRank < COMBINATION_TYPES.COLOR_RUN) return true;
    if (sameValue && myRank < COMBINATION_TYPES.THREE_OF_A_KIND) return true;
    if (sameColor && myRank < COMBINATION_TYPES.COLOR) return true;
    if (consecutive && myRank < COMBINATION_TYPES.RUN) return true;

    // If our rank is high enough, they probably can't beat us
    return false;
  },
};

module.exports = AI;
