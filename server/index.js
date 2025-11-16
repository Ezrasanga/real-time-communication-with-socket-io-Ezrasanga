const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory stores (for demo). Replace with DB for production.
const MESSAGES = []; // {id, room, senderId, senderName, text, timestamp, reactions, readBy}
const ONLINE = new Map(); // socketId -> {userId, userName}
const USERS_BY_ID = new Map(); // userId -> {userName, sockets: Set(socketId)}

// New: Rooms store (in-memory demo)
const ROOMS = new Map(); // roomName -> { name, messages: [{...}], createdBy, createdAt }

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  // pingInterval/timeout can be tuned for production
});

const GLOBAL_ROOM = "global";

// Helper to stub-verify token -> user object
function verifyTokenStub(token) {
  // Production: use Clerk backend SDK to verify token and extract user id/name
  // This stub accepts any non-empty token and returns a synthetic user
  if (!token) return null;
  // Basic deterministic pseudo-user for demo
  const userId = token.slice(0, 8);
  const userName = `user-${userId}`;
  return { userId, userName };
}

// Helper to list rooms as array
function listRooms() {
  return Array.from(ROOMS.entries()).map(([name, info]) => ({ name: info.name, createdBy: info.createdBy, createdAt: info.createdAt, count: info.messages.length }));
}

