import { useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card';
import { bestMeldedSubset, validateMeld } from '../../shared/combinations';
import { cardValue } from '../../shared/cardUtils';

const DRAG_THRESHOLD = 8; // px of movement before a press counts as a drag, not a tap
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };

function meldCardRank(card, meld) {
  if (!card.isJoker) return card.rank;
  const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
  return assign ? assign.rank : 0;
}

function meldCardSuit(card, meld) {
  if (!card.isJoker) return card.suit;
  const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
  return assign ? assign.suit : null;
}

function normalValue(card, meld) {
  if (card.isJoker) {
    const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
    return cardValue(card, 'normal', assign.rank);
  }
  return cardValue(card, 'normal');
}

// bestMeldedSubset is exponential, so cache its result per leftover-card set
// (keyed on ids, order-independent) -- during a drag computeMeldGroups reruns
// on every pointermove but the leftover set rarely changes frame to frame.
const scatteredMemo = new Map();
function scatteredMelds(leftover) {
  if (leftover.length < 3) return [];
  const key = leftover.map((c) => c.id).slice().sort().join(',');
  if (scatteredMemo.has(key)) return scatteredMemo.get(key);
  const { melds } = bestMeldedSubset(leftover, normalValue);
  const ids = melds.map((m) => m.cards.map((c) => c.id));
  scatteredMemo.set(key, ids);
  return ids;
}

// Maps each card in a valid run/set to its group index, in two passes:
//   1. Adjacency: the longest ADJACENT valid meld from each position is locked
//      in, so a manual arrangement decides ambiguous cases (e.g. a joker
//      between two 9s reads as 9-9-9, but 7-🃏-9 of one suit reads as a run).
//   2. Leftovers: any still-scattered meld is found via bestMeldedSubset, so a
//      meld you never lined up is still highlighted where it sits.
function computeMeldGroups(orderedCards) {
  const groups = [];
  const used = new Set();

  let i = 0;
  while (i < orderedCards.length) {
    let matched = null;
    for (let end = orderedCards.length - 1; end >= i + 2; end--) {
      const window = orderedCards.slice(i, end + 1);
      if (validateMeld(window)) {
        matched = window;
        break;
      }
    }
    if (matched) {
      groups.push(matched.map((c) => c.id));
      matched.forEach((c) => used.add(c.id));
      i += matched.length;
    } else {
      i += 1;
    }
  }

  const leftover = orderedCards.filter((c) => !used.has(c.id));
  for (const ids of scatteredMelds(leftover)) groups.push(ids);

  const byCardId = {};
  groups.forEach((ids, gi) => ids.forEach((id) => { byCardId[id] = gi; }));
  return byCardId;
}

// Groups cards that already form a valid run/set together (in rank order),
// then appends any leftover cards sorted by rank then suit. Jokers holding
// no meld go last since they're wildcards with no fixed identity.
function computeSortedOrder(cards) {
  const { melds, unmeldedCards } = bestMeldedSubset(cards, normalValue);

  const groups = melds.map((m) => {
    const sortedCards = [...m.cards].sort((a, b) => {
      const rankDiff = meldCardRank(a, m.meld) - meldCardRank(b, m.meld);
      if (rankDiff !== 0) return rankDiff;
      return (SUIT_ORDER[meldCardSuit(a, m.meld)] ?? 9) - (SUIT_ORDER[meldCardSuit(b, m.meld)] ?? 9);
    });
    return { minRank: Math.min(...sortedCards.map((c) => meldCardRank(c, m.meld))), cards: sortedCards };
  });
  groups.sort((a, b) => a.minRank - b.minRank);

  const leftover = [...unmeldedCards].sort((a, b) => {
    const rankA = a.isJoker ? 14 : a.rank;
    const rankB = b.isJoker ? 14 : b.rank;
    if (rankA !== rankB) return rankA - rankB;
    return (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9);
  });

  return [...groups.flatMap((g) => g.cards), ...leftover].map((c) => c.id);
}

