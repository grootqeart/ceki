import Card from './Card';

// compact: shows the remaining-card count as a small badge overlaid on the
// card itself instead of a text line below it (used inside TableCenter,
// where extra vertical space would collide with the discard spiral).
export default function DrawPile({ count, canDraw, onDraw, compact }) {
  return (
    <div className={compact ? 'relative' : 'flex flex-col items-center gap-1'}>
      <button
        type="button"
        disabled={!canDraw || count === 0}
        onClick={onDraw}
        className={`relative ${canDraw && count > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
      >
        <Card faceDown small={compact} />
      </button>
      {compact ? (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {count}
        </span>
      ) : (
        <span className="text-white/80 text-xs font-medium">{count} kartu</span>
      )}
    </div>
  );
}
