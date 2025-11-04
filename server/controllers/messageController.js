const Message = require('../models/Message');

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