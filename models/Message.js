const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  recipientId: {
    type: Number,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'media'],
    default: 'text'
  },
  isFlagged: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Message', messageSchema);