// bot/handlers/premiumHandler.js
const User = require('../models/User');
const TelegramBot = require('node-telegram-bot-api');

/**
 * /premium komandasi - Premium xususiyatlari haqida
 */
const handlePremium = async (bot, msg, User) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const user = await User.findOne({ telegramId: userId });

    if (!user) {
      await bot.sendMessage(chatId, '❌ Foydalanuvchi topilmadi!');
      return;
    }

    // Premium tekshirish
    user.checkPremiumExpiry();

    if (user.isPremium) {
      const daysLeft = Math.ceil((user.premiumUntil - new Date()) / (1000 * 60 * 60 * 24));
      
      await bot.sendMessage(chatId,
        `💎 PREMIUM OBUNASI MAVJUD\n\n` +
        `✅ Holati: AKTIV\n` +
        `⏰ Qolgan vaqt: ${daysLeft} kun\n` +
        `📅 Tugadi: ${user.premiumUntil.toLocaleDateString('uz-UZ')}\n` +
        `💝 Turi: ${user.premiumType}\n\n` +
        `🎁 Xususiyatlar:\n` +
        `• 🖼️ Rasm yuborish\n` +
        `• 🎵 Audio yuborish\n` +
        `• 🎬 GIF yuborish`
      );
      return;
    }

    // Premium yo'q - narxlarni ko'rsatish
    const premiumPrices = {
      daily: { price: 5000, days: 1 },
      weekly: { price: 25000, days: 7 },
      monthly: { price: 80000, days: 30 },
      unlimited: { price: 200000, days: 365 }
    };

    let priceText = `💎 PREMIUM OBUNASI\n\n` +
                   `Ruxsat etilgan xususiyatlar:\n` +
                   `• 🖼️ Rasm yuborish\n` +
                   `• 🎵 Audio yuborish\n` +
                   `• 🎬 GIF yuborish\n\n` +
                   `📊 Tariflar:\n`;

    const keyboard = [];

    for (const [type, data] of Object.entries(premiumPrices)) {
      const displayType = type.charAt(0).toUpperCase() + type.slice(1);
      priceText += `• ${displayType}: ${data.price} so'm (${data.days} kun)\n`;
      
      keyboard.push([{
        text: `${displayType} - ${data.price} so'm`,
        callback_data: `buy_premium_${type}`
      }]);
    }

    keyboard.push([{
      text: '❌ Bekor qilish',
      callback_data: 'cancel_premium'
    }]);

    await bot.sendMessage(chatId, priceText, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('Premium handler error:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi!');
  }
};

/**
 * Premium sotib olishni bosish
 */
const handleBuyPremium = async (bot, query, duration, User) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    const user = await User.findOne({ telegramId: userId });

    if (!user) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Foydalanuvchi topilmadi!',
        show_alert: true
      });
      return;
    }

    // Premium narxlari
    const premiumPrices = {
      daily: { stars: 5, days: 1, name: 'Daily' },
      weekly: { stars: 25, days: 7, name: 'Weekly' },
      monthly: { stars: 80, days: 30, name: 'Monthly' },
      unlimited: { stars: 200, days: 365, name: 'Unlimited' }
    };

    const plan = premiumPrices[duration];

    if (!plan) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Noto\'g\'ri tarif!',
        show_alert: true
      });
      return;
    }

    // Telegram Stars orqali to'lash (invoice jo'natish)
    const invoicePayload = JSON.stringify({
      type: 'premium',
      duration: duration,
      userId: userId,
      timestamp: Date.now()
    });

    try {
      await bot.sendInvoice(
        chatId,
        `Premium - ${plan.name}`,
        `${plan.days} kunlik PREMIUM obuna`,
        invoicePayload,
        'XC', // currency code (UZ uchun testda)
        [
          {
            label: `${plan.name} Premium`,
            amount: plan.stars * 100 // cents
          }
        ],
        {
          provider_token: process.env.PAYMENT_PROVIDER_TOKEN || ''
        }
      );

      await bot.answerCallbackQuery(query.id);

    } catch (paymentError) {
      // Agar payment provider'da muammo bo'lsa
      console.log('Payment provider error, using Stars alternative');

      await bot.sendMessage(chatId,
        `⭐ TELEGRAM STARS BILAN TO'LASH\n\n` +
        `Tarif: ${plan.name}\n` +
        `Narx: ${plan.stars} ⭐\n\n` +
        `${plan.days} kunlik PREMIUM obuna uchun ${plan.stars} ta ⭐ yuboringiz.\n\n` +
        `⚠️ To'lovni tasdiqlash uchun support'ga murojaat qiling.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📞 Support', url: 'https://t.me/support' }
            ]]
          }
        }
      );

      await bot.answerCallbackQuery(query.id);
    }

  } catch (error) {
    console.error('Buy premium error:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ To\'lovda xatolik!',
      show_alert: true
    });
  }
};

/**
 * Telegram Stars orqali to'lash tasdiqlanganida
 */
const handlePremiumStars = async (bot, query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    // Stars payment integration (agar mavjud bo'lsa)
    await bot.answerCallbackQuery(query.id);

    await bot.sendMessage(chatId,
      `⭐ To'lov vaqitinchalik notsiya\n\n` +
      `Support'ga murojaat qiling: /help`
    );

  } catch (error) {
    console.error('Premium stars error:', error);
  }
};

/**
 * Premium bekor qilish
 */
const handleCancelPremium = async (bot, query) => {
  const chatId = query.message.chat.id;

  try {
    await bot.editMessageText(
      `Bekor qilindi ❌`,
      {
        chat_id: chatId,
        message_id: query.message.message_id
      }
    );

    await bot.answerCallbackQuery(query.id);

  } catch (error) {
    console.error('Cancel premium error:', error);
  }
};

module.exports = {
  handlePremium,
  handlePremiumStars,
  handleBuyPremium,
  handleCancelPremium
};