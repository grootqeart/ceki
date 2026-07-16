import Card from './Card';

const MAX_FANNED = 6; // cap how many back-cards we actually render in the fan

// orientation: 'horizontal' (top seat) fans the card backs sideways;
// 'vertical' (left/right seats) stacks them downward so the seat stays narrow
// and fits beside the table on a phone screen.
export default function OpponentArea({ player, cardCount, isTurn, ceki, connected, orientation = 'horizontal' }) {
  const shown = Math.min(cardCount, MAX_FANNED);
  const vertical = orientation === 'vertical';

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-2xl ${vertical ? 'px-2 py-2' : 'px-4 py-2.5'} ${
        isTurn ? 'bg-white/20 ring-2 ring-yellow-400 shadow-lg' : 'bg-white/5'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
        <span className={`text-white font-semibold truncate ${vertical ? 'text-xs max-w-[4.5rem]' : 'text-sm max-w-[7rem]'}`}>
          {player.name}
        </span>
        {ceki && (
          <span className="text-[0.5rem] bg-yellow-400 text-feltDark font-bold px-1 py-0.5 rounded-full animate-pulse">
            CEKI
          </span>
        )}
      </div>

      {vertical ? (
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-col -space-y-7">
            {Array.from({ length: shown }).map((_, i) => (
              <Card key={i} faceDown landscape />
            ))}
          </div>
          <span className="text-white/80 text-xs font-semibold">{cardCount}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-7">
            {Array.from({ length: shown }).map((_, i) => (
              <Card key={i} faceDown small />
            ))}
          </div>
          <span className="text-white/80 text-xs font-semibold">{cardCount}</span>
        </div>
      )}
    </div>
  );
}
