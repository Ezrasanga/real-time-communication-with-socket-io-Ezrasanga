const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const { Server } = require('socket.io');
const Message = require('./models/Message');

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// mount API routes
const messageRoutes = require('./routes/messageRoutes');
const roomRoutes = require('./routes/roomRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/messages', messageRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Store online users
const onlineUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join', ({ username }) => {
    onlineUsers.set(socket.id, username);
    io.emit('onlineUsers', Array.from(onlineUsers.values()));
    console.log(`${username} joined the chat`);
  });

  socket.on('message', async (payload) => {
    try {
      const message = new Message({
        content: payload.content,
        from: payload.from,
        room: payload.room || 'general',
        timestamp: new Date()
      });
      await message.save();
      io.emit('message', message);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('privateMessage', async ({ toSocketId, payload }) => {
    try {
      const message = new Message({
        content: payload.content, 
        from: payload.from,
        to: onlineUsers.get(toSocketId),
        private: true,
        timestamp: new Date()
      });
      await message.save();
      io.to(toSocketId).emit('privateMessage', message);
      socket.emit('privateMessage', message);
    } catch (error) {
      console.error('Error saving private message:', error);
    }
  });

  socket.on('typing', ({ room, from, typing }) => {
    // Emit typing status to a specific room or broadcast to everyone if no room provided
    if (room) {
      socket.to(room).emit('typing', { from, typing });
    } else {
      socket.broadcast.emit('typing', { from, typing });
    }
  });

  socket.on('leaveRoom', ({ room }) => {
    socket.leave(room);
    console.log(`User left room: ${room}`);
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    io.emit('onlineUsers', Array.from(onlineUsers.values()));
    console.log(`${username || 'A user'} disconnected`);
  });
});

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});