const { GameError } = require('../game/GameEngine');
const { SOCKET_EVENTS: E } = require('../../shared/constants');

function broadcastRoomState(io, roomManager, room) {
  const summary = roomManager.getRoomSummary(room);
  for (const player of room.players) {
    if (!player.connected || !player.socketId) continue;
    const payload = {
      room: summary,
      game: room.engine ? room.engine.toClientState(player.id) : null,
    };
    io.to(player.socketId).emit(E.GAME_STATE, payload);
  }
}

function registerSocketHandlers(io, socket, roomManager) {
  function safe(handler) {
    return (payload, ack) => {
      try {
        handler(payload, ack);
      } catch (err) {
        const message = err instanceof GameError ? err.message : 'Unexpected server error';
        if (!(err instanceof GameError)) console.error(err);
        socket.emit(E.ERROR, { message });
        if (typeof ack === 'function') ack({ ok: false, message });
      }
    };
  }

  socket.on(
    E.CREATE_ROOM,
    safe(({ hostName, maxPlayers, targetScore }, ack) => {
      const { room, playerId } = roomManager.createRoom({ hostName, maxPlayers, targetScore });
      socket.join(room.code);
      roomManager.attachSocket(room.code, playerId, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;

      const summary = roomManager.getRoomSummary(room);
      socket.emit(E.ROOM_CREATED, { roomCode: room.code, playerId, room: summary });
      if (typeof ack === 'function') ack({ ok: true, roomCode: room.code, playerId, room: summary });
    })
  );

  socket.on(
    E.JOIN_ROOM,
    safe(({ code, playerName, playerId }, ack) => {
      const upperCode = (code || '').trim().toUpperCase();
      const { room, playerId: assignedId, reconnected } = roomManager.joinRoom({
        code: upperCode,
        playerName,
        playerId,
      });
      socket.join(room.code);
      roomManager.attachSocket(room.code, assignedId, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = assignedId;

      const summary = roomManager.getRoomSummary(room);
      io.to(room.code).emit(reconnected ? E.PLAYER_RECONNECTED : E.PLAYER_JOINED, {
        room: summary,
        playerId: assignedId,
      });
      broadcastRoomState(io, roomManager, room);
      if (typeof ack === 'function') ack({ ok: true, playerId: assignedId, room: summary });
    })
  );

  socket.on(
    E.START_GAME,
    safe(() => {
      const { roomCode, playerId } = socket.data;
      const room = roomManager.startGame(roomCode, playerId);
      io.to(roomCode).emit(E.GAME_STARTED, { room: roomManager.getRoomSummary(room) });
      broadcastRoomState(io, roomManager, room);
    })
  );

  socket.on(
    'start-next-round',
    safe(() => {
      const { roomCode, playerId } = socket.data;
      const room = roomManager.startNextRound(roomCode, playerId);
      // If a last-place player owes the tap penalty, the round is not dealt yet;
      // just broadcast the 'minigame' state so everyone waits. Otherwise the
      // round has actually started.
      if (room.status !== 'minigame') {
        io.to(roomCode).emit(E.GAME_STARTED, { room: roomManager.getRoomSummary(room) });
      }
      broadcastRoomState(io, roomManager, room);
    })
  );

  socket.on(
    'minigame-done',
    safe(() => {
      const { roomCode, playerId } = socket.data;
      const room = roomManager.completeMiniGame(roomCode, playerId);
      io.to(roomCode).emit(E.GAME_STARTED, { room: roomManager.getRoomSummary(room) });
      broadcastRoomState(io, roomManager, room);
    })
  );

  socket.on(
    E.DRAW_CARD,
    safe(() => {
      const room = requireActiveRoom();
      const outcome = room.engine.drawFromDeck(socket.data.playerId);
      if (outcome.type === 'round-ended') {
        finishRound(room);
      } else {
        broadcastRoomState(io, roomManager, room);
      }
    })
  );

  socket.on(
    E.DRAW_FROM_DISCARD,
    safe(({ count, supportingCardIds }) => {
      const room = requireActiveRoom();
      room.engine.meldFromDiscard(socket.data.playerId, count, supportingCardIds);
      broadcastRoomState(io, roomManager, room);
    })
  );

  socket.on(
    E.DISCARD_CARD,
    safe(({ cardId }) => {
      const room = requireActiveRoom();
      const outcome = room.engine.discardCard(socket.data.playerId, cardId);
      if (outcome.type === 'round-ended') {
        finishRound(room);
      } else {
        broadcastRoomState(io, roomManager, room);
      }
    })
  );

  socket.on(
    E.ANNOUNCE_CEKI,
    safe(() => {
      const room = requireActiveRoom();
      room.engine.announceCeki(socket.data.playerId);
      io.to(room.code).emit(E.CEKI_ANNOUNCED, { playerId: socket.data.playerId });
      broadcastRoomState(io, roomManager, room);
    })
  );

  socket.on(
    E.CLOSED_CARD,
    safe(({ source, cardId }) => {
      const room = requireActiveRoom();
      const outcome =
        source === 'leftover'
          ? room.engine.closeWithLeftover(socket.data.playerId, cardId)
          : room.engine.closeCard(socket.data.playerId, source);
      if (outcome.type === 'round-ended') {
        finishRound(room);
      } else {
        broadcastRoomState(io, roomManager, room);
      }
    })
  );

  // --- Voice chat (WebRTC) signaling relay ----------------------------
  // The server only relays SDP offers/answers and ICE candidates between the
  // peers in a room; the audio itself flows peer-to-peer.

  socket.on('voice-join', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    // Tell existing voice participants a new peer arrived; they initiate offers.
    socket.to(room.code).emit('voice-peer-join', {
      socketId: socket.id,
      playerId: socket.data.playerId,
    });
  });

  socket.on('voice-leave', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) socket.to(room.code).emit('voice-peer-leave', { socketId: socket.id });
  });

  socket.on('voice-signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('voice-signal', {
      from: socket.id,
      fromPlayerId: socket.data.playerId,
      data,
    });
  });

  socket.on('disconnect', () => {
    // Notify voice peers regardless of game membership.
    const voiceRoom = roomManager.getRoomBySocket(socket.id);
    if (voiceRoom) socket.to(voiceRoom.code).emit('voice-peer-leave', { socketId: socket.id });

    const found = roomManager.detachSocket(socket.id);
    if (!found) return;
    const { room, player } = found;
    io.to(room.code).emit(E.PLAYER_DISCONNECTED, { playerId: player.id });
    broadcastRoomState(io, roomManager, room);
  });

  function requireActiveRoom() {
    const { roomCode } = socket.data;
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.engine || room.status !== 'playing') {
      throw new GameError('No active round');
    }
    return room;
  }

  function finishRound(room) {
    io.to(room.code).emit(E.ROUND_ENDED, { result: room.engine.result });
    roomManager.finalizeRound(room);
    const summary = roomManager.getRoomSummary(room);
    io.to(room.code).emit(E.ROUND_RESULT, {
      result: room.engine.result,
      cumulativeScores: summary.cumulativeScores,
      scoreHistory: summary.scoreHistory,
    });
    if (room.status === 'game-over') {
      io.to(room.code).emit(E.GAME_OVER, {
        winnerId: room.winnerId,
        cumulativeScores: summary.cumulativeScores,
      });
    }
    broadcastRoomState(io, roomManager, room);
  }
}

module.exports = { registerSocketHandlers, broadcastRoomState };
