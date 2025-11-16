const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// --- existing in-memory stores / helpers (keep or merge with your current code) ---
const MESSAGES = []; // global archive
const ONLINE = new Map(); // socketId -> { userId, userName }
const USERS_BY_ID = new Map(); // userId -> { userName, sockets: Set(socketId) }

// Rooms store (pre-seeded)
const now = Date.now();
const ROOMS = new Map([
  [
    "General",
    {
      name: "General",
      createdBy: "system",
      createdAt: now,
      messages: [
        {
          id: `init-${now}-1`,
          room: "General",
          senderId: "system",
          senderName: "System",
          text: "Welcome to the General room — say hi 👋",
          timestamp: now - 1000 * 60 * 60,
        },
        {
          id: `init-${now}-2`,
          room: "General",
          senderId: "system",
          senderName: "System",
          text: "Tip: create or join other rooms from the sidebar.",
          timestamp: now - 1000 * 60 * 30,
        },
      ],
    },
  ],
  [
    "Developers",
    {
      name: "Developers",
      createdBy: "system",
      createdAt: now,
      messages: [
        {
          id: `init-${now}-3`,
          room: "Developers",
          senderId: "system",
          senderName: "System",
          text: "Welcome to Developers — share tips, snippets and bugs.",
          timestamp: now - 1000 * 60 * 45,
        },
        {
          id: `init-${now}-4`,
          room: "Developers",
          senderId: "system",
          senderName: "System",
          text: "Remember: messages here are ephemeral in this demo (in-memory).",
          timestamp: now - 1000 * 60 * 15,
        },
      ],
    },
  ],
]);

const GLOBAL_ROOM = "global";

// helper to list rooms
function listRooms() {
  return Array.from(ROOMS.values()).map((info) => ({
    name: info.name,
    createdBy: info.createdBy,
    createdAt: info.createdAt,
    count: info.messages.length,
  }));
}

// stub token verification (replace with real Clerk verification in production)
function verifyTokenStub(token) {
  if (!token) return null;
  const userId = String(token).slice(0, 8);
  const userName = `user-${userId}`;
  return { userId, userName };
}

// HTTP endpoints for debugging / quick UI use
app.get("/", (req, res) => res.send("Realtime Socket.IO server is running"));
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/rooms", (req, res) => {
  res.json({ ok: true, rooms: listRooms() });
});
app.post("/rooms", (req, res) => {
  const { name, createdBy } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  if (ROOMS.has(name)) return res.status(409).json({ ok: false, error: "room exists" });
  ROOMS.set(name, { name, createdBy: createdBy || "unknown", createdAt: Date.now(), messages: [] });
  io && io.emit && io.emit("rooms", listRooms());
  return res.json({ ok: true, room: ROOMS.get(name) });
});

