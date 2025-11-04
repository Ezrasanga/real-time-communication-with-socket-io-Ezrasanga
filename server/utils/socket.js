const { Server } = require('socket.io');
const Message = require('../models/Message');

function initSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    const onlineUsers = new Map();

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('join', ({ username }) => {
            if (username) {
                onlineUsers.set(socket.id, username);
                io.emit('onlineUsers', Array.from(onlineUsers.values()));
                console.log(`${username} joined (${socket.id})`);
            }
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
            } catch (err) {
                console.error('Error saving message:', err);
            }
        });

        socket.on('privateMessage', async ({ toSocketId, payload }) => {
            try {
                const toUsername = onlineUsers.get(toSocketId) || null;
                const message = new Message({
                    content: payload.content,
                    from: payload.from,
                    to: toUsername,
                    private: true,
                    timestamp: new Date()
                });
                await message.save();
                io.to(toSocketId).emit('privateMessage', message);
                socket.emit('privateMessage', message);
            } catch (err) {
                console.error('Error saving private message:', err);
            }
        });

        socket.on('typing', ({ room, from, typing }) => {
            if (room) {
                socket.to(room).emit('typing', { from, typing });
            } else {
                socket.broadcast.emit('typing', { from, typing });
            }
        });

        socket.on('joinRoom', ({ room }) => {
            if (room) {
                socket.join(room);
                console.log(`${socket.id} joined room ${room}`);
            }
        });

        socket.on('leaveRoom', ({ room }) => {
            if (room) {
                socket.leave(room);
                console.log(`${socket.id} left room ${room}`);
            }
        });

        socket.on('disconnect', () => {
            const username = onlineUsers.get(socket.id);
            onlineUsers.delete(socket.id);
            io.emit('onlineUsers', Array.from(onlineUsers.values()));
            console.log(`${username || 'A user'} disconnected (${socket.id})`);
        });
    });

    return io;
}

module.exports = { initSocket };