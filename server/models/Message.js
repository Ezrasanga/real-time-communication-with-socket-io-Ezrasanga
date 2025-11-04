const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, default: null },
  room: { type: String, default: 'general' },
  private: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: false
});

module.exports = mongoose.model('Message', messageSchema);