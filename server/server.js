const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const { Server } = require('socket.io');
const Message = require('./models/Message');
const { socketAuth } = require('./middleware/clerkAuth');

// Load environment variables
dotenv.config();

// --- MongoDB connection helper (added) ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';

async function connectWithRetry(retries = 5, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error('All MongoDB connection attempts failed.');
        // don't exit automatically in dev — allow process to continue so server shows error
        // process.exit(1);
      }
    }
  }
}

connectWithRetry();
// --- end MongoDB helper ---

const app = express();
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// NEW: mount routes (ensure these files exist)
try {
  const roomRoutes = require('./routes/roomRoutes');
  app.use('/api/rooms', roomRoutes);
} catch (err) {
  console.warn('Room routes not mounted:', err.message);
}

// if you have message routes, ensure they are mounted too
try {
  const msgRoutes = require('./routes/messageRoutes');
  app.use('/api/messages', msgRoutes);
} catch (err) {
  console.warn('Message routes not mounted:', err.message);
}

// Add DB status route for quick checks
app.get('/dbstatus', (req, res) => {
  // mongoose.connection.readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const state = mongoose.connection.readyState;
  const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ state, status: stateMap[state] || 'unknown' });
});

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// expose io to route handlers/controllers via app
app.set('io', io);

// apply socket auth middleware
io.use(socketAuth);

// Store online users (socketId -> username)
// helper to return array of { socketId, username }
const onlineUsers = new Map();
const onlineUsersArray = () => Array.from(onlineUsers.entries()).map(([socketId, username]) => ({ socketId, username }));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // send current rooms list to the new client
  (async () => {
    try {
      const Room = require('./models/Room');
      const rooms = await Room.find({}).lean();
      // send minimal info (name and id)
      socket.emit('roomsList', rooms.map(r => ({ id: r._id, name: r.name })));
    } catch (err) {
      socket.emit('roomsList', []);
    }
  })();

  // use clerk-verified username if available
  const autoUsername = socket.clerkUser?.username || socket.clerkUser?.email || null;
  if (autoUsername) {
    onlineUsers.set(socket.id, autoUsername);
    io.emit('onlineUsers', onlineUsersArray());
  }

  // notify others when user joins
  socket.on('join', ({ username }) => {
    const name = socket.clerkUser?.username || username || null;
    if (!name) return;
    onlineUsers.set(socket.id, name);
    io.emit('onlineUsers', onlineUsersArray());
    socket.broadcast.emit('notification', { type: 'presence', message: `${name} joined` });

    // auto-join default room and send recent history
    const defaultRoom = 'global';
    socket.join(defaultRoom);
    (async () => {
      try {
        const limit = 50;
        const msgs = await Message.find({ room: defaultRoom }).sort({ timestamp: -1 }).limit(limit).lean();
        socket.emit('roomMessages', { room: defaultRoom, messages: msgs.reverse() });
      } catch (err) {
        socket.emit('roomMessages', { room: defaultRoom, messages: [] });
      }
    })();
  });

  socket.on('message', async (payload) => {
    try {
      const message = new Message({
        content: payload.content,
        from: payload.from,
        room: payload.room || 'global',
        timestamp: new Date()
      });
      await message.save();
      io.to(message.room).emit('message', message);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // private messages - save + notify recipient with event + notification
  socket.on('privateMessage', async ({ toSocketId, payload }) => {
    try {
      const toUsername = onlineUsers.get(toSocketId) || null;
      const message = new Message({
        content: payload.content,
        from: payload.from,
        to: toUsername,
        private: true,
        room: null,
        timestamp: new Date()
      });
      await message.save();

      // send message to recipient socket and sender
      io.to(toSocketId).emit('privateMessage', message);
      socket.emit('privateMessage', message);

      // push a notification to recipient
      io.to(toSocketId).emit('notification', {
        type: 'message',
        title: `New message from ${message.from}`,
        body: message.content,
        messageId: message._id,
        private: true
      });
    } catch (error) {
      console.error('Error saving private message:', error);
    }
  });

  // reactions on messages
  socket.on('reaction', async ({ messageId, emoji, by }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      // find existing reaction
      let r = msg.reactions.find(x => x.emoji === emoji);
      if (!r) {
        msg.reactions.push({ emoji, users: [by], count: 1 });
      } else {
        if (r.users.includes(by)) {
          // remove user's reaction (toggle)
          r.users = r.users.filter(u => u !== by);
          r.count = r.users.length;
          if (r.count === 0) {
            msg.reactions = msg.reactions.filter(x => x.emoji !== emoji);
          }
        } else {
          r.users.push(by);
          r.count = r.users.length;
        }
      }

      await msg.save();

      // emit reaction update to interested sockets
      if (msg.private) {
        // notify sender and recipient if online
        const targets = [];
        for (const [sid, uname] of onlineUsers.entries()) {
          if (uname === msg.from || uname === msg.to) targets.push(sid);
        }
        targets.forEach(sid => io.to(sid).emit('messageReaction', msg));
        // notify the other party (not the reactor) with a notification event
        targets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit('notification', {
              type: 'reaction',
              title: `${by} reacted`,
              body: `${by} reacted ${emoji} to a message`,
              messageId: msg._id,
              private: true
            });
          }
        });
      } else {
        // public: broadcast to room
        const room = msg.room || 'global';
        io.to(room).emit('messageReaction', msg);
        socket.to(room).emit('notification', {
          type: 'reaction',
          title: `${by} reacted`,
          body: `${by} reacted ${emoji}`,
          messageId: msg._id,
          private: false
        });
      }
    } catch (err) {
      console.error('reaction handler error', err);
    }
  });

  // add this block to handle client `joinRoom` emits
  socket.on('joinRoom', async ({ room }) => {
    try {
      if (!room) return;
      // join the socket to the requested room
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);

      // emit updated online users (optional)
      io.emit('onlineUsers', onlineUsersArray());

      // send recent room history to the joining socket
      try {
        const limit = 50;
        const msgs = await Message.find({ room }).sort({ timestamp: -1 }).limit(limit).lean();
        socket.emit('roomMessages', { room, messages: msgs.reverse() });
      } catch (err) {
        console.warn('Failed to load room messages for', room, err.message);
        socket.emit('roomMessages', { room, messages: [] });
      }
    } catch (err) {
      console.error('joinRoom handler error', err);
    }
  });

  // existing leaveRoom handler should already exist:
  // socket.on('leaveRoom', ({ room }) => { socket.leave(room); ... });
  // ...existing handlers...

  // presence disconnect notification
  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    io.emit('onlineUsers', onlineUsersArray());
    socket.broadcast.emit('notification', { type: 'presence', message: `${username || 'A user'} left` });
    console.log(`${username || 'A user'} disconnected`);
  });
});

// graceful shutdown for mongoose
process.on('SIGINT', async () => {
  console.log('SIGINT received: closing MongoDB connection');
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (err) {
    console.error('Error disconnecting MongoDB:', err);
  }
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});