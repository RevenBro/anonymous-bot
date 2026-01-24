const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://anonymous-bot-sand.vercel.app/';

// Express app
const app = express();
app.use(bodyParser.json());

// Bot (webhook mode)
const bot = new TelegramBot(TOKEN);

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: { type: String, default: null },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  isBlocked: { type: Boolean, default: false },
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  recipientId: { type: Number, required: true, index: true },
  content: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'media'], default: 'text' },
  isFlagged: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// MongoDB connection
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB ulandi'))
    .catch(err => console.error('❌ MongoDB xatosi:', err));
}

// User states
const userStates = new Map();

// Webhook setup
const webhookPath = `/bot${TOKEN}`;
bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`)
  .then(() => console.log('✅ Webhook sozlandi'))
  .catch(err => console.error('❌ Webhook xatosi:', err));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Bot ishlayapti ✅',
    mode: 'webhook',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint
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

// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  try {
    const userState = userStates.get(userId);

    if (!userState || userState.action !== 'sending_message') {
      await bot.sendMessage(chatId,
        `📌 Anonim xabar yuborish uchun:\n` +
        `/start komandasi orqali linkingizni oling va uni baham ko'ring!`
      );
      return;
    }

    const recipientId = userState.recipientId;
    let messageText = msg.text || '[Media fayl]';

    const message = new Message({
      recipientId: recipientId,
      content: messageText,
      messageType: msg.text ? 'text' : 'media',
      timestamp: new Date()
    });
    await message.save();

    await bot.sendMessage(recipientId,
      `🎭 Sizga anonim xabar keldi:\n\n` +
      `"${messageText}"\n\n` +
      `💬 Javob berish uchun o'z linkinggizni ulashing!`
    );

    await bot.sendMessage(chatId,
      `✅ Xabaringiz muvaffaqiyatli yuborildi!\n\n` +
      `🔒 Sizning shaxsingiz anonim qoldi.`
    );

    userStates.delete(userId);
    console.log(`📨 Xabar yuborildi: ${userId} → ${recipientId}`);

  } catch (error) {
    console.error('Xato:', error);
    await bot.sendMessage(chatId, '❌ Xabar yuborishda xatolik yuz berdi.');
  }
});

// Stats command
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

// Vercel serverless function
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Webhook bot ${PORT} portda ishlamoqda`);
  });
}

module.exports = app;