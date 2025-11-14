const Room = require('../models/Room');
const Message = require('../models/Message');

exports.createRoom = async (req, res) => {
  try {
    const { name } = req.body;
    // derive createdBy from authenticated user when available
    const createdBy = (req.clerkUser && (req.clerkUser.id || req.clerkUser.username)) || req.body.createdBy;
    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy is required' });
    }

    const room = new Room({
      name,
      createdBy // record creator
      // ...other fields...
    });

    await room.save();

    // broadcast the new room to all connected clients
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('roomCreated', { id: room._id, name: room.name, createdBy: room.createdBy });
      }
    } catch (err) {
      console.warn('Failed to broadcast roomCreated:', err.message || err);
    }

    return res.status(201).json(room);
  } catch (err) {
    // keep your existing error handling
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isPrivate: false });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    if (!room.members.includes(req.userId)) {
      room.members.push(req.userId);
      await room.save();
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.leaveRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    room.members = room.members.filter(id => id !== req.userId);
    await room.save();
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Clear all messages in a room
async function clearRoomMessages(req, res) {
  try {
    const roomId = req.params.roomId;
    // allow roomId to be either DB id or room name
    const room = await Room.findOne({ $or: [{ _id: roomId }, { name: roomId }] }).lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only allow clearing if requester is creator (or allow everyone if desired)
    const requester = req.clerkUser?.username || req.clerkUser?.id;
    if (room.createdBy && String(room.createdBy) !== String(req.clerkUser?.id) && String(room.createdBy) !== String(requester)) {
      return res.status(403).json({ error: 'Not authorized to clear this room' });
    }

    // delete messages that belong to this room
    await Message.deleteMany({ room: room.name });

    // broadcast to clients
    const io = req.app.get('io');
    if (io) io.emit('roomCleared', { room: room.name, roomId: room._id });

    return res.json({ ok: true, room: room.name });
  } catch (err) {
    console.error('clearRoomMessages error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

// Delete a room (and its messages)
async function deleteRoom(req, res) {
  try {
    const roomId = req.params.roomId;
    const room = await Room.findOne({ $or: [{ _id: roomId }, { name: roomId }] });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only creator may delete
    if (room.createdBy && String(room.createdBy) !== String(req.clerkUser?.id) && String(room.createdBy) !== String(req.clerkUser?.username)) {
      return res.status(403).json({ error: 'Not authorized to delete this room' });
    }

    const name = room.name;
    await Message.deleteMany({ room: name });
    await room.deleteOne();

    // broadcast deletion
    const io = req.app.get('io');
    if (io) io.emit('roomDeleted', { roomId: room._id, name });

    return res.json({ ok: true, roomId: room._id, name });
  } catch (err) {
    console.error('deleteRoom error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

module.exports = {
  createRoom: exports.createRoom,
  getRooms: exports.getRooms,
  getRoom: exports.getRoom,
  joinRoom: exports.joinRoom,
  leaveRoom: exports.leaveRoom,
  clearRoomMessages,
  deleteRoom
};