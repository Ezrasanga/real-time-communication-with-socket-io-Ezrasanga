const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  createdBy: {
    type: String,
    required: true
  },
  members: [{
    type: String,
    ref: 'User'
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster queries
roomSchema.index({ name: 1 });
roomSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Room', roomSchema);