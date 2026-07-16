export default function ScoreBoard({ players, cumulativeScores, targetScore, scoreHistory, open, onClose }) {
  if (!open) return null;

  const ranked = [...players].sort((a, b) => (cumulativeScores[b.id] || 0) - (cumulativeScores[a.id] || 0));
  const leaderScore = ranked.length ? cumulativeScores[ranked[0].id] || 0 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:w-96 max-h-[80vh] overflow-y-auto p-5 text-feltDark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Skor</h2>
          <span className="text-xs bg-feltDark text-white px-2 py-1 rounded-full">Target: {targetScore}</span>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {ranked.map((p) => {
            const score = cumulativeScores[p.id] || 0;
            const leading = score === leaderScore && leaderScore > 0;
            const pct = Math.min(100, (score / targetScore) * 100);
            return (
              <div key={p.id} className={`rounded-lg p-2 ${leading ? 'bg-yellow-100 ring-2 ring-yellow-400' : 'bg-gray-100'}`}>
                <div className="flex justify-between text-sm font-semibold mb-1">
                  <span>{leading ? '👑 ' : ''}{p.name}</span>
                  <span>{score}</span>
                </div>
                <div className="h-1.5 bg-gray-300 rounded-full overflow-hidden">
                  <div className="h-full bg-feltDark" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="font-semibold text-sm mb-2">Histori Ronde</h3>
        <div className="flex flex-col gap-2">
          {scoreHistory.length === 0 && <p className="text-xs text-gray-500">Belum ada ronde selesai.</p>}
          {[...scoreHistory].reverse().map((h) => (
            <div key={h.round} className="border border-gray-200 rounded-lg p-2 text-xs">
              <div className="font-semibold mb-1">
                Ronde {h.round} — {reasonLabel(h.reason)}
              </div>
              <div className="flex flex-col gap-0.5">
                {players.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{p.name}</span>
                    <span>
                      {h.deltas[p.id] >= 0 ? '+' : ''}
                      {h.deltas[p.id] || 0} ({h.cumulative[p.id] || 0})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button className="mt-4 w-full py-2 rounded-lg bg-feltDark text-white font-semibold" onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

function reasonLabel(reason) {
  switch (reason) {
    case 'closed-tutupan':
      return 'Tutupan';
    case 'closed-ceburan':
      return 'Ceburan';
    case 'deck-empty':
      return 'Deck Habis';
    case 'closed-meja':
      return 'Habis di Meja';
    case 'joker-discarded':
      return 'Joker Dibuang (Void)';
    default:
      return reason;
  }
}
