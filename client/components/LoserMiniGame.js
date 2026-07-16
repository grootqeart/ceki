import { useEffect, useState } from 'react';

const TARGET = 50;

// Full-screen gate shown to the current last-place player at the start of a new
// round: they must tap the screen (or press space) TARGET times before their
// board is revealed. Purely local to this player's screen.
export default function LoserMiniGame({ onDone }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setCount((c) => Math.min(c + 1, TARGET));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (count >= TARGET) onDone();
  }, [count, onDone]);

  const pct = Math.min(100, (count / TARGET) * 100);

  return (
    <div
      className="fixed inset-0 z-[60] bg-feltDark/95 flex flex-col items-center justify-center px-6 text-white select-none touch-none cursor-pointer"
      onPointerDown={() => setCount((c) => Math.min(c + 1, TARGET))}
    >
      <p className="text-6xl mb-3">🤡</p>
      <h2 className="text-2xl font-bold mb-1 text-center">Kamu peringkat terakhir!</h2>
      <p className="text-white/70 mb-6 text-center">
        Tap layar atau tekan spasi {TARGET}× biar ronde bisa mulai
      </p>
      <div className="w-full max-w-xs h-4 rounded-full bg-white/15 overflow-hidden mb-3">
        <div className="h-full bg-yellow-400 transition-all duration-75" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-4xl font-bold tabular-nums">
        {count}
        <span className="text-white/50 text-2xl"> / {TARGET}</span>
      </p>
      <p className="mt-6 text-xs text-white/50">Terus tap!</p>
    </div>
  );
}
