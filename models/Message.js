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
    flagReason: {
    type: String,
    default: null
  },
  isModerated: {
    type: Boolean,
    default: false
  },
  moderatedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  mediaType: {
    type: String,
    enum: ['photo', 'audio', 'animation', 'document', null],
    default: null
  },
  fileId: {
    type: String,
    default: null,
    index: true
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: 0
  },
  localPath: {
    type: String,
    default: null
  },
    isDeleted: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  hasReplied: { 
    type: Boolean, 
    default: false 
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  }
});

messageSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// Lifecycle hook - deleted fayllarni o'chirish
messageSchema.pre('remove', async function(next) {
  if (this.localPath && fs.existsSync(this.localPath)) {
    try {
      fs.unlinkSync(this.localPath);
      console.log(`🗑️ Fayl o'chirildi: ${this.localPath}`);
    } catch (error) {
      console.error('❌ Fayl o\'chirilmadi:', error);
    }
  }
  next();
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;