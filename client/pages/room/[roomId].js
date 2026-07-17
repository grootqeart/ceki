import { useRouter } from 'next/router';
import { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import Lobby from '../../components/Lobby';
import GameBoard from '../../components/GameBoard';
import RoundResultModal from '../../components/RoundResultModal';
import GameOverModal from '../../components/GameOverModal';
import LoserMiniGame from '../../components/LoserMiniGame';

export default function RoomPage() {
  const router = useRouter();
  const { roomId } = router.query;
  const roomCode = typeof roomId === 'string' ? roomId.toUpperCase() : null;
  const [nameInput, setNameInput] = useState('');

  const {
    connected,
    needsName,
    playerId,
    room,
    game,
    error,
    roundResult,
    gameOverInfo,
    socketRef,
    submitName,
    startGame,
    startNextRound,
    finishMiniGame,
    drawCard,
    drawFromDiscard,
    discardCard,
    announceCeki,
    closeCard,
    clearError,
    clearRoundResult,
  } = useGame(roomCode);

  if (!roomCode) return null;

  if (!connected || (!room && !needsName)) {
    return (
      <main className="min-h-screen bg-felt flex items-center justify-center text-white">
        <p>Menghubungkan...</p>
      </main>
    );
  }

  if (needsName && !room) {
    return (
      <main className="min-h-screen bg-felt flex items-center justify-center px-4 text-white">
        <form
          className="w-full max-w-sm bg-white/10 border border-white/20 rounded-2xl p-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameInput.trim()) submitName(nameInput.trim());
          }}
        >
          <h1 className="text-xl font-bold text-center">Gabung Room {roomCode}</h1>
          <label className="flex flex-col gap-1 text-sm">
            Nama kamu
            <input
              className="rounded-lg px-3 py-2 text-feltDark"
              value={nameInput}
              maxLength={20}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nama"
              autoFocus
              required
            />
          </label>
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button type="submit" className="py-2 rounded-lg bg-yellow-400 text-feltDark font-bold">
            Gabung
          </button>
        </form>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-felt flex items-center justify-center text-white">
        <p>Memuat room...</p>
      </main>
    );
  }

  const isHost = room.players.find((p) => p.id === playerId)?.isHost;

  return (
    <>
      {(room.status === 'waiting') && <Lobby room={room} playerId={playerId} onStart={startGame} />}

      {room.status !== 'waiting' && room.status !== 'minigame' && game && (
        <GameBoard
          room={room}
          game={game}
          playerId={playerId}
          actions={{ drawCard, drawFromDiscard, discardCard, announceCeki, closeCard }}
          socketRef={socketRef}
          roundResult={roundResult}
          gameOverInfo={gameOverInfo}
        />
      )}

      {room.status === 'minigame' && room.miniGame && (
        room.miniGame.loserId === playerId ? (
          <LoserMiniGame target={room.miniGame.target} onDone={finishMiniGame} />
        ) : (
          <main className="min-h-screen bg-felt flex flex-col items-center justify-center px-6 text-white text-center">
            <p className="text-6xl mb-4">🃏</p>
            <p className="text-lg font-semibold">
              Menunggu {room.players.find((p) => p.id === room.miniGame.loserId)?.name || 'pemain'}
            </p>
            <p className="text-white/70 mt-1">menyelesaikan tap untuk mengocok kartu…</p>
          </main>
        )
      )}

      {roundResult && !gameOverInfo && room.status === 'round-over' && (
        <RoundResultModal
          result={roundResult.result}
          players={room.players}
          isHost={isHost}
          onNextRound={() => {
            clearRoundResult();
            startNextRound();
          }}
          gameOver={false}
        />
      )}

      {gameOverInfo && (
        <GameOverModal
          info={gameOverInfo}
          players={room.players}
          onBackToHome={() => router.push('/')}
        />
      )}

      {error && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 cursor-pointer"
          onClick={clearError}
        >
          {error}
        </div>
      )}
    </>
  );
}
