export default function GameOverModal({ info, players, onBackToHome }) {
  if (!info) return null;
  const winner = players.find((p) => p.id === info.winnerId);
  const scoreOf = (p) => info.cumulativeScores[p.id] || 0;
  const ranked = [...players].sort((a, b) => scoreOf(b) - scoreOf(a));
  const minScore = Math.min(...ranked.map(scoreOf));
  const maxScore = Math.max(...ranked.map(scoreOf));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-feltDark text-center">
        <p className="text-5xl mb-2">🏆</p>
        <h2 className="font-bold text-xl mb-1">{winner ? `${winner.name} Menang!` : 'Game Selesai'}</h2>
        <p className="text-sm text-gray-500 mb-4">Target skor tercapai</p>
        <div className="flex flex-col gap-2 mb-5">
          {ranked.map((p, i) => {
            const isLoser = minScore !== maxScore && scoreOf(p) === minScore;
            return (
              <div key={p.id} className={`flex justify-between rounded-lg px-3 py-2 ${i === 0 ? 'bg-yellow-100 font-bold' : 'bg-gray-100'}`}>
                <span>{i === 0 ? '👑 ' : isLoser ? '🤡 ' : ''}{p.name}</span>
                <span>{scoreOf(p)}</span>
              </div>
            );
          })}
        </div>
        <button className="w-full py-2 rounded-lg bg-feltDark text-white font-semibold" onClick={onBackToHome}>
          Kembali ke Beranda
        </button>
      </div>
    </div>
  );
}
