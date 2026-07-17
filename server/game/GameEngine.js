const { createDeck, shuffle, cardValue } = require('../../shared/cardUtils');
const {
  findPerfectPartition,
  findClosablePartition,
  validateMeld,
  bestMeldedSubset,
  isOneCardAwayFromClosed,
} = require('../../shared/combinations');
const { HAND_SIZE, MAX_DISCARD_TAKE } = require('../../shared/constants');

// Computes the total normal-tariff value of a set of melds, correctly
// impersonating jokers as the rank they represent within their meld.
function meldsNormalValue(melds) {
  let total = 0;
  for (const { cards, meld } of melds) {
    for (const card of cards) {
      if (card.isJoker) {
        const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
        total += cardValue(card, 'normal', assign.rank);
      } else {
        total += cardValue(card, 'normal');
      }
    }
  }
  return total;
}

/**
 * GameEngine represents a single round (deal) of Ceki for a fixed set of
 * seated players. A new instance is created for every round; cumulative
 * scoring across rounds is handled by RoomManager.
 *
 * Melds taken from the discard pile are laid face-up on the table
 * (`tableMelds`, visible to everyone) and leave the player's hand for good.
 * Melds a player merely holds in their hand (from deck draws) stay private
 * and are only revealed/scored when the round ends.
 */
class GameEngine {
  // startPlayerId (optional) sets which seat takes the first turn; the
  // rotation order still follows `playerIds`. Defaults to the first seat.
  constructor(playerIds, startPlayerId) {
    this.playerIds = playerIds; // seat order
    this.hands = new Map(); // playerId -> Card[] (loose, private cards)
    this.tableMelds = new Map(); // playerId -> [{ id, cards, meld }] (public, laid down)
    this.ceki = new Map(); // playerId -> boolean
    this.cekiEligible = new Map(); // playerId -> boolean
    // A player's first discard-pile meld each round must be a run, unless it
    // contains an Ace (Aces are exempt and also count as satisfying this
    // requirement). Once true, that player may take set melds freely too.
    this.discardMeldUnlocked = new Map(); // playerId -> boolean
    const startIdx = startPlayerId ? playerIds.indexOf(startPlayerId) : 0;
    this.turnIndex = startIdx === -1 ? 0 : startIdx;
    this.hasDrawnThisTurn = false;
    this.status = 'playing'; // 'playing' | 'ended'
    this.endReason = null; // 'closed-tutupan' | 'closed-ceburan' | 'closed-meja' | 'deck-empty' | 'joker-discarded'
    this.result = null; // populated when status === 'ended'

    const deck = shuffle(createDeck());
    for (const id of playerIds) {
      this.ceki.set(id, false);
      this.cekiEligible.set(id, false);
      this.discardMeldUnlocked.set(id, false);
      this.hands.set(id, deck.splice(0, HAND_SIZE));
      this.tableMelds.set(id, []);
    }
    this.drawPile = deck; // remaining cards
    this.discardPile = [];
    this.discardBy = new Map(); // cardId -> playerId who discarded it (for kejebur penalty)
  }

  currentPlayerId() {
    return this.playerIds[this.turnIndex];
  }

  isPlayersTurn(playerId) {
    return this.status === 'playing' && this.currentPlayerId() === playerId;
  }

  getHand(playerId) {
    return this.hands.get(playerId) || [];
  }

  topDiscard() {
    return this.discardPile.length ? this.discardPile[this.discardPile.length - 1] : null;
  }

  assertPlaying() {
    if (this.status !== 'playing') throw new GameError('Round has already ended');
  }

  // --- Turn actions -------------------------------------------------

  drawFromDeck(playerId) {
    this.assertPlaying();
    if (!this.isPlayersTurn(playerId)) throw new GameError('Not your turn');
    if (this.hasDrawnThisTurn) throw new GameError('You already drew this turn');

    if (this.drawPile.length === 0) {
      return this._endDeckEmpty();
    }

    const card = this.drawPile.pop();
    this.getHand(playerId).push(card);
    this.hasDrawnThisTurn = true;
    return { type: 'card-drawn', card, drawPileCount: this.drawPile.length };
  }

