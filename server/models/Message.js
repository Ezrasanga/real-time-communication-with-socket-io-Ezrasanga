const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  users: { type: [String], default: [] }, // usernames who reacted
  count: { type: Number, default: 0 }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  content: { type: String },
  from: { type: String },
  to: { type: String, default: null }, // recipient username for private messages
  room: { type: String, default: 'global' },
  private: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  reactions: { type: [ReactionSchema], default: [] },
  readBy: { type: [String], default: [] } // usernames who have read this message
});

module.exports = mongoose.model('Message', MessageSchema);