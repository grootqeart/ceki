const crypto = require('crypto');
const { GameEngine, GameError } = require('../game/GameEngine');
const store = require('../store');
const { MIN_PLAYERS, MAX_PLAYERS, VALID_TARGET_SCORES, ROOM_CODE_LENGTH } = require('../../shared/constants');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
  }

  createRoom({ hostName, maxPlayers, targetScore }) {
    if (!hostName || !hostName.trim()) throw new GameError('Name is required');
    if (!MAX_PLAYERS_RANGE.includes(maxPlayers)) throw new GameError('Invalid player count');
    if (!VALID_TARGET_SCORES.includes(targetScore)) throw new GameError('Invalid target score');

    let code;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const playerId = crypto.randomUUID();
    const room = {
      code,
      settings: { maxPlayers, targetScore },
      players: [
        { id: playerId, name: hostName.trim(), socketId: null, connected: false, isHost: true },
      ],
      status: 'waiting',
      cumulativeScores: { [playerId]: 0 },
      scoreHistory: [],
      engine: null,
      winnerId: null,
      round: 0,
      miniGame: null, // { loserId, target } while a between-round tap penalty is pending
    };
    this.rooms.set(code, room);
    return { room, playerId };
  }

  joinRoom({ code, playerName, playerId }) {
    const room = this.rooms.get(code);
    if (!room) throw new GameError('Room not found');

    // Reconnect path: existing playerId already seated.
    if (playerId) {
      const existing = room.players.find((p) => p.id === playerId);
      if (existing) return { room, playerId: existing.id, reconnected: true };
    }

    if (room.status !== 'waiting') throw new GameError('Game already in progress');
    if (room.players.length >= room.settings.maxPlayers) throw new GameError('Room is full');
    if (!playerName || !playerName.trim()) throw new GameError('Name is required');

    const newId = crypto.randomUUID();
    room.players.push({ id: newId, name: playerName.trim(), socketId: null, connected: false, isHost: false });
    room.cumulativeScores[newId] = 0;
    return { room, playerId: newId, reconnected: false };
  }

  attachSocket(code, playerId, socketId) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.socketId = socketId;
    player.connected = true;
    return room;
  }

  detachSocket(socketId) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.socketId === socketId);
      if (player) {
        player.connected = false;
        return { room, player };
      }
    }
    return null;
  }

  // --- Persistence (Redis, optional) --------------------------------

  // Fire-and-forget snapshot of a room to the store after a state change.
  persist(room) {
    if (!room || !store.isEnabled()) return;
    store.saveRoom(room.code, this._serializeRoom(room));
  }

  _serializeRoom(room) {
    return JSON.stringify({
      code: room.code,
      settings: room.settings,
      players: room.players,
      status: room.status,
      cumulativeScores: room.cumulativeScores,
      scoreHistory: room.scoreHistory,
      winnerId: room.winnerId,
      round: room.round,
      miniGame: room.miniGame || null,
      startPlayerId: room.startPlayerId || null,
      engine: room.engine ? room.engine.toJSON() : null,
    });
  }

  _deserializeRoom(json) {
    const o = JSON.parse(json);
    return {
      code: o.code,
      settings: o.settings,
      // Socket bindings don't survive a restart -- everyone starts disconnected
      // and re-attaches when their client reconnects with its stored playerId.
      players: (o.players || []).map((p) => ({ ...p, socketId: null, connected: false })),
      status: o.status,
      cumulativeScores: o.cumulativeScores || {},
      scoreHistory: o.scoreHistory || [],
      engine: o.engine ? GameEngine.fromJSON(o.engine) : null,
      winnerId: o.winnerId || null,
      round: o.round || 0,
      miniGame: o.miniGame || null,
      startPlayerId: o.startPlayerId || null,
    };
  }

  // Loads any persisted rooms from the store into memory on startup.
  async restore() {
    const blobs = await store.loadAllRooms();
    for (const json of blobs) {
      try {
        const room = this._deserializeRoom(json);
        this.rooms.set(room.code, room);
      } catch (err) {
        console.error('Failed to restore a room:', err.message);
      }
    }
    if (blobs.length) console.log(`Persistence: restored ${this.rooms.size} room(s) from Redis`);
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  getRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.socketId === socketId)) return room;
    }
    return null;
  }

  startGame(code, requesterId) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('Room not found');
    const requester = room.players.find((p) => p.id === requesterId);
    if (!requester || !requester.isHost) throw new GameError('Only the host can start the game');
    if (room.players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);
    if (room.status !== 'waiting') throw new GameError('Game already started');

    this._startNewRound(room);
    return room;
  }

  _startNewRound(room) {
    room.status = 'playing';
    room.miniGame = null;
    room.round += 1;
    const starterId = this._pickStartingPlayer(room);
    room.engine = new GameEngine(
      room.players.map((p) => p.id),
      starterId
    );
    room.startPlayerId = starterId;
    room.winnerId = null;
  }

  // The round starts with the player who currently has the highest cumulative
  // score. If there's a tie for the top (including the first round where
  // everyone is at 0), a random one of the tied leaders starts.
  _pickStartingPlayer(room) {
    const ids = room.players.map((p) => p.id);
    const scoreOf = (id) => room.cumulativeScores[id] || 0;
    const maxScore = Math.max(...ids.map(scoreOf));
    const leaders = ids.filter((id) => scoreOf(id) === maxScore);
    return leaders[Math.floor(Math.random() * leaders.length)];
  }

  // Applies a finished round's result to cumulative scores, the overtake
  // ("salip") rule, and checks for a final game winner.
  finalizeRound(room) {
    const engine = room.engine;
    const result = engine.result;
    const priorScores = { ...room.cumulativeScores };
    const rawScores = {};
    for (const p of room.players) {
      const delta = (result.scores && result.scores[p.id]) || 0;
      rawScores[p.id] = (priorScores[p.id] || 0) + delta;
    }

    const finalScores = { ...rawScores };
    const ids = room.players.map((p) => p.id);
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const priorA = priorScores[a] || 0;
        const priorB = priorScores[b] || 0;
        if (priorA < priorB && rawScores[a] >= rawScores[b]) {
          finalScores[b] = 0;
        }
      }
    }

    room.cumulativeScores = finalScores;
    room.scoreHistory.push({
      round: room.round,
      reason: result.reason,
      closerId: result.closerId || null,
      deltas: Object.fromEntries(ids.map((id) => [id, (result.scores && result.scores[id]) || 0])),
      cumulative: { ...finalScores },
    });

    const target = room.settings.targetScore;
    const winner = ids
      .filter((id) => finalScores[id] >= target)
      .sort((x, y) => finalScores[y] - finalScores[x])[0];

    if (winner) {
      room.status = 'game-over';
      room.winnerId = winner;
    } else {
      room.status = 'round-over';
    }
  }

  // The sole last-place player for a given standing, or null (tie / all equal).
  _soleLastPlace(scores, ids) {
    const vals = ids.map((id) => scores[id] || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return null;
    const losers = ids.filter((id) => (scores[id] || 0) === min);
    return losers.length === 1 ? losers[0] : null;
  }

  // How many consecutive most-recent standings had `playerId` as the sole last
  // place. Drives the escalating tap penalty (50 per consecutive round).
  _lastPlaceStreak(room, playerId) {
    const ids = room.players.map((p) => p.id);
    let streak = 0;
    for (let i = room.scoreHistory.length - 1; i >= 0; i--) {
      if (this._soleLastPlace(room.scoreHistory[i].cumulative || {}, ids) === playerId) streak++;
      else break;
    }
    return streak;
  }

  startNextRound(code, requesterId) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('Room not found');
    const requester = room.players.find((p) => p.id === requesterId);
    if (!requester || !requester.isHost) throw new GameError('Only the host can start the next round');
    if (room.status !== 'round-over') throw new GameError('Round is not over');

    // A single last-place player owes a tap penalty before the round can start:
    // 50 taps per consecutive last-place round, capped at 400. Everyone else
    // waits (the round is not dealt until they finish).
    const ids = room.players.map((p) => p.id);
    const loserId = this._soleLastPlace(room.cumulativeScores, ids);
    if (loserId) {
      const streak = this._lastPlaceStreak(room, loserId);
      room.status = 'minigame';
      room.miniGame = { loserId, target: Math.min(50 * streak, 400) };
    } else {
      this._startNewRound(room);
    }
    return room;
  }

  completeMiniGame(code, requesterId) {
    const room = this.getRoom(code);
    if (!room) throw new GameError('Room not found');
    if (room.status !== 'minigame') throw new GameError('No mini-game in progress');
    if (!room.miniGame || room.miniGame.loserId !== requesterId) {
      throw new GameError('Only the last-place player can finish the mini-game');
    }
    room.miniGame = null;
    this._startNewRound(room);
    return room;
  }

  // Public-safe snapshot for lobby/scoreboard UI (no hand contents).
  getRoomSummary(room) {
    return {
      code: room.code,
      settings: room.settings,
      status: room.status,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
      })),
      cumulativeScores: room.cumulativeScores,
      scoreHistory: room.scoreHistory,
      winnerId: room.winnerId,
      round: room.round,
      miniGame: room.miniGame || null,
    };
  }
}

const MAX_PLAYERS_RANGE = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i
);

module.exports = { RoomManager };
