const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const { startPremiumChecker } = require('./jobs/premiumChecker');
const {
  handlePremium,
  handlePremiumStars,
  handleBuyPremium,
  handleCancelPremium
} = require('./handlers/premiumHandler');
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.onrender.com';

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(TOKEN);

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: { type: String, default: null },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  isBlocked: { type: Boolean, default: false },
  messageCount: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  premiumUntil: { type: Date, default: null },
  premiumType: { type: String, enum: ['daily', 'weekly', 'monthly', 'unlimited', null], default: null },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.checkPremiumExpiry = function() {
  if (this.isPremium && this.premiumUntil) {
    if (new Date() > this.premiumUntil) {
      this.isPremium = false;
      this.premiumType = null;
      return true;
    }
  }
  return false;
};

// Message Schema
const messageSchema = new mongoose.Schema({
  recipientId: { type: Number, required: true, index: true },
  senderId: { type: Number, default: null },
  content: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'media'], default: 'text' },
  isFlagged: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  hasReplied: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// MongoDB connection
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB ulandi');
      startPremiumChecker(bot);
    })
    .catch(err => console.error('❌ MongoDB xatosi:', err));
}

const userStates = new Map();

// Webhook setup
const webhookPath = `/bot${TOKEN}`;
bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`)
  .then(() => console.log('✅ Webhook sozlandi'))
  .catch(err => console.error('❌ Webhook xatosi:', err));

app.get('/', (req, res) => {
  res.json({ 
    status: 'Bot ishlayapti ✅',
    mode: 'webhook',
    timestamp: new Date().toISOString()
  });
});

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// /start command
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || null;
  const param = match[1].trim();

  try {
    let user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      user = new User({
        telegramId: userId,
        username: username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name
      });
      await user.save();
      console.log(`➕ Yangi foydalanuvchi: ${userId}`);
    }

    if (!param) {
      const personalLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;
      
      await bot.sendMessage(chatId, 
        `👋 Salom!\n\n` +
        `🔗 Sizning anonim xabar qabul qilish linkinggiz:\n\n` +
        `${personalLink}\n\n` +
        `Bu linkni do'stlaringiz bilan baham ko'ring. ` +
        `Ular sizga anonim xabar yuborishlari mumkin! 🎭`
      );
      return;
    }

    const recipientId = parseInt(param);

    if (recipientId === userId) {
      await bot.sendMessage(chatId, '❌ Siz o\'zingizga xabar yubora olmaysiz!');
      return;
    }

    const recipient = await User.findOne({ telegramId: recipientId });
    if (!recipient) {
      await bot.sendMessage(chatId, '❌ Bunday foydalanuvchi topilmadi!');
      return;
    }

    userStates.set(userId, {
      action: 'sending_message',
      recipientId: recipientId
    });

    await bot.sendMessage(chatId,
      `✍️ Anonim xabaringizni yozing:\n\n` +
      `💡 Xabaringiz qabul qiluvchiga anonim holda yuboriladi.`
    );

  } catch (error) {
    console.error('Xato:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
  }
});

// /premium command
bot.onText(/\/premium/, (msg) => handlePremium(bot, msg, User));

// /stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();
    
    await bot.sendMessage(chatId,
      `📊 Statistika:\n\n` +
      `👥 Foydalanuvchilar: ${totalUsers}\n` +
      `📨 Xabarlar: ${totalMessages}`
    );
  } catch (error) {
    console.error('Xato:', error);
  }
});

// BITTA UNIFIED MESSAGE HANDLER
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  try {
    const userState = userStates.get(userId);

    if (!userState) {
      return;
    }

    // Anonim xabar yuborish
    if (userState.action === 'sending_message') {
      const recipientId = userState.recipientId;
      let messageText = msg.text || '[Media fayl]';

      const message = new Message({
        recipientId: recipientId,
        senderId: userId,
        content: messageText,
        messageType: msg.text ? 'text' : 'media',
        timestamp: new Date()
      });
      await message.save();

      await bot.sendMessage(recipientId,
        `🎭 Sizga anonim xabar keldi:\n\n` +
        `"${messageText}"`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Javob berish', callback_data: `reply_${message._id}` }
            ]]
          }
        }
      );

      await bot.sendMessage(chatId,
        `✅ Xabaringiz muvaffaqiyatli yuborildi!\n\n` +
        `🔒 Sizning shaxsingiz anonim qoldi.`
      );

      userStates.delete(userId);
      console.log(`📨 Xabar yuborildi: ${userId} → ${recipientId}`);
    }
    
    // Javob berish
    else if (userState.action === 'replying') {
      const messageText = msg.text || '[Media fayl]';
      
      const originalMessage = await Message.findById(userState.originalMessageId);
      
      if (originalMessage) {
        originalMessage.hasReplied = true;
        await originalMessage.save();
      }

      await bot.sendMessage(userState.originalSenderId,
        `💬 Sizning anonim xabaringizga javob:\n\n` +
        `"${messageText}"`
      );

      await bot.sendMessage(chatId,
        `✅ Javobingiz yuborildi!\n\n` +
        `🔒 Sizning shaxsingiz anonim qoldi.`
      );

      userStates.delete(userId);
      console.log(`💬 Javob yuborildi: ${userId} → ${userState.originalSenderId}`);
    }

  } catch (error) {
    console.error('Xato:', error);
    await bot.sendMessage(chatId, '❌ Xabar yuborishda xatolik yuz berdi.');
  }
});

// BITTA UNIFIED CALLBACK HANDLER
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  console.log('🔔 Callback query:', data); // Debug

  try {
    // Premium callbacks
    if (data === 'premium_stars') {
      console.log('⭐ Premium Stars bosildi');
      await handlePremiumStars(bot, query);
    }
    else if (data.startsWith('buy_premium_')) {
      const duration = data.replace('buy_premium_', '');
      console.log('💎 Premium sotib olish:', duration);
      await handleBuyPremium(bot, query, duration, User);
    }
    else if (data === 'cancel_premium') {
      console.log('❌ Premium bekor qilindi');
      await handleCancelPremium(bot, query);
    }
    
    // Reply callbacks
    else if (data.startsWith('reply_')) {
      const messageId = data.replace('reply_', '');
      
      const message = await Message.findById(messageId);

      if (!message) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Xabar topilmadi!',
          show_alert: true
        });
        return;
      }

      if (message.hasReplied) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Siz bu xabarga allaqachon javob bergansiz!',
          show_alert: true
        });
        return;
      }

      if (userId !== message.recipientId) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Bu xabar sizga emas!',
          show_alert: true
        });
        return;
      }

      userStates.set(userId, {
        action: 'replying',
        originalMessageId: messageId,
        originalSenderId: message.senderId
      });

      await bot.answerCallbackQuery(query.id);
      
      await bot.sendMessage(chatId,
        `✍️ Javobingizni yozing:\n\n` +
        `💡 Javobingiz anonim yuboriladi.`
      );

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: chatId,
          message_id: query.message.message_id
        }
      );
    }
    
    // Noma'lum callback
    else {
      console.log('⚠️ Noma\'lum callback:', data);
      await bot.answerCallbackQuery(query.id);
    }

  } catch (error) {
    console.error('Callback xatosi:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Xatolik yuz berdi!',
      show_alert: true
    });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Webhook bot ${PORT} portda ishlamoqda`);
  });
}

module.exports = app;