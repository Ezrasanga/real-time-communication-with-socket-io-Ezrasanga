const Room = require('../models/Room');

exports.createRoom = async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    const room = new Room({
      name,
      description,
      createdBy: req.userId,
      isPrivate: !!isPrivate
    });
    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
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

exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findOneAndDelete({
      _id: req.params.roomId,
      createdBy: req.userId
    });
    if (!room) return res.status(404).json({ error: 'Room not found or unauthorized' });
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};