// mode 'discard': single-select, tap toggles selectedCardId (for discarding)
// mode 'support': multi-select, tap toggles membership in selectedIds (for
// picking cards that support a meld being taken from the discard pile)
//
// Reordering and tap-to-select both ride on the same pointer event stream
// (rather than a separate native onClick) so that pointer capture used for
// dragging doesn't swallow/duplicate the tap gesture.
export default function Hand({ cards, mode = 'discard', selectedCardId, onSelectCard, selectedIds, onToggleId }) {
  const [order, setOrder] = useState(cards.map((c) => c.id));
  const [draggingId, setDraggingId] = useState(null);
  const dragState = useRef({ id: null, startX: 0, startY: 0, moved: false });

  useEffect(() => {
    setOrder((prev) => {
      const currentIds = cards.map((c) => c.id);
      const kept = prev.filter((id) => currentIds.includes(id));
      const added = currentIds.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [cards]);

  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const orderedCards = order.map((id) => byId[id]).filter(Boolean);

  // Keyed on the arrangement, since adjacency now decides ambiguous melds. The
  // expensive scattered-meld search is cached separately (scatteredMemo), so
  // re-running this per pointermove during a drag stays cheap.
  const orderKey = orderedCards.map((c) => c.id).join(',');
  const meldGroupByCardId = useMemo(() => computeMeldGroups(orderedCards), [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // True when the card at this position touches another card of the same meld,
  // i.e. the meld reads as a block here rather than being scattered by a drag.
  function isGrouped(index) {
    const group = meldGroupByCardId[orderedCards[index]?.id];
    if (group === undefined) return false;
    const prev = index > 0 ? meldGroupByCardId[orderedCards[index - 1].id] : undefined;
    const next = index < orderedCards.length - 1 ? meldGroupByCardId[orderedCards[index + 1].id] : undefined;
    return group === prev || group === next;
  }

  function handlePointerDown(e, cardId) {
    dragState.current = { id: cardId, startX: e.clientX, startY: e.clientY, moved: false };
    setDraggingId(cardId);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    const state = dragState.current;
    if (!state.id) return;
    if (!state.moved) {
      const dx = Math.abs(e.clientX - state.startX);
      const dy = Math.abs(e.clientY - state.startY);
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
      state.moved = true;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = target && target.closest('[data-card-id]');
    if (!wrapper) return;
    const overId = wrapper.getAttribute('data-card-id');
    if (overId === state.id) return;
    setOrder((prev) => {
      const from = prev.indexOf(state.id);
      const to = prev.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, state.id);
      return next;
    });
  }

  function handlePointerUp(e, cardId) {
    const state = dragState.current;
    const wasTap = state.id === cardId && !state.moved;
    dragState.current = { id: null, startX: 0, startY: 0, moved: false };
    setDraggingId(null);
    if (wasTap) {
      if (mode === 'support') onToggleId(cardId);
      else onSelectCard(cardId);
    }
  }

  function handlePointerCancel() {
    dragState.current = { id: null, startX: 0, startY: 0, moved: false };
    setDraggingId(null);
  }

  function handleSort() {
    setOrder(computeSortedOrder(cards));
  }

  return (
    <div className="w-full overflow-x-auto no-scrollbar">
      {mode === 'discard' && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={handleSort}
            className="text-[0.65rem] bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full border border-white/20"
          >
            Urutkan
          </button>
        </div>
      )}
      <div className="flex px-3 py-4 justify-center min-w-max mx-auto">
        {orderedCards.map((card, index) => {
          const isSelected = mode === 'support' ? selectedIds?.includes(card.id) : selectedCardId === card.id;
          const isDragging = draggingId === card.id;

          const meldGroup = meldGroupByCardId[card.id];
          const inMeld = meldGroup !== undefined;
          const prevMeldGroup = index === 0 ? undefined : meldGroupByCardId[orderedCards[index - 1].id];
          // A gap is only worth spending width on where a meld actually sits
          // together, so it takes a card on one side that has a same-meld
          // neighbour. A manual arrangement that scatters a meld stays compact
          // and reads through the lift and ring instead, which work anywhere.
          const startsGroup =
            index > 0 && meldGroup !== prevMeldGroup && (isGrouped(index - 1) || isGrouped(index));
          const overlapClass = index === 0 ? '' : startsGroup ? '-ml-4 sm:-ml-5' : '-ml-10 sm:-ml-11';

          return (
            <div
              key={card.id}
              data-card-id={card.id}
              className={`touch-none transition-transform ${overlapClass} ${inMeld ? '-translate-y-2' : ''}`}
              style={{ zIndex: isDragging ? 100 : isSelected ? 60 : index }}
              onPointerDown={(e) => handlePointerDown(e, card.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, card.id)}
              onPointerCancel={handlePointerCancel}
            >
              <Card card={card} selected={isSelected} melded={inMeld} interactive />
            </div>
          );
        })}
      </div>
    </div>
  );
}
