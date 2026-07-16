// Meld (kombinasi) validation logic shared between server (authoritative) and
// client (optimistic UI hints). A meld is either:
//   - a "run": >=3 cards, same suit, consecutive ranks -- all within ONE rank
//     group: numbers 2..10, OR court cards J-Q-K (11..13). Aces never appear in
//     a run, and numbers may not mix with court cards (house rule).
//   - a "set": 3-4 cards, same rank, distinct suits (Aces and court cards may
//     form sets normally; the run restriction only affects runs).
// Jokers act as wildcards filling any missing rank/suit within a meld.
//
// House rule (not specified explicitly in the brief): a meld must contain at
// least one natural (non-joker) card, since an all-joker group has no
// well-defined rank/suit for scoring purposes.

// A run window [start, end] is only legal if it stays entirely inside a single
// rank group: numbers [2,10] or court [11,13].
function isRunWindowLegal(start, end) {
  const inNumbers = start >= 2 && end <= 10;
  const inCourt = start >= 11 && end <= 13;
  return inNumbers || inCourt;
}

function isRun(cards) {
  const jokers = cards.filter((c) => c.isJoker);
  const naturals = cards.filter((c) => !c.isJoker);
  if (naturals.length === 0) return false;
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return false;
  const ranks = naturals.map((c) => c.rank);
  if (new Set(ranks).size !== ranks.length) return false; // duplicate rank -> not a run
  const len = cards.length;
  if (len > 13) return false;
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  if (maxRank - minRank + 1 > len) return false;
  // Try every window [start, start+len-1] that could contain [minRank,maxRank],
  // and accept the first one that is legal (single rank group) and whose gaps
  // are exactly filled by the available jokers.
  const lowestStart = Math.max(1, maxRank - len + 1);
  const highestStart = Math.min(minRank, 13 - len + 1);
  for (let start = lowestStart; start <= highestStart; start++) {
    const end = start + len - 1;
    if (!isRunWindowLegal(start, end)) continue;
    const window = [];
    for (let r = start; r <= end; r++) window.push(r);
    const missing = window.filter((r) => !ranks.includes(r));
    if (missing.length !== jokers.length) continue;
    const jokerAssignments = jokers.map((j, idx) => ({ jokerId: j.id, suit, rank: missing[idx] }));
    return { type: 'run', suit, ranks: window, jokerAssignments };
  }
  return false;
}

function isSet(cards) {
  const jokers = cards.filter((c) => c.isJoker);
  const naturals = cards.filter((c) => !c.isJoker);
  if (naturals.length === 0) return false;
  if (cards.length > 4) return false;
  const rank = naturals[0].rank;
  if (!naturals.every((c) => c.rank === rank)) return false;
  const suits = naturals.map((c) => c.suit);
  if (new Set(suits).size !== suits.length) return false; // duplicate suit -> not a set
  const allSuits = ['S', 'H', 'D', 'C'];
  const remainingSuits = allSuits.filter((s) => !suits.includes(s));
  if (jokers.length > remainingSuits.length) return false;
  const jokerAssignments = jokers.map((j, idx) => ({ jokerId: j.id, suit: remainingSuits[idx], rank }));
  return { type: 'set', rank, suits: [...suits, ...jokerAssignments.map((j) => j.suit)], jokerAssignments };
}

// Returns meld info ({type, ...}) if `cards` (length >= 3) forms a single
// valid run or set, otherwise false.
function validateMeld(cards) {
  if (!cards || cards.length < 3) return false;
  return isRun(cards) || isSet(cards);
}

function combinations(arr, size) {
  const results = [];
  function backtrack(start, combo) {
    if (combo.length === size) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }
  backtrack(0, []);
  return results;
}

// Checks whether `neededCard` can immediately form a valid meld together with
// at least 2 supporting cards drawn from `handCards`. Used to validate taking
// a card from the discard pile.
function canFormMeldWithCard(neededCard, handCards) {
  const maxSupport = Math.min(handCards.length, 12);
  for (let size = 2; size <= maxSupport; size++) {
    const subsets = combinations(handCards, size);
    for (const subset of subsets) {
      const meld = validateMeld([neededCard, ...subset]);
      if (meld) return { meld, supportingCards: subset };
    }
  }
  return false;
}

// Enumerates all valid melds (size 3..cards.length) that are subsets of `cards`.
function findAllCandidateMelds(cards) {
  const candidates = [];
  const maxSize = Math.min(cards.length, 13);
  for (let size = 3; size <= maxSize; size++) {
    for (const combo of combinations(cards, size)) {
      const meld = validateMeld(combo);
      if (meld) candidates.push({ cards: combo, meld });
    }
  }
  return candidates;
}

function bitmaskOf(combo, allCards) {
  let mask = 0;
  for (const c of combo) {
    const idx = allCards.indexOf(c);
    mask |= 1 << idx;
  }
  return mask;
}

