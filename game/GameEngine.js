const Board = require('./Board');
const Deck = require('./Deck');
const { HAND_SIZE, NUM_BORDERS, TURN_PHASES } = require('./constants');

class GameEngine {
  constructor(player1Id, player2Id, options = {}) {
    this.players = {
      1: { id: 1, socketId: player1Id, hand: [], claimedBorders: [] },
      2: { id: 2, socketId: player2Id, hand: [], claimedBorders: [] },
    };
    this.board = new Board();
    this.deck = Deck.createClanDeck();
    this.currentPlayer = 1;
    this.turnPhase = TURN_PHASES.PLAY_CARD;
    this.gameOver = false;
    this.winner = null;
    this.aiMode = options.aiMode || false;
    this.aiDifficulty = options.aiDifficulty || 'medium';
  }

  start() {
    // Deal HAND_SIZE cards to each player
    for (let i = 0; i < HAND_SIZE; i++) {
      this.players[1].hand.push(this.deck.draw());
      this.players[2].hand.push(this.deck.draw());
    }
  }

  /**
   * Play a card from the current player's hand to a border.
   */
  playCard(playerId, cardIndex, borderIndex) {
    if (this.gameOver) throw new Error('Game is over');
    if (playerId !== this.currentPlayer) throw new Error('Not your turn');
    if (this.turnPhase !== TURN_PHASES.PLAY_CARD) throw new Error('Not in play phase');

    const player = this.players[playerId];
    if (cardIndex < 0 || cardIndex >= player.hand.length) throw new Error('Invalid card index');
    if (borderIndex < 0 || borderIndex >= NUM_BORDERS) throw new Error('Invalid border index');

    const border = this.board.getBorder(borderIndex);
    if (border.claimed) throw new Error('Border is already claimed');
    if (border.isFull(playerId)) throw new Error('Your side of this border is full');

    const card = player.hand.splice(cardIndex, 1)[0];
    border.addCard(playerId, card);

    // Move to claim phase
    this.turnPhase = TURN_PHASES.CLAIM;

    // Auto-claim borders where both sides are full
    this._autoClaimBorders();

    // Check for game over
    const winner = this.board.checkWinner();
    if (winner) {
      this.gameOver = true;
      this.winner = winner;
    }

    return true;
  }

  /**
   * Manually claim a border (player chooses to claim).
   * In our simplified rules, claiming is automatic when both sides are full,
   * so this is mainly for explicit claims.
   */
  claimBorder(playerId, borderIndex) {
    if (this.gameOver) throw new Error('Game is over');
    if (playerId !== this.currentPlayer) throw new Error('Not your turn');
    if (this.turnPhase !== TURN_PHASES.CLAIM) throw new Error('Not in claim phase');

    const border = this.board.getBorder(borderIndex);
    const success = border.claim(playerId);

    if (success) {
      this.players[playerId].claimedBorders.push(borderIndex);

      const winner = this.board.checkWinner();
      if (winner) {
        this.gameOver = true;
        this.winner = winner;
      }
    }

    return success;
  }

  /**
   * End the current player's turn: draw a card and switch players.
   */
  endTurn(playerId) {
    if (this.gameOver) return;
    if (playerId !== this.currentPlayer) throw new Error('Not your turn');
    if (this.turnPhase !== TURN_PHASES.CLAIM) throw new Error('Must play a card first');

    // Draw a card if deck is not empty
    const player = this.players[playerId];
    if (!this.deck.isEmpty()) {
      player.hand.push(this.deck.draw());
    }

    // Switch turn
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    this.turnPhase = TURN_PHASES.PLAY_CARD;

    // Check if game should end
    if (!this.gameOver) {
      const p1Empty = this.players[1].hand.length === 0;
      const p2Empty = this.players[2].hand.length === 0;
      const deckEmpty = this.deck.isEmpty();
      const noMoves = !this._hasValidMove(this.currentPlayer);

      if ((deckEmpty && p1Empty && p2Empty) || noMoves) {
        this._resolveRemainingBorders();

        // If still no winner after resolving, force end by border count (M2/M3)
        if (!this.gameOver) {
          this._forceEndGame();
        }
      }
    }
  }

  /**
   * Force end the game when no further progress is possible.
   * Winner is determined by most claimed borders; ties go to player 1 (first mover).
   */
  _forceEndGame() {
    const p1Count = this.players[1].claimedBorders.length;
    const p2Count = this.players[2].claimedBorders.length;
    this.gameOver = true;
    this.winner = p2Count > p1Count ? 2 : 1;
  }

  /**
   * Check if a player has at least one valid border to place a tile on.
   */
  _hasValidMove(playerId) {
    for (const border of this.board.borders) {
      if (!border.claimed && !border.isFull(playerId)) return true;
    }
    return false;
  }

  /**
   * Auto-claim any borders where both sides are full.
   */
  _autoClaimBorders() {
    for (const border of this.board.borders) {
      if (!border.claimed && border.bothSidesFull()) {
        // Try claiming for each player — compareCombinations decides who wins
        if (border.claim(1)) {
          this.players[1].claimedBorders.push(border.id);
        } else if (border.claim(2)) {
          this.players[2].claimedBorders.push(border.id);
        }
        // If both fail, it's a tie and border stays unclaimed
      }
    }
  }

