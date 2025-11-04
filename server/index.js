require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
	cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
});


// In-memory stores (for demo only)
const users = new Map(); // socketId -> { username }
const rooms = new Map(); // roomName -> Set(socketId)


io.on('connection', (socket) => {
console.log('socket connected', socket.id);


socket.on('join', ({ username }) => {
users.set(socket.id, { username });
// broadcast updated online list
io.emit('onlineUsers', Array.from(users.values()));
io.emit('notification', { message: `${username} joined` });
});


socket.on('message', (payload) => {
// payload: { room, text, from, ts }
if (payload.room === 'global') {
io.emit('message', payload);
} else {
// room broadcast
socket.to(payload.room).emit('message', payload);
}
});


socket.on('typing', ({ room, from, typing }) => {
socket.to(room || 'global').emit('typing', { from, typing });
});


socket.on('joinRoom', ({ room }) => {
socket.join(room);
if (!rooms.has(room)) rooms.set(room, new Set());
rooms.get(room).add(socket.id);
io.to(room).emit('notification', { message: `A user joined ${room}` });
});


socket.on('leaveRoom', ({ room }) => {
socket.leave(room);
if (rooms.has(room)) rooms.get(room).delete(socket.id);
io.to(room).emit('notification', { message: `A user left ${room}` });
});


// private message
socket.on('privateMessage', ({ toSocketId, payload }) => {
io.to(toSocketId).emit('privateMessage', { from: users.get(socket.id), payload });
});


// file upload helper: client should upload to server via REST and then emit event with file URL


socket.on('disconnect', () => {
const u = users.get(socket.id);
if (u) {
io.emit('notification', { message: `${u.username} left` });
}
users.delete(socket.id);
io.emit('onlineUsers', Array.from(users.values()));
});
});


const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));