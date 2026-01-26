// bot/handlers/premiumHandler.js
const User = require('../models/User');

// /premium komandasi
async function handlePremium(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    let user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      await bot.sendMessage(chatId, '❌ Avval /start ni bosing!');
      return;
    }

    // Premium muddatini tekshirish
    const expired = user.checkPremiumExpiry();
    if (expired) {
      await user.save();
    }

    // Agar premium bo'lsa
    if (user.isPremium) {
      const daysLeft = Math.ceil((user.premiumUntil - new Date()) / (1000 * 60 * 60 * 24));
      
      await bot.sendMessage(chatId,
        `🌟 Siz Premium foydalanuvchisiz!\n\n` +
        `📅 Muddat: ${user.premiumUntil.toLocaleDateString('uz-UZ')}\n` +
        `⏰ Qolgan kunlar: ${daysLeft} kun\n\n` +
        `💎 Premium imkoniyatlaringiz:\n` +
        `✅ Cheksiz xabar yuborish\n` +
        `✅ Reklama yo'q\n` +
        `✅ Maxfiylik darajasi yuqori\n` +
        `✅ 24/7 yordam`
      );
      return;
    }

    // Premium sotib olish
    await bot.sendMessage(chatId,
      `🌟 Anonim+ Xizmatidan Foydalaning! 🌟\n\n` +
      `Sizni Anonim+ xizmatidan foydalanishga taklif etamiz, bu sizga qulayliklar va afzalliklar taqdim etadi:\n\n` +
      `- *Reklamasiz:* Anonim+ foydalanuvchilarga hech qanday reklama yuborilmaydi, faqat siz uchun eng yaxshi tajriba!\n` +
      `- *Shaxsiy Login:* Maxfiylikni ta'minlash uchun shaxsiy login xizmatidan foydalaning.\n` +
      `- *Anonim Xabarlarni Ko'rish:* Sizga yuborilgan anonim xabarlarni hech qanday cheklovlarsiz ko'ring.\n` +
      `- *Xabar Yo'lovchilarni Taqiqlash:* Xabar yo'lovchilarini taqiqlash imkoniyati orqali nazoratni oling.\n\n` +
      `💎 *Anonim+ Narxlari:* Obuna narxlari va tafsilotlar uchun [shu yerga qarang](https://telegra.ph/Anonim-suxbatdosh-Premium-narxlari-01-26).`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⭐ Telegram Stars', callback_data: 'premium_stars' }
            ],
            [
              { text: '🏢 ADMIN ORQALI', url: 'https://t.me/Saidakbarovv_A' }
            ]
          ]
        }
      }
    );

  } catch (error) {
    console.error('Premium xatosi:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Qayta urinib ko\'ring.');
  }
}

// Telegram Stars callback
async function handlePremiumStars(bot, query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    await bot.editMessageText(
      `⭐ *Tarfni tanlang:*\n\n` +
      `Yangi funksiyalar va botning takomillashtirilgan ishlashi bizning Anonim+ tarifimizda mavjud.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '10 ⭐ 1 kunlik', callback_data: 'buy_premium_1day' },
              { text: '25 ⭐ 3 kunlik', callback_data: 'buy_premium_3day' }
            ],
            [
              { text: '75 ⭐ 1 haftalik', callback_data: 'buy_premium_1week' },
              { text: '100 ⭐ 1 oylik', callback_data: 'buy_premium_1month' }
            ],
            [
              { text: '250 ⭐ 3 oylik', callback_data: 'buy_premium_3month' },
              { text: '1000 ⭐ cheksiz', callback_data: 'buy_premium_unlimited' }
            ],
            [
              { text: '🚫 Bekor qilish', callback_data: 'cancel_premium' }
            ]
          ]
        }
      }
    );

    await bot.answerCallbackQuery(query.id);

  } catch (error) {
    console.error('Stars callback xatosi:', error);
  }
}

// Premium sotib olish
async function handleBuyPremium(bot, query, duration) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    let user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Foydalanuvchi topilmadi!',
        show_alert: true
      });
      return;
    }

    // Premium muddat hisoblash
    let premiumDays = 0;
    let premiumType = '';
    let packageName = '';

    switch(duration) {
      case '1day':
        premiumDays = 1;
        premiumType = 'daily';
        packageName = '1 kunlik';
        break;
      case '3day':
        premiumDays = 3;
        premiumType = 'daily';
        packageName = '3 kunlik';
        break;
      case '1week':
        premiumDays = 7;
        premiumType = 'weekly';
        packageName = '1 haftalik';
        break;
      case '1month':
        premiumDays = 30;
        premiumType = 'monthly';
        packageName = '1 oylik';
        break;
      case '3month':
        premiumDays = 90;
        premiumType = 'monthly';
        packageName = '3 oylik';
        break;
      case 'unlimited':
        premiumDays = 36500; // 100 yil
        premiumType = 'unlimited';
        packageName = 'cheksiz';
        break;
    }

    // Premium berish
    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + premiumDays);

    user.isPremium = true;
    user.premiumUntil = premiumUntil;
    user.premiumType = premiumType;
    await user.save();

    // Tabrik xabari
    await bot.editMessageText(
      `🎉 *Tabriklaymiz!* 🎉\n\n` +
      `Sizga *${packageName}* Premium taqdim etildi!\n\n` +
      `💎 Premium imkoniyatlar:\n` +
      `✅ Cheksiz xabar yuborish\n` +
      `✅ Reklama yo'q\n` +
      `✅ Maxfiylik darajasi yuqori\n` +
      `✅ 24/7 yordam\n\n` +
      `📅 Amal qilish muddati: ${premiumUntil.toLocaleDateString('uz-UZ')}\n\n` +
      `Xizmatlarimizdan foydalanganingiz uchun rahmat! 🌟`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );

    await bot.answerCallbackQuery(query.id);

    console.log(`💎 Premium berildi: User ${userId} - ${packageName}`);

  } catch (error) {
    console.error('Premium berish xatosi:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Xatolik yuz berdi!',
      show_alert: true
    });
  }
}

// Bekor qilish
async function handleCancelPremium(bot, query) {
  const chatId = query.message.chat.id;
  
  try {
    await bot.editMessageText(
      `❌ Bekor qilindi.\n\n` +
      `Agar keyinroq Premium xizmatidan foydalanmoqchi bo'lsangiz, /premium buyrug'ini yuboring.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id
      }
    );

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Cancel xatosi:', error);
  }
}

module.exports = {
  handlePremium,
  handlePremiumStars,
  handleBuyPremium,
  handleCancelPremium
};