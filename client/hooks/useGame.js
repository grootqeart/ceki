import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getServerUrl } from '../lib/serverUrl';

function storageKey(roomCode) {
  return `remi:room:${roomCode}:playerId`;
}

export function useGame(roomCode) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [gameOverInfo, setGameOverInfo] = useState(null);

  useEffect(() => {
    if (!roomCode) return undefined;
    const socket = io(getServerUrl(), { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const storedId = typeof window !== 'undefined' ? localStorage.getItem(storageKey(roomCode)) : null;
      if (storedId) {
        socket.emit('join-room', { code: roomCode, playerId: storedId }, (ack) => {
          if (ack && !ack.ok) {
            setNeedsName(true);
          }
        });
      } else {
        setNeedsName(true);
      }
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('room-created', ({ playerId: pid, room: r }) => {
      localStorage.setItem(storageKey(roomCode), pid);
      setPlayerId(pid);
      setRoom(r);
      setNeedsName(false);
    });
    socket.on('player-joined', ({ room: r }) => setRoom(r));
    socket.on('player-reconnected', ({ room: r }) => setRoom(r));
    socket.on('player-disconnected', ({ }) => {});
    socket.on('game-started', ({ room: r }) => {
      setRoom(r);
      setRoundResult(null);
    });
    socket.on('game-state', ({ room: r, game: g }) => {
      setRoom(r);
      setGame(g);
    });
    socket.on('ceki-announced', () => {});
    socket.on('round-ended', () => {});
    socket.on('round-result', (payload) => {
      setRoundResult(payload);
    });
    socket.on('game-over', (payload) => {
      setGameOverInfo(payload);
    });
    socket.on('error-message', ({ message }) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

  const submitName = useCallback(
    (name) => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('join-room', { code: roomCode, playerName: name }, (ack) => {
        if (ack && ack.ok) {
          localStorage.setItem(storageKey(roomCode), ack.playerId);
          setPlayerId(ack.playerId);
          setRoom(ack.room);
          setNeedsName(false);
        } else if (ack) {
          setError(ack.message);
        }
      });
    },
    [roomCode]
  );

  useEffect(() => {
    if (room && !playerId) {
      const storedId = typeof window !== 'undefined' ? localStorage.getItem(storageKey(roomCode)) : null;
      if (storedId) setPlayerId(storedId);
    }
  }, [room, playerId, roomCode]);

  const emit = useCallback((event, payload) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(event, payload || {});
  }, []);

  const startGame = useCallback(() => emit('start-game'), [emit]);
  const startNextRound = useCallback(() => emit('start-next-round'), [emit]);
  const finishMiniGame = useCallback(() => emit('minigame-done'), [emit]);
  const drawCard = useCallback(() => emit('draw-card'), [emit]);
  const drawFromDiscard = useCallback(
    ({ count, supportingCardIds }) => emit('draw-from-discard', { count, supportingCardIds }),
    [emit]
  );
  const discardCard = useCallback((cardId) => emit('discard-card', { cardId }), [emit]);
  const announceCeki = useCallback(() => emit('announce-ceki'), [emit]);
  const closeCard = useCallback((source, cardId) => emit('closed-card', { source, cardId }), [emit]);
  const clearError = useCallback(() => setError(null), []);
  const clearRoundResult = useCallback(() => setRoundResult(null), []);

  return {
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
  };
}