io.on("connection", (socket) => {
  // Log handshake auth so we can verify what token / user info arrived
  console.info("[socket] connection handshake.auth:", socket.handshake.auth);

  const token = socket.handshake.auth?.token;
  const handshakeUserId = socket.handshake.auth?.userId;
  const handshakeUserName = socket.handshake.auth?.userName;

  // Prefer explicit handshake user info; otherwise fall back to token verification; otherwise anon id
  const verified = verifyTokenStub(token); // may be null
  const userId = handshakeUserId || (verified && verified.userId) || `anon-${socket.id.slice(0, 6)}`;
  const userName = handshakeUserName || (verified && verified.userName) || "Anonymous";

  const user = { userId, userName };

  // Register online: ensure a single USERS_BY_ID entry per userId, and add this socket to its set
  if (!USERS_BY_ID.has(user.userId)) {
    USERS_BY_ID.set(user.userId, { userName: user.userName, sockets: new Set() });
  } else {
    // update stored display name if it differs (optional)
    const existing = USERS_BY_ID.get(user.userId);
    if (existing.userName !== user.userName) existing.userName = user.userName;
  }
  USERS_BY_ID.get(user.userId).sockets.add(socket.id);
  ONLINE.set(socket.id, { userId: user.userId, userName: user.userName });

  // Join global room by default
  socket.join(GLOBAL_ROOM);

  // Emit rooms list immediately
  socket.emit("rooms", listRooms());

  // Emit initial users and recent global messages
  (function emitInitialUsers() {
    const users = Array.from(USERS_BY_ID.entries()).map(([id, info]) => ({ id, name: info.userName, online: info.sockets.size > 0 }));
    console.info("[users] emitInitialUsers ->", users.length);
    socket.emit("users", users);
  })();

  const recent = MESSAGES.slice(-50);
  socket.emit("recent_messages", recent);

  // Notify current online list to all clients
  function broadcastUsers() {
    const users = Array.from(USERS_BY_ID.entries()).map(([id, info]) => ({ id, name: info.userName, online: info.sockets.size > 0 }));
    console.info(`[users] broadcast ${users.length} users`, users);
    io.emit("users", users);
  }
  broadcastUsers();

  // Notify join
  io.to(GLOBAL_ROOM).emit("notification", { type: "user_join", user: { id: user.userId, name: user.userName } });

  // ROOM: create room via socket
  socket.on("create_room", ({ name }, ack) => {
    if (!name) return ack && ack({ ok: false, error: "name required" });
    if (ROOMS.has(name)) return ack && ack({ ok: false, error: "room exists" });
    ROOMS.set(name, { name, createdBy: user.userId, createdAt: Date.now(), messages: [] });
    // broadcast new rooms list
    io.emit("rooms", listRooms());
    if (typeof ack === "function") ack({ ok: true, room: ROOMS.get(name) });
  });

  // ROOM: join room
  socket.on("join_room", ({ room }, ack) => {
    if (!room) return ack && ack({ ok: false, error: "room required" });
    // ensure room exists
    if (!ROOMS.has(room)) {
      // create on-demand (optional) or return error
      ROOMS.set(room, { name: room, createdBy: user.userId, createdAt: Date.now(), messages: [] });
      io.emit("rooms", listRooms());
    }
    socket.join(room);

    // send recent messages for that room
    const roomMsgs = ROOMS.get(room).messages.slice(-100);
    socket.emit("room_messages", { room, messages: roomMsgs });

    // compute users in room (by socket ids in adapter)
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    const roomUsers = Array.from(socketsInRoom).map((sid) => {
      const online = ONLINE.get(sid);
      return online ? { id: online.userId, name: online.userName } : null;
    }).filter(Boolean);

    io.to(room).emit("room_users", { room, users: roomUsers });

    if (typeof ack === "function") ack({ ok: true, room, messages: roomMsgs });
  });

  // ROOM: leave room
  socket.on("leave_room", ({ room }, ack) => {
    if (!room) return ack && ack({ ok: false, error: "room required" });
    socket.leave(room);
    // recompute and broadcast room users
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    const roomUsers = Array.from(socketsInRoom).map((sid) => {
      const online = ONLINE.get(sid);
      return online ? { id: online.userId, name: online.userName } : null;
    }).filter(Boolean);
    io.to(room).emit("room_users", { room, users: roomUsers });
    if (typeof ack === "function") ack({ ok: true, room });
  });

  // Handle incoming global message
  socket.on("message", (payload, ack) => {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      room: payload.room || GLOBAL_ROOM,
      senderId: user.userId,
      senderName: user.userName,
      text: payload.text,
      timestamp: Date.now(),
      reactions: {},
      readBy: [],
    };
    MESSAGES.push(msg);
    // Keep memory bounded (demo)
    if (MESSAGES.length > 2000) MESSAGES.shift();

    // store if room is tracked
    if (ROOMS.has(msg.room)) {
      ROOMS.get(msg.room).messages.push(msg);
      // keep bounded
      if (ROOMS.get(msg.room).messages.length > 2000) ROOMS.get(msg.room).messages.shift();
    }

    // Broadcast to the room (works for global and named rooms)
    io.to(msg.room).emit("message", msg);
    // Ack to sender
    if (typeof ack === "function") ack({ ok: true, id: msg.id, ts: msg.timestamp });
  });

  // Typing indicator
  socket.on("typing", ({ room, isTyping }) => {
    socket.to(room || GLOBAL_ROOM).emit("typing", { userId: user.userId, userName: user.userName, isTyping });
  });

  // Private message
  socket.on("private_message", ({ toUserId, text }, ack) => {
    // Find sockets for target user
    const target = USERS_BY_ID.get(toUserId);
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      room: `pm:${[user.userId, toUserId].sort().join("-")}`,
      senderId: user.userId,
      senderName: user.userName,
      text,
      timestamp: Date.now(),
      private: true,
    };
    // Save (optional): store in MESSAGES for history
    MESSAGES.push(msg);
    if (target) {
      target.sockets.forEach((sid) => io.to(sid).emit("private_message", msg));
      // notify recipient (server-side)
      target.sockets.forEach((sid) => io.to(sid).emit("notification", { type: "private_message", from: { id: user.userId, name: user.userName }, preview: text.slice(0, 120) }));
    }
    // send to sender as well
    socket.emit("private_message", msg);
    if (typeof ack === "function") ack({ ok: true, id: msg.id });
  });

  // Pagination / load older messages
  socket.on("load_older", ({ room, beforeTimestamp, limit = 30 }, ack) => {
    const roomMsgs = MESSAGES.filter((m) => m.room === (room || GLOBAL_ROOM) && m.timestamp < (beforeTimestamp || Date.now()));
    // return most recent `limit` messages older than beforeTimestamp
    const slice = roomMsgs.slice(Math.max(0, roomMsgs.length - limit), roomMsgs.length);
    if (typeof ack === "function") ack({ ok: true, messages: slice });
  });

  // Read receipts
  socket.on("mark_read", ({ messageId }) => {
    const m = MESSAGES.find((mm) => mm.id === messageId);
    if (m && !m.readBy.includes(user.userId)) {
      m.readBy.push(user.userId);
      // Optionally notify sender
      io.to(GLOBAL_ROOM).emit("message_read", { messageId, userId: user.userId });
    }
  });

  socket.on("disconnect", () => {
    // cleanup
    ONLINE.delete(socket.id);
    const userEntry = USERS_BY_ID.get(user.userId);
    if (userEntry) {
      userEntry.sockets.delete(socket.id);
      if (userEntry.sockets.size === 0) {
        USERS_BY_ID.delete(user.userId);
        io.emit("notification", { type: "user_leave", user: { id: user.userId, name: user.userName } });
      }
    }
    // broadcast updated users and rooms (rooms don't auto-delete here)
    const users = Array.from(USERS_BY_ID.entries()).map(([id, info]) => ({ id, name: info.userName, online: info.sockets.size > 0 }));
    io.emit("users", users);
  });
});

// Provide a simple root response so GET / doesn't return 404 in the browser/devtools
app.get("/", (req, res) => {
  res.send("Realtime Socket.IO server is running");
});

// Minimal health endpoint
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/rooms", (req, res) => {
  res.json({ ok: true, rooms: listRooms() });
});
app.post("/rooms", (req, res) => {
  const { name, createdBy } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  if (ROOMS.has(name)) return res.status(409).json({ ok: false, error: "room exists" });
  ROOMS.set(name, { name, createdBy: createdBy || "unknown", createdAt: Date.now(), messages: [] });
  // broadcast rooms update
  io.emit("rooms", listRooms());
  return res.json({ ok: true, room: ROOMS.get(name) });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
