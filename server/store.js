// Optional Redis-backed persistence for room state. If REDIS_URL is not set,
// every function is a no-op and the app runs purely in memory (dev default).
//
// Rooms are stored one JSON blob per key (`room:<CODE>`) with a sliding TTL, so
// idle rooms expire on their own. Writes are fire-and-forget: they never block
// a game action, and because each write serialises the whole room, a later
// write always supersedes an earlier one (last-write-wins).
const { createClient } = require('redis');

const ROOM_PREFIX = 'room:';
const ROOM_TTL_SECONDS = 24 * 60 * 60; // idle rooms drop after a day

let client = null;
let ready = false;

async function initStore() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('Persistence: REDIS_URL not set — running in-memory only');
    return;
  }
  client = createClient({ url });
  client.on('error', (err) => console.error('Redis error:', err.message));
  await client.connect();
  ready = true;
  console.log('Persistence: Redis connected');
}

function isEnabled() {
  return ready;
}

function saveRoom(code, json) {
  if (!ready) return;
  client.set(ROOM_PREFIX + code, json, { EX: ROOM_TTL_SECONDS }).catch((err) => {
    console.error('Redis saveRoom failed:', err.message);
  });
}

function deleteRoom(code) {
  if (!ready) return;
  client.del(ROOM_PREFIX + code).catch(() => {});
}

// Returns all stored room JSON blobs (strings). Empty when Redis is disabled.
async function loadAllRooms() {
  if (!ready) return [];
  const keys = await client.keys(ROOM_PREFIX + '*');
  if (keys.length === 0) return [];
  const values = await client.mGet(keys);
  return values.filter(Boolean);
}

module.exports = { initStore, isEnabled, saveRoom, deleteRoom, loadAllRooms };
