module.exports = function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('joinRoom', ({ room }) => {
      try { socket.join(room); console.log(`${socket.id} joined ${room}`); }
      catch(e) { console.error(e); }
    });

    socket.on('leaveRoom', ({ room }) => {
      try { socket.leave(room); console.log(`${socket.id} left ${room}`); }
      catch(e) { console.error(e); }
    });

    // server-side private message relay: expects { toSocketId, payload }
    socket.on('privateMessage', async ({ toSocketId, payload }) => {
      try {
        // persist message server-side if you want
        // emit to the target socket ONLY
        if (toSocketId && io.sockets.sockets.get(toSocketId)) {
          io.to(toSocketId).emit('privateMessage', { ...payload, _id: payload._id || null, fromSocketId: socket.id });
        } else {
          // optionally find socket by user id if you index users
          socket.emit('error', { message: 'Recipient offline or not found' });
        }
      } catch (err) {
        console.error('privateMessage error', err);
      }
    });

    // simple reaction/event handlers can go here...

    socket.on('disconnect', () => {
      console.log('socket disconnected', socket.id);
    });
  });
};