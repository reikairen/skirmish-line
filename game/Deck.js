const crypto = require('crypto');
const Card = require('./Card');
const { COLORS, VALUES } = require('./constants');

class Deck {
  constructor() {
    this.cards = [];
  }

  static createClanDeck() {
    const deck = new Deck();
    for (const color of COLORS) {
      for (const value of VALUES) {
        deck.cards.push(new Card(value, color));
      }
    }
    deck.shuffle();
    return deck;
  }

  shuffle() {
    // Fisher-Yates shuffle with cryptographic randomness
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    if (this.cards.length === 0) return null;
    return this.cards.pop();
  }

  remaining() {
    return this.cards.length;
  }

  isEmpty() {
    return this.cards.length === 0;
  }
}

module.exports = Deck;
