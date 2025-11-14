const Message = require('../models/Message');
const Room = require('../models/Room');

exports.getMessages = async (req, res) => {
  try {
    const { room, limit = 100 } = req.query;
    const query = room ? { room } : {};
    const messages = await Message.find(query).sort({ timestamp: 1 }).limit(parseInt(limit, 10));
    res.json(messages);
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.getMessageById = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.json(msg);
  } catch (err) {
    console.error('getMessageById error:', err);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
};

exports.createMessage = async (req, res) => {
  try {
    const { content, from, to = null, room = 'general', private: isPrivate = false } = req.body;
    if (!content || !from) return res.status(400).json({ error: 'content and from are required' });

    const message = new Message({ content, from, to, room, private: !!isPrivate, timestamp: new Date() });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    console.error('createMessage error:', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
};

// delete a message (room or private)
exports.deleteMessage = async (req, res) => {
  try {
    const id = req.params.id;
    const msg = await Message.findById(id).lean();
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // only allow deletion by message author or room creator
    const requester = req.clerkUser?.username || req.clerkUser?.id;
    const isAuthor = msg.from === requester || String(msg.createdBy) === String(req.clerkUser?.id);
    let isRoomCreator = false;
    if (msg.room) {
      const room = await Room.findOne({ name: msg.room }).lean();
      if (room && (String(room.createdBy) === String(req.clerkUser?.id) || String(room.createdBy) === String(requester))) isRoomCreator = true;
    }
    if (!isAuthor && !isRoomCreator) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await Message.deleteOne({ _id: id });

    // broadcast deletion so clients can remove it
    const io = req.app.get('io');
    if (io) {
      io.emit('messageDeleted', { messageId: id, room: msg.room || null, private: !!msg.private, from: msg.from, to: msg.to || null });
    }

    return res.json({ ok: true, messageId: id });
  } catch (err) {
    console.error('deleteMessage error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};