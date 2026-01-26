// bot/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    default: null
  },
  firstName: {
    type: String,
    default: null
  },
  lastName: {
    type: String,
    default: null
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  messageCount: {
    type: Number,
    default: 0
  },
  // Premium fields
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumUntil: {
    type: Date,
    default: null
  },
  premiumType: {
    type: String,
    enum: ['weekly', 'monthly', null],
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Premium tekshirish method
userSchema.methods.checkPremiumExpiry = function() {
  if (this.isPremium && this.premiumUntil) {
    if (new Date() > this.premiumUntil) {
      this.isPremium = false;
      this.premiumType = null;
      return true; // expired
    }
  }
  return false; // active or no premium
};

module.exports = mongoose.model('User', userSchema);