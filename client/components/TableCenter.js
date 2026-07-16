import Card from './Card';
import DrawPile from './DrawPile';
import { MAX_DISCARD_TAKE } from '../../shared/constants';

// The discard pile is laid out as one continuous rectangular spiral around the
// deck (per the user's spec): the first cards form the top row (5), then turn
// down the right side (2), across the bottom (6), up the left (3), then a
// wider top row (7), and so on -- each lap's arms grow by one, spiralling
// outward so the newest discard is always on the outermost edge. The deck sits
// in the fixed hole cell (2,1), which this spiral never occupies.
const CARD_SCALE = 0.9; // discard cards render a bit smaller than a hand card
const CARD_W = 44 * CARD_SCALE; // ~39.6
const CARD_H = 64 * CARD_SCALE; // ~57.6
const STEP_X = CARD_W + 5; // horizontal spacing between packed cards
const STEP_Y = 66; // vertical spacing (extra so the deck fits between rows)
const DECK_SCALE = 1; // deck renders at the small-card size
const DECK_COL = 2; // fixed grid cell the deck occupies (always empty in this spiral)
const DECK_ROW = 1;

const DIRS = [
  [1, 0], // right
  [0, 1], // down
  [-1, 0], // left
  [0, -1], // up
];
const FIRST_H = 5; // first top row = 5 cards, each later horizontal arm +1
const FIRST_V = 2; // first vertical arm = 2 cards, each later vertical arm +1

// Grid cells (col,row) for `count` cards walked as a rectangular spiral.
function spiralCells(count) {
  const cells = [];
  let x = 0;
  let y = 0;
  let k = 0;
  while (cells.length < count) {
    const [dx, dy] = DIRS[k % 4];
    const isHorizontal = k % 2 === 0;
    const segLen = (isHorizontal ? FIRST_H : FIRST_V) + Math.floor(k / 2);
    for (let s = 0; s < segLen && cells.length < count; s++) {
      cells.push({ col: x, row: y });
      x += dx;
      y += dy;
    }
    k++;
  }
  return cells;
}

// canPick: true when the player may tap a pile card to start a take.
// pendingCount: set once a take is in progress -- the depth-from-top of the
// "needed" card. Cards strictly shallower than that (swept up along the way)
// become selectable support candidates via onToggleId; the needed card
// itself is always auto-included.
export default function TableCenter({
  pile,
  canPick,
  onPickDepth,
  pendingCount,
  selectedIds,
  onToggleId,
  drawPileCount,
  canDrawDeck,
  onDrawDeck,
}) {
  const picking = pendingCount != null;

  // Spiral cells, shifted so the deck's hole cell (2,1) sits at the stage
  // center (0,0). The stage is sized to the spiral's bounding box so it stays
  // compact for a small pile and only grows outward as cards accumulate.
  const cells = spiralCells(pile.length);
  const positions = cells.map((c) => ({ x: (c.col - DECK_COL) * STEP_X, y: (c.row - DECK_ROW) * STEP_Y }));
  const maxAbsX = positions.reduce((m, p) => Math.max(m, Math.abs(p.x)), STEP_X);
  const maxAbsY = positions.reduce((m, p) => Math.max(m, Math.abs(p.y)), STEP_Y);
  const halfW = maxAbsX + CARD_W / 2 + 8;
  const halfH = maxAbsY + CARD_H / 2 + 8;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="bg-black/40 text-white/90 text-xs font-medium px-3 py-0.5 rounded-full">
        Buangan ({pile.length})
      </span>

      <div className="relative" style={{ width: halfW * 2, height: halfH * 2 }}>
        <div
          className="absolute top-1/2 left-1/2"
          style={{ transform: `translate(-50%, -50%) scale(${DECK_SCALE})`, zIndex: 1 }}
        >
          <DrawPile count={drawPileCount} canDraw={canDrawDeck} onDraw={onDrawDeck} compact />
        </div>

        {pile.map((card, i) => {
        const depthFromTop = pile.length - i;
        const isTop = depthFromTop === 1;
        const isNeeded = picking && depthFromTop === pendingCount;
        const isExtraInRange = picking && depthFromTop < pendingCount;
        const isOutOfRange = picking && depthFromTop > pendingCount;
        const isExtraSelected = isExtraInRange && selectedIds?.includes(card.id);
        const withinTakeLimit = depthFromTop <= MAX_DISCARD_TAKE;

        const clickable = picking ? isExtraInRange : canPick && withinTakeLimit;
        const handleClick = picking
          ? isExtraInRange
            ? () => onToggleId(card.id)
            : undefined
          : canPick && withinTakeLimit
          ? () => onPickDepth(depthFromTop)
          : undefined;

        let ringClass = '';
        if (isNeeded) ringClass = 'ring-4 ring-emerald-400';
        else if (isExtraSelected) ringClass = 'ring-4 ring-yellow-400';
        else if (isExtraInRange) ringClass = 'ring-2 ring-dashed ring-white/50';
        else if (!picking && isTop) ringClass = 'ring-4 ring-yellow-400';

        const pos = positions[i];
        const x = pos.x;
        const y = pos.y;

        return (
          <div
            key={card.id}
            className="absolute top-1/2 left-1/2 transition-all duration-200"
            style={{
              transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${CARD_SCALE})`,
              zIndex: isTop ? 1000 : 10 + i,
            }}
          >
            <div className="relative">
              <div className={`relative rounded-lg ${ringClass}`}>
                <Card
                  card={card}
                  small
                  selected={isExtraSelected}
                  dimmed={picking ? isOutOfRange : !clickable}
                  onClick={handleClick}
                />
              </div>
              {isNeeded && (
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[0.55rem] text-emerald-300 font-semibold whitespace-nowrap">
                  wajib
                </span>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
