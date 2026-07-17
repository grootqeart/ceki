import { SUIT_SYMBOLS, SUIT_COLORS, RANK_LABELS } from '../../shared/constants';

function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

// Classic French-deck pip positions as [xPercent, yPercent] within the card
// face. Pips in the lower half are drawn upside-down (like real cards).
const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[50, 16], [50, 84]],
  3: [[50, 16], [50, 50], [50, 84]],
  4: [[30, 16], [70, 16], [30, 84], [70, 84]],
  5: [[30, 16], [70, 16], [50, 50], [30, 84], [70, 84]],
  6: [[30, 16], [70, 16], [30, 50], [70, 50], [30, 84], [70, 84]],
  7: [[30, 16], [70, 16], [50, 33], [30, 50], [70, 50], [30, 84], [70, 84]],
  8: [[30, 16], [70, 16], [50, 33], [30, 50], [70, 50], [50, 67], [30, 84], [70, 84]],
  9: [[30, 16], [70, 16], [30, 39], [70, 39], [50, 50], [30, 61], [70, 61], [30, 84], [70, 84]],
  10: [[30, 16], [70, 16], [50, 28], [30, 39], [70, 39], [30, 61], [70, 61], [50, 72], [30, 84], [70, 84]],
};

// Court cards get a figure glyph so they read as a "picture" card, not a number.
const COURT_GLYPH = { 11: '♞', 12: '♛', 13: '♚' };

export default function Card({ card, faceDown, selected, melded, small, dimmed, landscape, onClick, interactive, style }) {
  const isInteractive = interactive ?? Boolean(onClick);
  const baseClasses =
    'relative select-none rounded-lg border shadow-md flex items-center justify-center font-bold transition-transform duration-150';
  const sizeClasses = small
    ? 'w-11 h-16 text-sm'
    : 'w-[4.75rem] h-28 text-2xl sm:w-24 sm:h-36';
  const opacityClass = dimmed ? 'opacity-40' : '';

  if (faceDown) {
    // Landscape backs are used for the side seats so their cards face inward
    // toward the deck (like a player sitting on the left/right of the table).
    const backSize = landscape ? 'w-16 h-11' : sizeClasses;
    return (
      <div
        className={`${baseClasses} ${backSize} ${opacityClass} bg-gradient-to-br from-red-700 to-red-900 border-red-950 flex-shrink-0`}
        style={style}
      />
    );
  }

  if (!card) {
    return (
      <div
        className={`${baseClasses} ${sizeClasses} border-dashed border-white/30 bg-white/5 flex-shrink-0`}
        style={style}
      />
    );
  }

  const isJoker = card.isJoker;
  const color = isJoker ? 'purple' : SUIT_COLORS[card.suit];
  const colorClass = color === 'red' ? 'text-red-600' : color === 'purple' ? 'text-purple-600' : 'text-gray-900';
  const suit = SUIT_SYMBOLS[card.suit];
  const label = rankLabel(card.rank);

  // Selection (yellow) outranks the melded hint (sky) on the same card so the
  // card you are about to act on never looks ambiguous.
  const stateClasses = selected
    ? '-translate-y-3 ring-4 ring-yellow-400'
    : `${melded ? 'ring-2 ring-sky-400 ' : ''}${isInteractive ? 'hover:-translate-y-1' : ''}`;

  const cardBtn = (children) => (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${opacityClass} bg-white ${colorClass} flex-shrink-0 ${stateClasses} ${
        isInteractive ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={style}
    >
      {children}
    </button>
  );

  // Small cards (discard spiral, opponent melds, result modals) stay simple
  // and readable: corner index + one centered suit symbol.
  if (small) {
    return cardBtn(
      <>
        <span className="absolute top-0.5 left-1 flex flex-col items-center leading-none text-[0.6em]">
          <span>{isJoker ? '🃏' : label}</span>
          {!isJoker && <span>{suit}</span>}
        </span>
        {isJoker ? <span className="text-lg">🃏</span> : <span className="text-[1.15em] leading-none">{suit}</span>}
      </>
    );
  }

  // Full-size cards render a proper playing-card face: rank+suit indices in
  // opposite corners, and a center that is pips (2-10), a big pip (Ace), or a
  // figure glyph (J/Q/K) -- "picture and number", like a real card.
  const corner = (
    <span className="flex flex-col items-center leading-none">
      <span className="text-[0.5em] font-bold">{isJoker ? '🃏' : label}</span>
      {!isJoker && <span className="text-[0.5em] leading-none">{suit}</span>}
    </span>
  );

  let center;
  if (isJoker) {
    center = <span className="text-4xl">🃏</span>;
  } else if (card.rank >= 11) {
    center = (
      <span className="flex flex-col items-center leading-none">
        <span className="text-4xl sm:text-5xl">{COURT_GLYPH[card.rank]}</span>
        <span className="text-lg">{suit}</span>
      </span>
    );
  } else {
    const pips = PIP_LAYOUTS[card.rank] || [];
    center = (
      <div className="absolute inset-x-3 inset-y-2">
        {pips.map(([x, y], i) => (
          <span
            key={i}
            className={`absolute text-base sm:text-lg leading-none ${y > 50 ? 'rotate-180' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%)${y > 50 ? ' rotate(180deg)' : ''}` }}
          >
            {suit}
          </span>
        ))}
      </div>
    );
  }

  return cardBtn(
    <>
      <span className="absolute top-1 left-1.5">{corner}</span>
      <span className="absolute bottom-1 right-1.5 rotate-180">{corner}</span>
      {center}
    </>
  );
}
