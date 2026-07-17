const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms/RoomManager');
const { registerSocketHandlers } = require('./socket/handlers');
const store = require('./store');

const PORT = process.env.PORT || 4000;
// In production, set CLIENT_ORIGIN to lock CORS down to your real frontend
// domain. Left unset (the local/LAN dev default), any origin is allowed so
// phones/other devices on the same network can reach this server too.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true;

const app = express();
app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const roomManager = new RoomManager();

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket, roomManager);
});

// Connect to Redis (if configured) and reload any persisted rooms before we
// start accepting connections, so a restart resumes in-progress games.
async function start() {
  try {
    await store.initStore();
    await roomManager.restore();
  } catch (err) {
    console.error('Persistence unavailable, continuing in-memory:', err.message);
  }
  server.listen(PORT, () => {
    console.log(`Ceki server listening on port ${PORT}`);
  });
}

start();
