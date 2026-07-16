import { useState } from 'react';
import { MIN_PLAYERS } from '../../shared/constants';

export default function Lobby({ room, playerId, onStart }) {
  const [copied, setCopied] = useState(false);
  const isHost = room.players.find((p) => p.id === playerId)?.isHost;
  const canStart = room.players.length >= MIN_PLAYERS;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/room/${room.code}` : '';

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="min-h-screen bg-felt flex flex-col items-center justify-center px-4 py-10 text-white">
      <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-2xl p-5">
        <p className="text-center text-white/70 text-sm mb-1">Kode Room</p>
        <p className="text-center text-4xl font-bold tracking-[0.3em] mb-4">{room.code}</p>

        <button
          onClick={copyLink}
          className="w-full mb-5 py-2 rounded-lg bg-white/10 border border-white/30 text-sm font-medium"
        >
          {copied ? 'Link disalin!' : 'Salin Link Undangan'}
        </button>

        <div className="flex justify-between text-xs text-white/70 mb-2">
          <span>Pemain ({room.players.length}/{room.settings.maxPlayers})</span>
          <span>Target: {room.settings.targetScore}</span>
        </div>
        <div className="flex flex-col gap-2 mb-5">
          {room.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-green-400' : 'bg-gray-400'}`} />
              <span className="flex-1 font-medium">{p.name}</span>
              {p.isHost && <span className="text-[0.65rem] bg-yellow-400 text-feltDark px-2 py-0.5 rounded-full font-bold">HOST</span>}
              {p.id === playerId && <span className="text-[0.65rem] text-white/60">(kamu)</span>}
            </div>
          ))}
          {Array.from({ length: room.settings.maxPlayers - room.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-lg px-3 py-2 border border-dashed border-white/20 text-white/40 text-sm">
              Menunggu pemain...
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className="w-full py-3 rounded-xl bg-yellow-400 text-feltDark font-bold disabled:opacity-40"
          >
            {canStart ? 'Mulai Game' : `Butuh min. ${MIN_PLAYERS} pemain`}
          </button>
        ) : (
          <p className="text-center text-white/70 text-sm">Menunggu host memulai game...</p>
        )}
      </div>
    </main>
  );
}
