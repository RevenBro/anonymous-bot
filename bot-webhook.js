// bot/bot-webhook.js
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

// ✅ SHARED MODULES
const connectDB = require('../shared/config/database');
const User = require('../shared/models/User');
const Message = require('../shared/models/Message');

const { startPremiumChecker } = require('./jobs/premiumChecker');
const {
  handlePremium,
  handlePremiumStars,
  handleBuyPremium,
  handleCancelPremium
} = require('./handlers/premiumHandler');
const {
  handleMediaSend,
  getMediaType,
  canSendMedia
} = require('./handlers/mediaHandler');

dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.onrender.com';

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(TOKEN);

// ✅ SHARED DATABASE CONNECTION
if (mongoose.connection.readyState === 0) {
  connectDB()
    .then(() => {
      console.log('✅ Shared MongoDB connected to Bot');
      startPremiumChecker(bot);
    })
    .catch(err => {
      console.error('❌ Database connection error:', err);
      process.exit(1);
    });
}

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
    database: 'Shared MongoDB',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ==================== /start COMMAND ====================
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
        `Bu linkni do'stlaringiz bilan baham ko'ring.\n` +
        `Ular sizga anonim xabar yuborishlari mumkin! 🎭\n\n` +
        `📌 Xususiyatlar:\n` +
        `• 📝 Matn xabar (hammaga)\n` +
        `• 🖼️ Rasm, 🎵 Audio, 🎬 GIF (faqat PREMIUM)\n\n` +
        `Premium uchun: /premium`
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
      `💡 Matn, rasm, audio yoki GIF yuborishingiz mumkin.\n` +
      `(Rasm/Audio/GIF faqat PREMIUM obunachilar uchun)`
    );

  } catch (error) {
    console.error('Start handler error:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Qayta urinib ko\'ring.');
  }
});

// ==================== /premium COMMAND ====================
bot.onText(/\/premium/, (msg) => handlePremium(bot, msg, User));

// ==================== /stats COMMAND ====================
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();
    const premiumUsers = await User.countDocuments({ isPremium: true });
    
    await bot.sendMessage(chatId,
      `📊 Statistika:\n\n` +
      `👥 Foydalanuvchilar: ${totalUsers}\n` +
      `💎 Premium: ${premiumUsers}\n` +
      `📨 Xabarlar: ${totalMessages}`
    );
  } catch (error) {
    console.error('Stats error:', error);
  }
});

// ==================== MESSAGE HANDLER ====================
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

    if (userState.action === 'sending_message') {
      const recipientId = userState.recipientId;

      // ========== MEDIA HANDLING ==========
      if (msg.photo || msg.audio || msg.animation || msg.document) {
        await handleMediaSend(bot, msg, User, Message, recipientId);
        userStates.delete(userId);
        return;
      }

      // ========== TEXT HANDLING ==========
      if (msg.text) {
        const messageText = msg.text;

        const message = new Message({
          recipientId: recipientId,
          senderId: userId,
          content: messageText,
          messageType: 'text',
          timestamp: new Date()
        });
        await message.save();

        await bot.sendMessage(recipientId,
          `🎭 Sizga anonim xabar keldi:\n\n"${messageText}"`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '💬 Javob berish', callback_data: `reply_${message._id}` }
              ]]
            }
          }
        );

        await bot.sendMessage(chatId,
          `✅ Xabaringiz muvaffaqiyatli yuborildi!\n\n🔒 Sizning shaxsingiz anonim qoldi.`
        );

        userStates.delete(userId);
        console.log(`📨 Message sent: ${userId} → ${recipientId}`);
      }
    }
    else if (userState.action === 'replying') {
      if (msg.text) {
        const messageText = msg.text;
        
        const originalMessage = await Message.findById(userState.originalMessageId);
        
        if (originalMessage) {
          originalMessage.hasReplied = true;
          await originalMessage.save();
        }

        await bot.sendMessage(userState.originalSenderId,
          `💬 Sizning anonim xabaringizga javob:\n\n"${messageText}"`
        );

        await bot.sendMessage(chatId,
          `✅ Javobingiz yuborildi!\n\n🔒 Sizning shaxsingiz anonim qoldi.`
        );

        userStates.delete(userId);
        console.log(`💬 Reply sent: ${userId} → ${userState.originalSenderId}`);
      }
    }

  } catch (error) {
    console.error('Message handler error:', error);
    await bot.sendMessage(chatId, '❌ Xabar yuborishda xatolik yuz berdi.');
  }
});

// ==================== CALLBACK HANDLER ====================
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    if (data === 'premium_stars') {
      await handlePremiumStars(bot, query);
    }
    else if (data.startsWith('buy_premium_')) {
      const duration = data.replace('buy_premium_', '');
      await handleBuyPremium(bot, query, duration, User);
    }
    else if (data === 'cancel_premium') {
      await handleCancelPremium(bot, query);
    }
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
          text: '❌ Siz bu xabarga javob bergansiz!',
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
        `✍️ Javobingizni yozing:\n\n💡 Javobingiz anonim yuboriladi.`
      );

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: chatId,
          message_id: query.message.message_id
        }
      );
    }

  } catch (error) {
    console.error('Callback error:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Xatolik yuz berdi!',
      show_alert: true
    });
  }
});

const PORT = process.env.BOT_PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot webhook running on port ${PORT}`);
  console.log(`📊 Database: Shared MongoDB`);
});

module.exports = { app, bot };