// Determines whether `cards` can be perfectly partitioned (every card used,
// no leftovers) into disjoint valid melds. Returns the partition (array of
// melds) if possible, otherwise null.
function findPerfectPartition(cards) {
  if (cards.length === 0) return [];
  if (cards.length > 20) throw new Error('hand too large for partition search');
  const candidates = findAllCandidateMelds(cards).map((c) => ({
    ...c,
    mask: bitmaskOf(c.cards, cards),
  }));
  const fullMask = (1 << cards.length) - 1;
  const memo = new Map();

  function solve(mask) {
    if (mask === 0) return [];
    if (memo.has(mask)) return memo.get(mask);
    let result = null;
    for (const cand of candidates) {
      if ((cand.mask & mask) === cand.mask) {
        const rest = solve(mask & ~cand.mask);
        if (rest !== null) {
          result = [cand, ...rest];
          break;
        }
      }
    }
    memo.set(mask, result);
    return result;
  }

  const solved = solve(fullMask);
  return solved;
}

// Finds the subset of `cards` that maximizes total melded value (each card
// valued at `valueFn(card)`), used for end-of-deck scoring where unmelded
// cards count against the player. Returns { meldedCards, melds, unmeldedCards }.
function bestMeldedSubset(cards, valueFn) {
  const candidates = findAllCandidateMelds(cards).map((c) => ({
    ...c,
    mask: bitmaskOf(c.cards, cards),
    value: c.cards.reduce((sum, card) => sum + valueFn(card, c.meld), 0),
  }));
  const fullMask = (1 << cards.length) - 1;
  const memo = new Map();

  function solve(mask) {
    if (mask === 0) return { value: 0, melds: [] };
    if (memo.has(mask)) return memo.get(mask);
    let best = { value: 0, melds: [] };
    for (const cand of candidates) {
      if ((cand.mask & mask) === cand.mask) {
        const rest = solve(mask & ~cand.mask);
        const total = rest.value + cand.value;
        if (total > best.value) {
          best = { value: total, melds: [cand, ...rest.melds] };
        }
      }
    }
    memo.set(mask, best);
    return best;
  }

  const best = solve(fullMask);
  const meldedMask = best.melds.reduce((m, c) => m | c.mask, 0);
  const meldedCards = cards.filter((_, idx) => (meldedMask & (1 << idx)) !== 0);
  const unmeldedCards = cards.filter((_, idx) => (meldedMask & (1 << idx)) === 0);
  return { melds: best.melds, meldedCards, unmeldedCards };
}

// Representative set of hypothetical cards used to probe "what single extra
// card would complete this hand". Only suit/rank matter for validity, so one
// representative per suit+rank plus one generic joker is sufficient.
function representativeCardPool() {
  const pool = [];
  const suits = ['S', 'H', 'D', 'C'];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      pool.push({ id: `probe-${suit}-${rank}`, suit, rank, isJoker: false });
    }
  }
  pool.push({ id: 'probe-joker', suit: null, rank: null, isJoker: true });
  return pool;
}

const PROBE_POOL = representativeCardPool();

// A resting hand (7 cards) is "Ceki-eligible" if, after drawing one more
// (hypothetical) card, there exists a single card to discard such that the
// remaining 7 cards form a perfect meld partition.
function isOneCardAwayFromClosed(hand) {
  // Case A: the hand already perfectly partitions -- drawing any card and
  // immediately discarding it back would close.
  if (findPerfectPartition(hand)) return true;

  // Case B: removing one of the current cards and adding some hypothetical
  // drawn card completes a perfect partition.
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.slice(0, i).concat(hand.slice(i + 1));
    for (const probe of PROBE_POOL) {
      if (findPerfectPartition([...rest, probe])) return true;
    }
  }
  return false;
}

// Given a hand (e.g. 8 cards after drawing/taking the needed card), finds a
// single non-joker card to set aside (the tutupan, discarded) such that the
// remaining cards form a perfect meld partition. Returns { leftover, melds }
// or null. Jokers can never be the leftover (they can't be discarded).
//
// excludeLeftoverId: if given, that card may NOT be the leftover -- used to
// require that a specific card (e.g. one just taken from the discard pile for
// a ceburan) is actually USED inside a meld rather than immediately set aside.
function findClosablePartition(cards, excludeLeftoverId) {
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].isJoker) continue;
    if (excludeLeftoverId && cards[i].id === excludeLeftoverId) continue;
    const rest = cards.slice(0, i).concat(cards.slice(i + 1));
    const melds = findPerfectPartition(rest);
    if (melds) return { leftover: cards[i], melds };
  }
  return null;
}

module.exports = {
  validateMeld,
  canFormMeldWithCard,
  findPerfectPartition,
  findClosablePartition,
  bestMeldedSubset,
  findAllCandidateMelds,
  isOneCardAwayFromClosed,
};
