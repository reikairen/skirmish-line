const express = require('express');
const http = require('http');
const helmet = require('helmet');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./game/GameEngine');
const AI = require('./game/AI');
const RoomManager = require('./rooms/RoomManager');

const app = express();
const server = http.createServer(app);

// Determine allowed origin for CORS
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

// Security headers (L6)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

// --- Global error handlers (C4) ---
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// --- Room cleanup interval (C5) ---
const ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of roomManager.rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const player of room.players) {
        io.to(player.socketId).emit('action-error', { message: 'Session expired due to inactivity' });
      }
      roomManager.destroyRoom(roomId);
    }
  }
}, 60 * 1000); // check every minute

// --- Input validation helpers (C1) ---
function isValidString(val, maxLen = 20) {
  return typeof val === 'string' && val.length <= maxLen;
}

function isValidInt(val, min, max) {
  return Number.isInteger(val) && val >= min && val <= max;
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anon';
  return name.trim().slice(0, 20) || 'Anon';
}

const VALID_MODES = ['ai', 'public', 'private'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

// --- Rate limiter (C2) ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 15;      // max events per window

function isRateLimited(socketId) {
  const now = Date.now();
  let entry = rateLimitMap.get(socketId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry = { windowStart: now, count: 0 };
    rateLimitMap.set(socketId, entry);
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// --- Safe error message (M6) ---
const SAFE_ERRORS = new Set([
  'Not your turn',
  'Not in play phase',
  'Not in claim phase',
  'Must play a card first',
  'Invalid card index',
  'Invalid border index',
  'Border is already claimed',
  'Your side of this border is full',
  'Game is over',
]);

function safeErrorMessage(err) {
  if (SAFE_ERRORS.has(err.message)) return err.message;
  return 'Invalid action';
}

// --- Game helpers ---
function emitGameState(room) {
  const game = room.game;
  if (!game) return;
  for (const player of room.players) {
    const state = game.getStateForPlayer(player.playerId);
    io.to(player.socketId).emit('game-state', state);
  }
}

function startGame(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const p1 = room.players[0].socketId;
  const p2 = room.mode === 'ai' ? 'ai' : room.players[1].socketId;
  const isAI = room.mode === 'ai';

  room.game = new GameEngine(p1, p2, {
    aiMode: isAI,
    aiDifficulty: room.aiDifficulty,
  });
  room.game.start();

  const playerNames = room.players.map(p => p.name);
  if (isAI) {
    const diffLabel = room.aiDifficulty.charAt(0).toUpperCase() + room.aiDifficulty.slice(1);
    playerNames.push(`Automated Peer (${diffLabel})`);
  }

  for (const player of room.players) {
    io.to(player.socketId).emit('game-start', {
      roomId: room.id,
      playerNames,
      playerId: player.playerId,
    });
  }

  emitGameState(room);
}

function handleAITurn(room) {
  const game = room.game;
  if (!game || game.gameOver || game.currentPlayer !== 2 || !game.aiMode) return;

  const timeoutId = setTimeout(() => {
    // Verify room still exists (M7)
    if (!roomManager.getRoom(room.id)) return;

    try {
      const aiMove = AI.chooseMove(game);
      if (!aiMove) {
        // AI has no valid moves — force resolve
        game._resolveRemainingBorders();
        if (!game.gameOver) {
          game.gameOver = true;
          game.winner = game.board.checkWinner();
        }
        emitGameState(room);
        if (game.gameOver) emitGameOver(room);
        return;
      }

      game.playCard(2, aiMove.cardIndex, aiMove.borderIndex);

      const claimable = game.getClaimableBorders(2);
      for (const borderId of claimable) {
        game.claimBorder(2, borderId);
      }

      game.endTurn(2);
      emitGameState(room);

      if (game.gameOver) {
        emitGameOver(room);
      }
    } catch (err) {
      console.error('AI error:', err.message);
    }
  }, 600);

  // Store timeout so it can be cleared on room destruction (M7)
  room.aiTimeout = timeoutId;
}

function emitGameOver(room) {
  const winnerName = getWinnerName(room);
  const summary = room.game.getSummary();
  for (const player of room.players) {
    io.to(player.socketId).emit('game-over', {
      winner: room.game.winner,
      winnerName,
      summary,
      playerId: player.playerId,
    });
  }
}

function getWinnerName(room) {
  if (room.game.winner === 2 && room.game.aiMode) {
    return 'Automated Peer';
  }
  const winnerPlayer = room.players.find(p => p.playerId === room.game.winner);
  return winnerPlayer ? winnerPlayer.name : 'Unknown';
}

// --- Socket handlers ---
io.on('connection', (socket) => {
  socket.on('create-room', (payload) => {
    if (isRateLimited(socket.id)) return;
    if (!payload || typeof payload !== 'object') return;

    const { mode, aiDifficulty } = payload;
    const playerName = sanitizeName(payload.playerName);

    if (!isValidString(mode, 10) || !VALID_MODES.includes(mode)) return;

    const difficulty = VALID_DIFFICULTIES.includes(aiDifficulty) ? aiDifficulty : 'medium';

    // Clean up any existing room for this socket
    const existingRoom = roomManager.getRoomBySocket(socket.id);
    if (existingRoom) {
      roomManager.destroyRoom(existingRoom.id);
    }

    const roomId = roomManager.createRoom(socket.id, playerName, mode, { aiDifficulty: difficulty });
    socket.join(roomId);

    if (mode === 'ai') {
      startGame(roomId);
    } else {
      socket.emit('room-created', { roomId, mode });
    }
  });

  socket.on('join-room', (payload) => {
    if (isRateLimited(socket.id)) return;
    if (!payload || typeof payload !== 'object') return;

    const { roomId } = payload;
    const playerName = sanitizeName(payload.playerName);

    if (!isValidString(roomId, 4)) return;

    const code = roomId.toUpperCase();

    // Prevent joining own room (M5)
    const existingRoom = roomManager.getRoomBySocket(socket.id);
    if (existingRoom && existingRoom.id === code) {
      return socket.emit('action-error', { message: 'Cannot join your own session' });
    }

    // Leave any current room first
    if (existingRoom) {
      roomManager.destroyRoom(existingRoom.id);
    }

    const result = roomManager.joinRoom(code, socket.id, playerName);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }
    socket.join(code);
    startGame(code);
  });

  socket.on('get-public-games', () => {
    if (isRateLimited(socket.id)) return;
    socket.emit('public-games', roomManager.getPublicGames());
  });

  socket.on('leave-room', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      if (room.aiTimeout) clearTimeout(room.aiTimeout);
      socket.leave(room.id);
      roomManager.destroyRoom(room.id);
    }
  });

  socket.on('play-card', (payload) => {
    if (isRateLimited(socket.id)) return;
    if (!payload || typeof payload !== 'object') return;

    const { cardIndex, borderIndex } = payload;
    if (!isValidInt(cardIndex, 0, 20)) return;
    if (!isValidInt(borderIndex, 0, 8)) return;

    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const playerId = roomManager.getPlayerIdBySocket(socket.id);
    try {
      room.game.playCard(playerId, cardIndex, borderIndex);
      emitGameState(room);

      if (room.game.gameOver) {
        emitGameOver(room);
      }
    } catch (err) {
      socket.emit('action-error', { message: safeErrorMessage(err) });
    }
  });

  socket.on('claim-border', (payload) => {
    if (isRateLimited(socket.id)) return;
    if (!payload || typeof payload !== 'object') return;

    const { borderIndex } = payload;
    if (!isValidInt(borderIndex, 0, 8)) return;

    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const playerId = roomManager.getPlayerIdBySocket(socket.id);
    try {
      room.game.claimBorder(playerId, borderIndex);
      emitGameState(room);

      if (room.game.gameOver) {
        emitGameOver(room);
      }
    } catch (err) {
      socket.emit('action-error', { message: safeErrorMessage(err) });
    }
  });

  socket.on('end-turn', () => {
    if (isRateLimited(socket.id)) return;

    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const playerId = roomManager.getPlayerIdBySocket(socket.id);
    try {
      room.game.endTurn(playerId);
      emitGameState(room);

      if (room.game.gameOver) {
        emitGameOver(room);
        return;
      }

      if (room.game.aiMode && room.game.currentPlayer === 2) {
        handleAITurn(room);
      }
    } catch (err) {
      socket.emit('action-error', { message: safeErrorMessage(err) });
    }
  });

  socket.on('disconnect', () => {
    rateLimitMap.delete(socket.id);
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      if (room.aiTimeout) clearTimeout(room.aiTimeout);
      for (const player of room.players) {
        if (player.socketId !== socket.id) {
          io.to(player.socketId).emit('opponent-disconnected');
        }
      }
      roomManager.destroyRoom(room.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
