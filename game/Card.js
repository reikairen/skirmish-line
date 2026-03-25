class Card {
  constructor(value, color) {
    this.value = value;
    this.color = color;
  }

  equals(other) {
    return other && this.value === other.value && this.color === other.color;
  }

  toJSON() {
    return { value: this.value, color: this.color };
  }

  toString() {
    return `${this.value}_${this.color}`;
  }
}

module.exports = Card;
