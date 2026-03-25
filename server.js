const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./game/GameEngine');
const AI = require('./game/AI');
const RoomManager = require('./rooms/RoomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager();

app.use(express.static(path.join(__dirname, 'public')));

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

  setTimeout(() => {
    try {
      const aiMove = AI.chooseMove(game);
      if (!aiMove) return;

      game.playCard(2, aiMove.cardIndex, aiMove.borderIndex);

      // AI auto-claims any claimable borders
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

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anon';
  return name.trim().slice(0, 20) || 'Anon';
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('create-room', ({ playerName, mode, aiDifficulty }) => {
    playerName = sanitizeName(playerName);
    // Clean up any existing room for this socket
    const existingRoom = roomManager.getRoomBySocket(socket.id);
    if (existingRoom) {
      roomManager.destroyRoom(existingRoom.id);
    }

    const roomId = roomManager.createRoom(socket.id, playerName, mode, { aiDifficulty });
    socket.join(roomId);

    if (mode === 'ai') {
      // AI game starts immediately
      startGame(roomId);
    } else {
      // Online game — notify creator and wait for opponent
      socket.emit('room-created', { roomId, mode });
    }
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    playerName = sanitizeName(playerName);
    const result = roomManager.joinRoom(roomId.toUpperCase(), socket.id, playerName);
    if (result.error) {
      return socket.emit('action-error', { message: result.error });
    }
    socket.join(roomId.toUpperCase());
    startGame(roomId.toUpperCase());
  });

  socket.on('get-public-games', () => {
    socket.emit('public-games', roomManager.getPublicGames());
  });

  socket.on('leave-room', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      socket.leave(room.id);
      roomManager.destroyRoom(room.id);
    }
  });

  socket.on('play-card', ({ cardIndex, borderIndex }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('action-error', { message: 'Not in a game' });

    const playerId = roomManager.getPlayerIdBySocket(socket.id);
    try {
      room.game.playCard(playerId, cardIndex, borderIndex);
      emitGameState(room);

      if (room.game.gameOver) {
        emitGameOver(room);
      }
    } catch (err) {
      socket.emit('action-error', { message: err.message });
    }
  });

  socket.on('claim-border', ({ borderIndex }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('action-error', { message: 'Not in a game' });

    const playerId = roomManager.getPlayerIdBySocket(socket.id);
    try {
      room.game.claimBorder(playerId, borderIndex);
      emitGameState(room);

      if (room.game.gameOver) {
        emitGameOver(room);
      }
    } catch (err) {
      socket.emit('action-error', { message: err.message });
    }
  });

  socket.on('end-turn', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('action-error', { message: 'Not in a game' });

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
      socket.emit('action-error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      for (const player of room.players) {
        if (player.socketId !== socket.id) {
          io.to(player.socketId).emit('opponent-disconnected');
        }
      }
      roomManager.destroyRoom(room.id);
    }
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
