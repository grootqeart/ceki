import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import { bestMeldedSubset } from '../../shared/combinations';
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

// Groups cards that already form a valid run/set together (in rank order),
// then appends any leftover cards sorted by rank then suit. Jokers holding
// no meld go last since they're wildcards with no fixed identity.
function computeSortedOrder(cards) {
  const { melds, unmeldedCards } = bestMeldedSubset(cards, (card, meld) => {
    if (card.isJoker) {
      const assign = meld.jokerAssignments.find((j) => j.jokerId === card.id);
      return cardValue(card, 'normal', assign.rank);
    }
    return cardValue(card, 'normal');
  });

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
          return (
            <div
              key={card.id}
              data-card-id={card.id}
              className={`touch-none ${index === 0 ? '' : '-ml-10 sm:-ml-11'}`}
              style={{ zIndex: isDragging ? 100 : isSelected ? 60 : index }}
              onPointerDown={(e) => handlePointerDown(e, card.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, card.id)}
              onPointerCancel={handlePointerCancel}
            >
              <Card card={card} selected={isSelected} interactive />
            </div>
          );
        })}
      </div>
    </div>
  );
}
