// Shared constants used by both server and client

const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLORS = { S: 'black', H: 'red', D: 'red', C: 'black' };

// rank: 1 = Ace, 2-10 = number, 11 = J, 12 = Q, 13 = K
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

const JOKER_COUNT = 3;
const HAND_SIZE = 7;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const MAX_DISCARD_TAKE = 7;
const ROOM_CODE_LENGTH = 6;
const VALID_TARGET_SCORES = [500, 1000];

// Tarif normal (in-hand / end-of-deck scoring)
const NORMAL_VALUES = {
  low: 5, // 2-10
  face: 10, // J Q K
  ace: 15,
};

// Tarif tinggi (tutupan & ceburan)
const HIGH_VALUES = {
  low: 15, // 2-10
  face: 25, // J Q K
  ace: 50,
  joker: 100,
};

const SOCKET_EVENTS = {
  // Lobby
  CREATE_ROOM: 'create-room',
  ROOM_CREATED: 'room-created',
  JOIN_ROOM: 'join-room',
  PLAYER_JOINED: 'player-joined',
  START_GAME: 'start-game',
  GAME_STARTED: 'game-started',

  // Gameplay
  DRAW_CARD: 'draw-card',
  CARD_DRAWN: 'card-drawn',
  DRAW_FROM_DISCARD: 'draw-from-discard',
  CARDS_DRAWN: 'cards-drawn',
  DISCARD_CARD: 'discard-card',
  CARD_DISCARDED: 'card-discarded',
  ANNOUNCE_CEKI: 'announce-ceki',
  CEKI_ANNOUNCED: 'ceki-announced',
  CLOSED_CARD: 'closed-card',
  ROUND_ENDED: 'round-ended',

  // State sync
  GAME_STATE: 'game-state',
  TURN_CHANGE: 'turn-change',
  ROUND_RESULT: 'round-result',
  GAME_OVER: 'game-over',

  // System
  PLAYER_DISCONNECTED: 'player-disconnected',
  PLAYER_RECONNECTED: 'player-reconnected',
  ERROR: 'error-message',
};

module.exports = {
  SUITS,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  RANKS,
  RANK_LABELS,
  JOKER_COUNT,
  HAND_SIZE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_DISCARD_TAKE,
  ROOM_CODE_LENGTH,
  VALID_TARGET_SCORES,
  NORMAL_VALUES,
  HIGH_VALUES,
  SOCKET_EVENTS,
};
