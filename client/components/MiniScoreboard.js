import { useEffect, useRef, useState } from 'react';

const POS_KEY = 'remi:miniscore:pos';
const COLLAPSED_KEY = 'remi:miniscore:collapsed';

// Always-visible ranking widget. It can be dragged around by its header and
// collapsed to a small icon; both the position and collapsed state persist in
// localStorage. Tapping the list body opens the full scoreboard.
export default function MiniScoreboard({ players, cumulativeScores, targetScore, onOpenFull }) {
  const [pos, setPos] = useState({ x: 8, y: 52 });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && typeof p.x === 'number' && typeof p.y === 'number') setPos(p);
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch (e) {
      /* ignore */
    }
  }, []);

  function persistPos(p) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(p));
    } catch (e) {
      /* ignore */
    }
  }

  function setCollapsedPersist(v) {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function onPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 400) - 40;
    const maxY = (typeof window !== 'undefined' ? window.innerHeight : 600) - 40;
    setPos({
      x: Math.min(Math.max(0, d.origX + dx), maxX),
      y: Math.min(Math.max(0, d.origY + dy), maxY),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
    persistPos(pos);
  }

  const ranked = [...players].sort((a, b) => (cumulativeScores[b.id] || 0) - (cumulativeScores[a.id] || 0));
  const topScore = ranked.length ? cumulativeScores[ranked[0].id] || 0 : 0;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPersist(false)}
        style={{ position: 'absolute', left: pos.x, top: pos.y, touchAction: 'none' }}
        className="z-30 bg-black/40 hover:bg-black/55 rounded-full w-9 h-9 flex items-center justify-center text-base"
        title="Tampilkan peringkat"
      >
        🏆
      </button>
    );
  }

  return (
    <div
      style={{ position: 'absolute', left: pos.x, top: pos.y }}
      className="z-30 bg-black/35 rounded-xl backdrop-blur-sm w-36 overflow-hidden"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
        className="flex items-center justify-between px-2 py-1 cursor-move bg-white/5 select-none"
      >
        <span className="text-[0.6rem] text-white/60">⠿ Peringkat</span>
        <div className="flex items-center gap-1 text-[0.6rem] text-white/60">
          <span>🎯{targetScore}</span>
          <button
            type="button"
            onClick={() => setCollapsedPersist(true)}
            className="text-white/70 hover:text-white px-1 leading-none"
            title="Sembunyikan"
          >
            ✕
          </button>
        </div>
      </div>

      <button type="button" onClick={onOpenFull} className="text-left w-full px-2.5 py-1.5">
        <div className="flex flex-col gap-0.5">
          {ranked.map((p, i) => {
            const score = cumulativeScores[p.id] || 0;
            const leading = i === 0 && topScore > 0;
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className={`truncate ${leading ? 'text-yellow-300 font-semibold' : 'text-white/90'}`}>
                  {i + 1}. {p.name} {leading ? '👑' : ''}
                </span>
                <span className={`font-semibold tabular-nums ${leading ? 'text-yellow-300' : 'text-white/90'}`}>
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      </button>
    </div>
  );
}
