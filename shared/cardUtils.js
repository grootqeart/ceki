const { SUITS, RANKS, JOKER_COUNT, NORMAL_VALUES, HIGH_VALUES } = require('./constants');

// Card shape: { id, suit, rank, isJoker }
// id is a stable unique string, e.g. "S-1", "joker-1"

function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${suit}-${rank}`, suit, rank, isJoker: false });
    }
  }
  for (let i = 1; i <= JOKER_COUNT; i++) {
    cards.push({ id: `joker-${i}`, suit: null, rank: null, isJoker: true });
  }
  return cards;
}

function shuffle(deck) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Value of a normal (non-joker) card at a given tariff ('normal' | 'high')
function baseCardValue(card, tariff) {
  const table = tariff === 'high' ? HIGH_VALUES : NORMAL_VALUES;
  if (card.rank === 1) return table.ace;
  if (card.rank >= 11) return table.face;
  return table.low;
}

// Value of a card for scoring purposes. If the card is a joker, `impersonatedRank`
// (the rank it represents within its meld) must be supplied to compute the
// "mengikuti nilai kartu yang digantikan" rule for normal tariff. For the high
// tariff, a joker is always worth HIGH_VALUES.joker regardless of what it represents.
function cardValue(card, tariff, impersonatedRank) {
  if (card.isJoker) {
    if (tariff === 'high') return HIGH_VALUES.joker;
    if (impersonatedRank == null) return NORMAL_VALUES.low; // fallback, shouldn't normally happen
    const fakeCard = { rank: impersonatedRank, isJoker: false };
    return baseCardValue(fakeCard, 'normal');
  }
  return baseCardValue(card, tariff);
}

module.exports = { createDeck, shuffle, cardValue, baseCardValue };
