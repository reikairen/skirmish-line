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

    // Check if game should end (both hands empty and deck empty)
    if (this.deck.isEmpty() &&
        this.players[1].hand.length === 0 &&
        this.players[2].hand.length === 0) {
      this._resolveRemainingBorders();
    }
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
}

module.exports = GameEngine;
