import { useState } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { getServerUrl } from '../lib/serverUrl';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState(null); // 'create' | 'join' | null
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [targetScore, setTargetScore] = useState(500);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const socket = io(getServerUrl());
    socket.emit(
      'create-room',
      { hostName: name.trim(), maxPlayers: Number(maxPlayers), targetScore: Number(targetScore) },
      (ack) => {
        socket.disconnect();
        setBusy(false);
        if (ack && ack.ok) {
          localStorage.setItem(`remi:room:${ack.roomCode}:playerId`, ack.playerId);
          router.push(`/room/${ack.roomCode}`);
        } else {
          setError((ack && ack.message) || 'Gagal membuat room');
        }
      }
    );
  }

  function handleJoin(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || !name.trim()) return;
    setBusy(true);
    setError(null);
    const socket = io(getServerUrl());
    socket.emit('join-room', { code, playerName: name.trim() }, (ack) => {
      socket.disconnect();
      setBusy(false);
      if (ack && ack.ok) {
        localStorage.setItem(`remi:room:${code}:playerId`, ack.playerId);
        router.push(`/room/${code}`);
      } else {
        setError((ack && ack.message) || 'Gagal join room');
      }
    });
  }

  return (
    <main className="min-h-screen bg-felt flex flex-col items-center justify-center px-4 py-10 text-white">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-center mb-1 tracking-tight">🃏 Remi Online</h1>
        <p className="text-center text-white/70 mb-8">Main Remi bareng teman via link</p>

        {!mode && (
          <div className="flex flex-col gap-3">
            <button
              className="bg-yellow-400 hover:bg-yellow-300 text-feltDark font-semibold py-3 rounded-xl shadow-lg transition"
              onClick={() => setMode('create')}
            >
              Buat Room
            </button>
            <button
              className="bg-white/10 hover:bg-white/20 border border-white/30 font-semibold py-3 rounded-xl transition"
              onClick={() => setMode('join')}
            >
              Join Room
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="bg-white/10 rounded-2xl p-5 flex flex-col gap-4 border border-white/20">
            <h2 className="font-semibold text-lg">Buat Room</h2>
            <label className="flex flex-col gap-1 text-sm">
              Nama kamu
              <input
                className="rounded-lg px-3 py-2 text-feltDark"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Jumlah pemain
              <select
                className="rounded-lg px-3 py-2 text-feltDark"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
              >
                <option value={2}>2 pemain</option>
                <option value={3}>3 pemain</option>
                <option value={4}>4 pemain</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Target poin
              <select
                className="rounded-lg px-3 py-2 text-feltDark"
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
              >
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </label>
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2 rounded-lg bg-white/10" onClick={() => setMode(null)}>
                Kembali
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2 rounded-lg bg-yellow-400 text-feltDark font-semibold disabled:opacity-50"
              >
                {busy ? 'Membuat...' : 'Buat'}
              </button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="bg-white/10 rounded-2xl p-5 flex flex-col gap-4 border border-white/20">
            <h2 className="font-semibold text-lg">Join Room</h2>
            <label className="flex flex-col gap-1 text-sm">
              Kode room
              <input
                className="rounded-lg px-3 py-2 text-feltDark uppercase tracking-widest"
                value={joinCode}
                maxLength={6}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Nama kamu
              <input
                className="rounded-lg px-3 py-2 text-feltDark"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama"
                required
              />
            </label>
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2 rounded-lg bg-white/10" onClick={() => setMode(null)}>
                Kembali
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2 rounded-lg bg-yellow-400 text-feltDark font-semibold disabled:opacity-50"
              >
                {busy ? 'Bergabung...' : 'Join'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