// --- Add: message search endpoint ---
// GET /messages/search?q=term&room=roomName&limit=100
app.get("/messages/search", (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const room = req.query.room;
    const limit = Math.min(parseInt(req.query.limit || "100", 10), 1000);
    if (!q) return res.status(400).json({ ok: false, error: "query param `q` required" });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const results = MESSAGES.filter((m) => {
      if (room && (m.room || "global") !== room) return false;
      return Boolean((m.text || m.content || "").toString().match(regex) || (m.senderName || m.from || "").toString().match(regex));
    }).slice(-limit);
    return res.json({ ok: true, results });
  } catch (err) {
    console.error("[http] /messages/search error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// --- Add: message pagination endpoint ---
// GET /messages/paginate?room=roomName&before=timestamp&limit=50
app.get("/messages/paginate", (req, res) => {
  try {
    const room = req.query.room || GLOBAL_ROOM;
    const before = parseInt(req.query.before || Date.now(), 10);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const roomMsgs = MESSAGES.filter((m) => (m.room || GLOBAL_ROOM) === room && (m.timestamp || Date.now()) < before);
    // return the most recent `limit` older than before
    const slice = roomMsgs.slice(Math.max(0, roomMsgs.length - limit), roomMsgs.length);
    return res.json({ ok: true, messages: slice });
  } catch (err) {
    console.error("[http] /messages/paginate error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// create HTTP server + socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  path: "/socket.io",
});

// safe handler helper
function safeHandler(fn, eventName) {
  return (...args) => {
    try {
      fn(...args);
    } catch (err) {
      console.error(`[socket] handler error (${eventName}):`, err);
      const last = args[args.length - 1];
      if (typeof last === "function") {
        try { last({ ok: false, error: "server_error" }); } catch (e) {}
      }
    }
  };
}

// --- Add: authoritative users broadcaster (canonical shape + numeric count) ---
function broadcastUsers() {
	try {
		const users = Array.from(USERS_BY_ID.entries()).map(([id, info]) => ({
			id,
			name: info.userName,
			online: info.sockets.size > 0,
		}));
		io.emit("users", users);
		io.emit("users_count", users.filter(u => u.online).length);
	} catch (err) {
		console.error("[server] broadcastUsers error", err);
	}
}
// --- end added ---

io.on("connection", (socket) => {
  console.info("[socket] connection handshake.auth:", socket.handshake.auth);

  // prefer handshake user info if provided, otherwise verify token
  const token = socket.handshake.auth?.token;
  const handshakeUserId = socket.handshake.auth?.userId;
  const handshakeUserName = socket.handshake.auth?.userName;

  const verified = verifyTokenStub(token); // replace with real verification if available
  const userId = handshakeUserId || (verified && verified.userId) || `anon-${socket.id.slice(0,6)}`;
  const userName = handshakeUserName || (verified && verified.userName) || "Anonymous";
  const user = { userId, userName };

  // register user -> ensure single USERS_BY_ID entry per userId
  if (!USERS_BY_ID.has(userId)) {
    USERS_BY_ID.set(userId, { userName: userName, sockets: new Set() });
  } else {
    const existing = USERS_BY_ID.get(userId);
    if (existing.userName !== userName) existing.userName = userName;
  }
  USERS_BY_ID.get(userId).sockets.add(socket.id);
  ONLINE.set(socket.id, { userId, userName });

  // join global room by default
  socket.join(GLOBAL_ROOM);

  // send initial sync: rooms, users, recent global messages
  socket.emit("rooms", listRooms());
  // use broadcastUsers so all clients see the canonical list + count
  broadcastUsers();

  const recent = MESSAGES.slice(-50);
  socket.emit("recent_messages", recent);

  // Notify current room (join) and broadcast users (already done)
  io.to(GLOBAL_ROOM).emit("notification", { type: "user_join", user: { id: userId, name: userName } });

  // --- Add/ensure: handle explicit client join announcement (username) ---
  socket.on("join", safeHandler(({ username }, ack) => {
    try {
      const uname = (username || userName || "Anonymous").toString().trim();
      const canonicalId = socket.handshake?.auth?.userId || userId || `anon-${socket.id.slice(0,6)}`;

      if (!USERS_BY_ID.has(canonicalId)) {
        USERS_BY_ID.set(canonicalId, { userName: uname, sockets: new Set() });
      } else {
        const existing = USERS_BY_ID.get(canonicalId);
        if (existing.userName !== uname) existing.userName = uname;
      }
      USERS_BY_ID.get(canonicalId).sockets.add(socket.id);
      ONLINE.set(socket.id, { userId: canonicalId, userName: uname });

      console.info("[server] join:", socket.id, "as", uname, "canonicalId:", canonicalId);
      broadcastUsers();

      if (typeof ack === "function") ack({ ok: true, id: canonicalId, name: uname });
    } catch (err) {
      console.error("[server] join handler error", err);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  }, "join"));
  // --- end join handler ---

  // create_room (safer)
  socket.on("create_room", safeHandler(({ name }, ack) => {
    const roomName = (name || "").toString().trim();
    console.info("[server] create_room request from socket:", socket.id, "user:", user?.userId, user?.userName, "name:", roomName);
    if (!roomName) return ack && ack({ ok: false, error: "name required" });
    if (ROOMS.has(roomName)) {
      console.info("[server] create_room: room exists:", roomName);
      return ack && ack({ ok: false, error: "room exists" });
    }
    ROOMS.set(roomName, { name: roomName, createdBy: user.userId || "unknown", createdAt: Date.now(), messages: [] });
    console.info("[server] create_room: created", roomName);
    // broadcast updated rooms list
    io.emit("rooms", listRooms());
    if (typeof ack === "function") ack({ ok: true, room: ROOMS.get(roomName) });
  }, "create_room"));

  // allow clients to request the current rooms snapshot on demand
  socket.on("rooms_request", safeHandler((_, ack) => {
    console.info("[server] rooms_request from socket:", socket.id);
    const rooms = listRooms();
    socket.emit("rooms", rooms);
    if (typeof ack === "function") ack({ ok: true, rooms });
  }, "rooms_request"));

  // ROOM: join_room
  socket.on("join_room", safeHandler(({ room }, ack) => {
    const roomName = (room || "").toString().trim();
    if (!roomName) return ack && ack({ ok: false, error: "room required" });

    // create room on demand
    if (!ROOMS.has(roomName)) {
      ROOMS.set(roomName, { name: roomName, createdBy: user.userId || "unknown", createdAt: Date.now(), messages: [] });
      io.emit("rooms", listRooms());
    }

    socket.join(roomName);
    console.info(`[server] socket ${socket.id} joined room ${roomName}`);

    // send recent messages for that room to the joining socket
    const roomMsgs = ROOMS.get(roomName).messages.slice(-100);
    socket.emit("room_messages", { room: roomName, messages: roomMsgs });

    // compute and broadcast room users
    const socketsInRoom = io.sockets.adapter.rooms.get(roomName) || new Set();
    const roomUsers = Array.from(socketsInRoom).map((sid) => {
      const online = ONLINE.get(sid);
      return online ? { id: online.userId, name: online.userName } : null;
    }).filter(Boolean);
    io.to(roomName).emit("room_users", { room: roomName, users: roomUsers });

    if (typeof ack === "function") ack({ ok: true, room: roomName, messages: roomMsgs });
  }, "join_room"));

  // ROOM: leave_room
  socket.on("leave_room", safeHandler(({ room }, ack) => {
    if (!room) return ack && ack({ ok: false, error: "room required" });
    socket.leave(room);
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    const roomUsers = Array.from(socketsInRoom).map((sid) => ONLINE.get(sid)).filter(Boolean).map(o => ({ id: o.userId, name: o.userName }));
    io.to(room).emit("room_users", { room, users: roomUsers });
    if (typeof ack === "function") ack({ ok: true, room });
  }, "leave_room"));

  // message: save to global and room stores, broadcast to room
  socket.on("message", safeHandler((payload, ack) => {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      room: payload.room || GLOBAL_ROOM,
      senderId: userId,
      senderName: userName,
      text: payload.text,
      timestamp: Date.now(),
      private: payload.private || false,
    };
    // global archive
    MESSAGES.push(msg);
    if (ROOMS.has(msg.room)) {
      ROOMS.get(msg.room).messages.push(msg);
      if (ROOMS.get(msg.room).messages.length > 2000) ROOMS.get(msg.room).messages.shift();
    }
    io.to(msg.room).emit("message", msg);
    if (typeof ack === "function") ack({ ok: true, id: msg.id, ts: msg.timestamp });
  }, "message"));

  // private message
  socket.on("private_message", safeHandler(({ toUserId, text }, ack) => {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      room: `pm:${[userId, toUserId].sort().join("-")}`,
      senderId: userId,
      senderName: userName,
      text,
      timestamp: Date.now(),
      private: true,
    };
    MESSAGES.push(msg);
    const target = USERS_BY_ID.get(toUserId);
    if (target) {
      target.sockets.forEach((sid) => io.to(sid).emit("private_message", msg));
    }
    // echo back to sender
    socket.emit("private_message", msg);
    if (typeof ack === "function") ack({ ok: true, id: msg.id });
  }, "private_message"));

  // --- Add: mark_read socket handler to implement read receipts ---
  socket.on("mark_read", safeHandler(({ messageId }, ack) => {
    try {
      if (!messageId) return ack && ack({ ok: false, error: "messageId required" });
      const m = MESSAGES.find((mm) => mm.id === messageId);
      if (!m) return ack && ack({ ok: false, error: "message not found" });

      // only push once
      const readerId = user.userId;
      if (!m.readBy) m.readBy = [];
      if (!m.readBy.includes(readerId)) {
        m.readBy.push(readerId);
      }

      // notify room and sender about the read receipt
      const room = m.room || GLOBAL_ROOM;
      io.to(room).emit("message_read", { messageId: m.id, userId: readerId });
      // also notify the original sender's sockets (if known)
      const senderEntry = USERS_BY_ID.get(m.senderId);
      if senderEntry) {
        senderEntry.sockets.forEach((sid) => io.to(sid).emit("message_read", { messageId: m.id, userId: readerId }));
      }

      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("[socket] mark_read handler error", err);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  }, "mark_read"));

  // Add: helper to broadcast canonical users list
  function broadcastUsers() {
    try {
      const users = Array.from(USERS_BY_ID.entries()).map(([id, info]) => ({
        id,
        name: info.userName,
        online: info.sockets.size > 0,
      }));
      // emit both structured list and authoritative count
      io.emit("users", users);
      io.emit("users_count", users.filter(u => u.online).length);
    } catch (err) {
      console.error("[server] broadcastUsers error", err);
    }
  }

  // Add: client announces username -> register socket under a canonical user entry and broadcast
  socket.on("join", safeHandler(({ username }, ack) => {
    try {
      const uname = (username || "Anonymous").toString().trim();
      // prefer stable userId sent in handshake.auth, otherwise create per-socket anon id
      const handshakeId = socket.handshake?.auth?.userId;
      const canonicalId = handshakeId || `anon-${socket.id.slice(0, 6)}`;

      // ensure USERS_BY_ID entry exists
      if (!USERS_BY_ID.has(canonicalId)) {
        USERS_BY_ID.set(canonicalId, { userName: uname, sockets: new Set() });
      } else {
        const existing = USERS_BY_ID.get(canonicalId);
        if (existing.userName !== uname) existing.userName = uname;
      }

      // attach this socket id
      USERS_BY_ID.get(canonicalId).sockets.add(socket.id);
      ONLINE.set(socket.id, { userId: canonicalId, userName: uname });

      console.info("[server] join:", socket.id, "as", uname, "canonicalId:", canonicalId);
      broadcastUsers();

      if (typeof ack === "function") ack({ ok: true, id: canonicalId, name: uname });
    } catch (err) {
      console.error("[server] join handler error", err);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  }, "join"));

  // --- existing handlers follow (create_room, rooms_request, join_room, message, private_message, etc.) ---
  socket.on("disconnect", () => {
    try {
      ONLINE.delete(socket.id);
      // remove socket from USERS_BY_ID sets
      for (const [userId, info] of USERS_BY_ID.entries()) {
        if (info.sockets.has(socket.id)) {
          info.sockets.delete(socket.id);
          if (info.sockets.size === 0) {
            USERS_BY_ID.delete(userId);
            io.emit("notification", { type: "user_leave", user: { id: userId, name: info.userName } });
          }
        }
      }
      // broadcast updated users list
      broadcastUsers();
    } catch (err) {
      console.error("[socket] disconnect cleanup error:", err);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
