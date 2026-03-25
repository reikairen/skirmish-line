class RoomManager {
  constructor() {
    this.rooms = new Map();       // roomId -> room object
    this.socketToRoom = new Map(); // socketId -> roomId
  }

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id;
    do {
      id = '';
      for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id));
    return id;
  }

  createRoom(socketId, playerName, mode, options = {}) {
    const roomId = this._generateRoomId();
    const room = {
      id: roomId,
      mode, // 'public', 'private', or 'ai'
      players: [{ socketId, name: playerName, playerId: 1 }],
      game: null,
      aiDifficulty: options.aiDifficulty || 'medium',
      createdAt: Date.now(),
      aiTimeout: null,
    };
    this.rooms.set(roomId, room);
    this.socketToRoom.set(socketId, roomId);
    return roomId;
  }

  joinRoom(roomId, socketId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.players.length >= 2) return { error: 'Room is full' };
    if (room.mode === 'ai') return { error: 'Cannot join an AI game' };

    room.players.push({ socketId, name: playerName, playerId: 2 });
    this.socketToRoom.set(socketId, roomId);
    return { room };
  }

  /**
   * Find and join the first available public room, or return null.
   */
  joinPublicRoom(socketId, playerName) {
    for (const [roomId, room] of this.rooms) {
      if (room.mode === 'public' && room.players.length === 1 && !room.game) {
        return this.joinRoom(roomId, socketId, playerName);
      }
    }
    return null;
  }

  /**
   * Get list of public rooms waiting for a player.
   */
  getPublicGames() {
    const games = [];
    for (const [roomId, room] of this.rooms) {
      if (room.mode === 'public' && room.players.length === 1 && !room.game) {
        games.push({
          roomId,
          hostName: room.players[0].name,
        });
      }
    }
    return games;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomBySocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId);
  }

  getPlayerIdBySocket(socketId) {
    const room = this.getRoomBySocket(socketId);
    if (!room) return null;
    const player = room.players.find(p => p.socketId === socketId);
    return player ? player.playerId : null;
  }

  removePlayer(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    this.socketToRoom.delete(socketId);

    if (room) {
      room.players = room.players.filter(p => p.socketId !== socketId);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
      }
      return room;
    }
    return null;
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      for (const p of room.players) {
        this.socketToRoom.delete(p.socketId);
      }
      this.rooms.delete(roomId);
    }
  }
}

module.exports = RoomManager;