  // Takes cards from the top of the discard pile down to (and including) the
  // "needed" card (can't skip -- everything above it comes along too), then
  // combines that needed card with player-chosen supporting cards into a
  // valid meld laid face-up on the table. Supporting cards can come from the
  // player's hand AND/OR from the other cards swept up in the same take
  // (e.g. taking 7 cards deep to reach a 6, where a second 6 sits higher up
  // in that same slice can be folded straight into the resulting set).
  // Any taken cards left unused land in the player's loose hand.
  meldFromDiscard(playerId, count, supportingCardIds) {
    this.assertPlaying();
    if (!this.isPlayersTurn(playerId)) throw new GameError('Not your turn');
    if (this.hasDrawnThisTurn) throw new GameError('You already drew this turn');
    if (!Number.isInteger(count) || count < 1 || count > MAX_DISCARD_TAKE) {
      throw new GameError('Invalid take count');
    }
    if (count > this.discardPile.length) throw new GameError('Not enough cards in discard pile');
    if (!Array.isArray(supportingCardIds) || supportingCardIds.length < 2) {
      throw new GameError('Pilih minimal 2 kartu pendukung');
    }
    if (new Set(supportingCardIds).size !== supportingCardIds.length) {
      throw new GameError('Kartu pendukung duplikat');
    }

    const hand = this.getHand(playerId);
    const pileSlice = this.discardPile.slice(this.discardPile.length - count, this.discardPile.length);
    const neededCard = pileSlice[0]; // deepest card in the taken slice
    const pilePool = pileSlice.slice(1); // other cards swept up alongside it

    if (supportingCardIds.includes(neededCard.id)) {
      throw new GameError('Kartu yang dibutuhkan otomatis ikut, tidak perlu dipilih');
    }

    const supportingCards = [];
    for (const id of supportingCardIds) {
      const card = hand.find((c) => c.id === id) || pilePool.find((c) => c.id === id);
      if (!card) throw new GameError('Kartu pendukung tidak valid');
      supportingCards.push(card);
    }

    const meld = validateMeld([neededCard, ...supportingCards]);
    if (!meld) throw new GameError('Kombinasi tidak valid');

    const isAceSet = meld.type === 'set' && meld.rank === 1;
    if (meld.type === 'set' && !isAceSet && !this.discardMeldUnlocked.get(playerId)) {
      throw new GameError(
        'Pengambilan pertamamu dari discard pile harus berupa run (kartu berurutan), kecuali kombinasi As'
      );
    }

    const usedFromHand = supportingCards.filter((c) => hand.includes(c));
    const usedFromPile = new Set(supportingCards.filter((c) => pilePool.includes(c)));
    const unusedPileExtras = pilePool.filter((c) => !usedFromPile.has(c));

    const resultingHandSize = hand.length - usedFromHand.length + unusedPileExtras.length;
    if (resultingHandSize < 1) {
      throw new GameError('Tidak bisa mengambil ini — tidak akan ada kartu tersisa untuk dibuang');
    }

    this.discardPile.splice(this.discardPile.length - count, count);
    for (const c of usedFromHand) {
      hand.splice(hand.indexOf(c), 1);
    }
    hand.push(...unusedPileExtras);

    const meldEntry = {
      id: `meld-${playerId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      cards: [neededCard, ...supportingCards],
      meld,
    };
    this.tableMelds.get(playerId).push(meldEntry);
    this.hasDrawnThisTurn = true;

    if (meld.type === 'run' || isAceSet) {
      this.discardMeldUnlocked.set(playerId, true);
    }

    return {
      type: 'meld-formed',
      meld: meldEntry,
      extras: unusedPileExtras,
      discardPileCount: this.discardPile.length,
    };
  }

  discardCard(playerId, cardId) {
    this.assertPlaying();
    if (!this.isPlayersTurn(playerId)) throw new GameError('Not your turn');
    if (!this.hasDrawnThisTurn) throw new GameError('You must draw before discarding');

    const hand = this.getHand(playerId);
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new GameError('Card not in hand');
    const card = hand[idx];

    if (card.isJoker) {
      // Discarding a joker is forbidden; if it somehow happens, the round
      // voids immediately per the house rules.
      hand.splice(idx, 1);
      this.discardPile.push(card);
      this.status = 'ended';
      this.endReason = 'joker-discarded';
      this.result = { reason: 'joker-discarded', voidedBy: playerId, scores: {} };
      return { type: 'round-ended', result: this.result };
    }

    hand.splice(idx, 1);
    this.discardPile.push(card);
    this.discardBy.set(card.id, playerId);
    this.hasDrawnThisTurn = false;

    // A player who has melded every card to the table and just discarded
    // their last loose card goes out immediately (no Ceki needed for this
    // path -- it falls naturally out of the table-melding mechanic).
    if (hand.length === 0) {
      this.status = 'ended';
      this.endReason = 'closed-meja';
      this.result = this._buildEmptyHandCloseResult(playerId);
      return { type: 'round-ended', result: this.result };
    }

    // Recompute Ceki eligibility for the discarding player on their resting hand.
    const eligible = isOneCardAwayFromClosed(hand);
    this.cekiEligible.set(playerId, eligible);
    if (!eligible) this.ceki.set(playerId, false);

    this._advanceTurn();

    // If the draw pile is exhausted, the next player has nothing to draw, so
    // the round ends here and scores are tallied (scenario 3: deck habis).
    if (this.drawPile.length === 0) {
      return this._endDeckEmpty();
    }

    return {
      type: 'card-discarded',
      card,
      discardPileCount: this.discardPile.length,
      cekiEligible: eligible,
      nextPlayerId: this.currentPlayerId(),
    };
  }

  announceCeki(playerId) {
    this.assertPlaying();
    if (!this.cekiEligible.get(playerId)) {
      throw new GameError('You are not eligible to announce Ceki yet');
    }
    this.ceki.set(playerId, true);
    return { type: 'ceki-announced', playerId };
  }

  // --- Closing the round ---------------------------------------------

  // Tutupan close: after drawing, the player picks one card to discard; if the
  // remaining cards form a perfect meld partition, the round closes and the
  // discarded card is the tutupan (high tariff). This is the natural
  // "draw then close by discarding the leftover" flow.
  closeWithLeftover(playerId, cardId) {
    this.assertPlaying();
    if (!this.isPlayersTurn(playerId)) throw new GameError('Not your turn');
    if (!this.hasDrawnThisTurn) throw new GameError('You must draw before closing');
    if (!this.ceki.get(playerId)) throw new GameError('You have not announced Ceki');

    const hand = this.getHand(playerId);
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new GameError('Card not in hand');
    const leftover = hand[idx];
    if (leftover.isJoker) throw new GameError('Joker tidak bisa dibuang');

    const rest = hand.slice(0, idx).concat(hand.slice(idx + 1));
    const melds = findPerfectPartition(rest);
    if (!melds) throw new GameError('Membuang kartu ini tidak menutup tanganmu');

    this.discardPile.push(leftover);
    this.hands.set(playerId, rest);
    const table = this.tableMelds.get(playerId) || [];
    const score = meldsNormalValue(table) + meldsNormalValue(melds) + cardValue(leftover, 'high');

    this.status = 'ended';
    this.endReason = 'closed-tutupan';
    this.result = this._buildRoundEndResult(playerId, score, {
      method: 'tutupan',
      tutupanCard: leftover,
      tableMelds: table,
      melds,
    });
    return { type: 'round-ended', result: this.result };
  }

  // source: 'deck' (scenario 1, own turn, blind draw) | 'discard' (scenario 2,
  // kejebur interrupt, or claiming the current discard top on your own turn)
  closeCard(playerId, source) {
    this.assertPlaying();
    if (!this.ceki.get(playerId)) throw new GameError('You have not announced Ceki');

    if (source === 'deck') {
      if (!this.isPlayersTurn(playerId)) throw new GameError('Not your turn');
      if (this.hasDrawnThisTurn) throw new GameError('You already drew this turn');
      if (this.drawPile.length === 0) return this._endDeckEmpty();

      const drawn = this.drawPile.pop();
      const hand = this.getHand(playerId);
      const trialHand = [...hand, drawn];

      const attempt = this._findClosablePartition(trialHand);
      if (!attempt) {
        // Doesn't actually close -- keep the drawn card, continue turn normally.
        hand.push(drawn);
        this.hasDrawnThisTurn = true;
        return { type: 'close-failed', card: drawn };
      }

      const { leftover, melds } = attempt;
      this.hands.set(playerId, melds.flatMap((m) => m.cards));
      const table = this.tableMelds.get(playerId) || [];
      const score = meldsNormalValue(table) + meldsNormalValue(melds) + cardValue(leftover, 'high');

      this.status = 'ended';
      this.endReason = 'closed-tutupan';
      this.result = this._buildRoundEndResult(playerId, score, {
        method: 'tutupan',
        tutupanCard: leftover,
        tableMelds: table,
        melds,
      });
      return { type: 'round-ended', result: this.result };
    }

    if (source === 'discard') {
      // Kejebur only reaches the immediately-preceding player's discard: that
      // card is the top of the pile exactly during your own turn, so a ceburan
      // is only allowed on your turn (no jumping ahead of the player between
      // you and the discarder).
      if (!this.isPlayersTurn(playerId)) throw new GameError('Ceburan hanya boleh saat giliranmu');
      if (this.discardPile.length === 0) throw new GameError('Discard pile is empty');
      const hand = this.getHand(playerId);
      const neededCard = this.topDiscard();
      const trialHand = [...hand, neededCard];
      const table = this.tableMelds.get(playerId) || [];

      // A ceburan is only valid if the taken card is actually USED in a meld
      // (not just picked up and set aside again). Prefer closing with a
      // leftover (tutupan, high tariff) whose leftover is some OTHER card, so
      // the taken card is folded into a meld at the normal tariff.
      const closable = findClosablePartition(trialHand, neededCard.id);
      if (closable) {
        this.discardPile.pop();
        this.hands.set(playerId, closable.melds.flatMap((m) => m.cards));
        const score =
          meldsNormalValue(table) + meldsNormalValue(closable.melds) + cardValue(closable.leftover, 'high');
        this.status = 'ended';
        this.endReason = 'closed-ceburan';
        this.result = this._buildRoundEndResult(playerId, score, {
          method: 'ceburan',
          ceburanCard: neededCard,
          tutupanCard: closable.leftover,
          tableMelds: table,
          melds: closable.melds,
        });
        return { type: 'round-ended', result: this.result };
      }

      // A ceburan must leave exactly one card to set aside as the tutupan --
      // the discard rule always requires discarding a card, so there is no
      // valid "close with nothing left to discard". If the taken card would
      // meld every card with no leftover, reject it; the player can still close
      // via the deck (draw a card and discard it as the tutupan) instead.
      if (findPerfectPartition(trialHand)) {
        throw new GameError('Ceburan harus menyisakan 1 kartu tutupan — tutup lewat deck saja');
      }
      throw new GameError('Kartu itu tidak bisa menutup kartumu');
    }

    throw new GameError('Invalid close source');
  }

  // Finds a card to set aside (leftover) such that the rest perfectly
  // partitions into melds. Jokers are never valid leftovers (can't discard).
  _findClosablePartition(cards) {
    for (let i = 0; i < cards.length; i++) {
      const candidate = cards[i];
      if (candidate.isJoker) continue;
      const rest = cards.slice(0, i).concat(cards.slice(i + 1));
      const melds = findPerfectPartition(rest);
      if (melds) return { leftover: candidate, melds };
    }
    return null;
  }

  // Scores a player's current loose hand (not counting table melds) using
  // the best achievable meld coverage: melded cards score positive, leftover
  // cards score negative, both at the normal tariff.
  _scoreLooseHand(hand) {
    const { melds, meldedCards, unmeldedCards } = bestMeldedSubset(hand, (card, meld) => {
      if (card.isJoker) {
        const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
        return cardValue(card, 'normal', assign.rank);
      }
      return cardValue(card, 'normal');
    });
    const positive = meldsNormalValue(melds);
    const negative = unmeldedCards.reduce((sum, c) => sum + cardValue(c, 'normal'), 0);
    return { melds, meldedCards, unmeldedCards, positive, negative };
  }

  // Full score for a non-closing player: table melds (already banked) plus
  // whatever their remaining loose hand nets out to.
  _scoreRestingPlayer(id) {
    const table = this.tableMelds.get(id) || [];
    const tableValue = meldsNormalValue(table);
    const loose = this._scoreLooseHand(this.getHand(id));
    const score = tableValue + loose.positive - loose.negative;
    const detail = {
      tableMelds: table,
      melds: loose.melds,
      meldedCards: loose.meldedCards,
      unmeldedCards: loose.unmeldedCards,
    };
    return { score, detail };
  }

  _endDeckEmpty() {
    this.status = 'ended';
    this.endReason = 'deck-empty';
    const scores = {};
    const details = {};
    for (const id of this.playerIds) {
      const { score, detail } = this._scoreRestingPlayer(id);
      scores[id] = score;
      details[id] = detail;
    }
    this.result = { reason: 'deck-empty', scores, details };
    return { type: 'round-ended', result: this.result };
  }

  _buildRoundEndResult(closerId, closerScore, closerDetail) {
    const scores = { [closerId]: closerScore };
    const details = { [closerId]: closerDetail };
    for (const id of this.playerIds) {
      if (id === closerId) continue;
      const { score, detail } = this._scoreRestingPlayer(id);
      scores[id] = score;
      details[id] = detail;
    }

    // Kejebur penalty: on a ceburan close, the player who discarded the claimed
    // card pays the closer's high tutupan value, added on top of their own hand
    // score. The closer's score is unchanged (they already banked the tutupan).
    // A ceburan that closed with no leftover has no tutupan, so no penalty.
    if (closerDetail.method === 'ceburan' && closerDetail.tutupanCard && closerDetail.ceburanCard) {
      const victimId = this.discardBy.get(closerDetail.ceburanCard.id);
      if (victimId && victimId !== closerId && scores[victimId] !== undefined) {
        const penalty = cardValue(closerDetail.tutupanCard, 'high');
        scores[victimId] -= penalty;
        details[victimId] = { ...details[victimId], kejeburPenalty: penalty };
      }
    }

    return { reason: closerDetail.method === 'tutupan' ? 'closed-tutupan' : 'closed-ceburan', closerId, scores, details };
  }

  _buildEmptyHandCloseResult(closerId) {
    const table = this.tableMelds.get(closerId) || [];
    const scores = { [closerId]: meldsNormalValue(table) };
    const details = {
      [closerId]: { method: 'meja', tableMelds: table, melds: [], meldedCards: [], unmeldedCards: [] },
    };
    for (const id of this.playerIds) {
      if (id === closerId) continue;
      const { score, detail } = this._scoreRestingPlayer(id);
      scores[id] = score;
      details[id] = detail;
    }
    return { reason: 'closed-meja', closerId, scores, details };
  }

  _advanceTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.playerIds.length;
  }

  // Serializable state for a given viewer (hides other players' hands; table
  // melds are public and sent in full to everyone).
  toClientState(viewerId) {
    return {
      status: this.status,
      endReason: this.endReason,
      result: this.result,
      turnPlayerId: this.status === 'playing' ? this.currentPlayerId() : null,
      hasDrawnThisTurn: this.hasDrawnThisTurn,
      drawPileCount: this.drawPile.length,
      discardPile: this.discardPile,
      ceki: Object.fromEntries(this.ceki),
      cekiEligible: { [viewerId]: this.cekiEligible.get(viewerId) || false },
      discardMeldUnlocked: { [viewerId]: this.discardMeldUnlocked.get(viewerId) || false },
      myHand: this.getHand(viewerId),
      handCounts: Object.fromEntries(this.playerIds.map((id) => [id, this.getHand(id).length])),
      tableMelds: Object.fromEntries(this.playerIds.map((id) => [id, this.tableMelds.get(id) || []])),
    };
  }
}

class GameError extends Error {}

module.exports = { GameEngine, GameError };
