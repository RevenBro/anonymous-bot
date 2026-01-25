require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!TOKEN || !WEBHOOK_URL) {
  throw new Error('BOT_TOKEN yoki WEBHOOK_URL yo‘q');
}

const webhookPath = `/bot${TOKEN}`;
const bot = new TelegramBot(TOKEN, { polling: false });

/* =======================
   MongoDB
======================= */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB ulandi'))
  .catch(err => console.error('❌ MongoDB xatosi:', err));

/* =======================
   Schemas
======================= */
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, index: true },
  username: String,
  firstName: String,
  lastName: String,
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  recipientId: Number,
  senderId: Number,
  content: String,
  hasReplied: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

const userStates = new Map();

/* =======================
   Express routes
======================= */
app.get('/', (req, res) => {
  res.send('Bot ishlayapti');
});

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

/* =======================
   Telegram logic
======================= */
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const param = match[1]?.trim();

  let user = await User.findOne({ telegramId: userId });
  if (!user) {
    user = await User.create({
      telegramId: userId,
      username: msg.from.username,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name
    });
  }

  if (!param) {
    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    return bot.sendMessage(chatId, `🔗 Sizning linkingiz:\n${link}`);
  }

  const recipientId = Number(param);
  if (recipientId === userId) {
    return bot.sendMessage(chatId, '❌ O‘zingizga yubora olmaysiz');
  }

  const recipient = await User.findOne({ telegramId: recipientId });
  if (!recipient) {
    return bot.sendMessage(chatId, '❌ Foydalanuvchi topilmadi');
  }

  userStates.set(userId, { action: 'send', recipientId });
  bot.sendMessage(chatId, '✍️ Xabaringizni yozing');
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const state = userStates.get(msg.from.id);
  if (!state) return;

  if (state.action === 'send') {
    const saved = await Message.create({
      senderId: msg.from.id,
      recipientId: state.recipientId,
      content: msg.text
    });

    await bot.sendMessage(
      state.recipientId,
      `🎭 Anonim xabar:\n\n${msg.text}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Javob berish', callback_data: `reply_${saved._id}` }
          ]]
        }
      }
    );

    bot.sendMessage(msg.chat.id, '✅ Yuborildi');
    userStates.delete(msg.from.id);
  }

  if (state.action === 'reply') {
    await bot.sendMessage(state.to, `💬 Javob:\n\n${msg.text}`);
    bot.sendMessage(msg.chat.id, '✅ Javob yuborildi');
    userStates.delete(msg.from.id);
  }
});

bot.on('callback_query', async (q) => {
  if (!q.data.startsWith('reply_')) return;

  const message = await Message.findById(q.data.replace('reply_', ''));
  if (!message || message.hasReplied) return;

  message.hasReplied = true;
  await message.save();

  userStates.set(q.from.id, {
    action: 'reply',
    to: message.senderId
  });

  bot.answerCallbackQuery(q.id);
  bot.sendMessage(q.message.chat.id, '✍️ Javobingizni yozing');
});

/* =======================
   Server + webhook
======================= */
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT} portda ishga tushdi`);
  await bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`);
  console.log('✅ Webhook o‘rnatildi');
});

module.exports = app;
