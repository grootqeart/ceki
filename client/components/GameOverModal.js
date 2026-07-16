export default function GameOverModal({ info, players, onBackToHome }) {
  if (!info) return null;
  const winner = players.find((p) => p.id === info.winnerId);
  const ranked = [...players].sort((a, b) => (info.cumulativeScores[b.id] || 0) - (info.cumulativeScores[a.id] || 0));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-feltDark text-center">
        <p className="text-5xl mb-2">🏆</p>
        <h2 className="font-bold text-xl mb-1">{winner ? `${winner.name} Menang!` : 'Game Selesai'}</h2>
        <p className="text-sm text-gray-500 mb-4">Target skor tercapai</p>
        <div className="flex flex-col gap-2 mb-5">
          {ranked.map((p, i) => (
            <div key={p.id} className={`flex justify-between rounded-lg px-3 py-2 ${i === 0 ? 'bg-yellow-100 font-bold' : 'bg-gray-100'}`}>
              <span>{i === 0 ? '👑 ' : ''}{p.name}</span>
              <span>{info.cumulativeScores[p.id] || 0}</span>
            </div>
          ))}
        </div>
        <button className="w-full py-2 rounded-lg bg-feltDark text-white font-semibold" onClick={onBackToHome}>
          Kembali ke Beranda
        </button>
      </div>
    </div>
  );
}