  /**
   * When the game runs out of moves, resolve any unclaimed borders
   * where both sides are full.
   */
  _resolveRemainingBorders() {
    for (const border of this.board.borders) {
      if (!border.claimed && border.bothSidesFull()) {
        if (border.claim(1)) {
          this.players[1].claimedBorders.push(border.id);
        } else if (border.claim(2)) {
          this.players[2].claimedBorders.push(border.id);
        }
      }
    }
    const winner = this.board.checkWinner();
    if (winner) {
      this.gameOver = true;
      this.winner = winner;
    }
  }

  /**
   * Get the list of borders the current player can claim manually.
   */
  getClaimableBorders(playerId) {
    const claimable = [];
    for (const border of this.board.borders) {
      if (!border.claimed && border.bothSidesFull()) {
        // Check if this player would win the claim
        const { compareCombinations } = require('./Combination');
        const result = compareCombinations(
          border.combinations[playerId],
          border.combinations[playerId === 1 ? 2 : 1]
        );
        if (result === 1) { // 1 means first arg (claimer) wins
          claimable.push(border.id);
        }
      }
    }
    return claimable;
  }

  /**
   * Get sanitized game state for a specific player.
   * Player sees own hand but not opponent's.
   */
  getStateForPlayer(playerId) {
    const opponentId = playerId === 1 ? 2 : 1;

    return {
      playerId,
      currentPlayer: this.currentPlayer,
      turnPhase: this.turnPhase,
      hand: this.players[playerId].hand.map(c => c.toJSON()),
      borders: this.board.toJSON(),
      deckRemaining: this.deck.remaining(),
      opponentCardCount: this.players[opponentId].hand.length,
      scores: {
        1: this.players[1].claimedBorders.length,
        2: this.players[2].claimedBorders.length,
      },
      gameOver: this.gameOver,
      winner: this.winner,
    };
  }

  /**
   * Generate a detailed end-of-session summary.
   */
  getSummary() {
    const { COMBINATION_NAMES } = require('./constants');
    const { Combination, compareCombinations } = require('./Combination');

    const nodes = [];
    let winReason = '';

    // Determine win reason (use claimedBorders arrays as source of truth)
    const counts = {
      1: this.players[1].claimedBorders.length,
      2: this.players[2].claimedBorders.length,
    };
    let adj1 = 0, adj2 = 0, adj1Start = -1, adj2Start = -1;
    let winByAdj = null, adjStart = -1;

    for (const border of this.board.borders) {
      // Track adjacency
      if (border.claimed && border.winner === 1) {
        if (adj1 === 0) adj1Start = border.id;
        adj1++;
        adj2 = 0;
      } else if (border.claimed && border.winner === 2) {
        if (adj2 === 0) adj2Start = border.id;
        adj2++;
        adj1 = 0;
      } else {
        adj1 = 0;
        adj2 = 0;
      }
      if (adj1 >= 3 && !winByAdj) { winByAdj = 1; adjStart = adj1Start; }
      if (adj2 >= 3 && !winByAdj) { winByAdj = 2; adjStart = adj2Start; }
    }

    if (winByAdj === this.winner) {
      winReason = `Secured 3 adjacent nodes in a row (nodes ${adjStart + 1}\u2013${adjStart + 3})`;
    } else if (counts[this.winner] >= 5) {
      winReason = `Secured ${counts[this.winner]} of 9 nodes (5 required)`;
    } else if (counts[this.winner] > counts[this.winner === 1 ? 2 : 1]) {
      winReason = `Secured more nodes (${counts[this.winner]} vs ${counts[this.winner === 1 ? 2 : 1]})`;
    } else {
      winReason = `Session resolved by tiebreaker (${counts[1]} \u2013 ${counts[2]})`;
    }

    // Build per-node breakdown
    for (const border of this.board.borders) {
      const p1Cards = border.combinations[1].cards;
      const p2Cards = border.combinations[2].cards;
      const p1Full = border.combinations[1].isFull();
      const p2Full = border.combinations[2].isFull();

      let p1Type = null, p2Type = null, p1Sum = 0, p2Sum = 0;

      if (p1Full) {
        const c = new Combination();
        p1Cards.forEach(card => c.addCard(card));
        p1Type = COMBINATION_NAMES[c.getType()] || 'Total';
        p1Sum = c.getSum();
      }
      if (p2Full) {
        const c = new Combination();
        p2Cards.forEach(card => c.addCard(card));
        p2Type = COMBINATION_NAMES[c.getType()] || 'Total';
        p2Sum = c.getSum();
      }

      let outcome;
      if (border.claimed) {
        outcome = border.winner; // 1 or 2
      } else if (p1Full && p2Full) {
        outcome = 'tie';
      } else {
        outcome = 'incomplete';
      }

      nodes.push({
        id: border.id,
        p1Cards,
        p2Cards,
        p1Type,
        p2Type,
        p1Sum,
        p2Sum,
        outcome,
        winner: border.winner,
      });
    }

    return {
      winner: this.winner,
      winReason,
      scores: {
        1: counts[1],
        2: counts[2],
      },
      nodes,
    };
  }
}

module.exports = GameEngine;
