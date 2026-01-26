// bot/jobs/premiumChecker.js
const User = require('../models/User');

async function checkPremiumExpiry(bot) {
  try {
    const users = await User.find({
      isPremium: true,
      premiumUntil: { $lte: new Date() }
    });

    for (const user of users) {
      // Premium tugadi
      user.isPremium = false;
      user.premiumType = null;
      await user.save();

      // Foydalanuvchiga xabar
      try {
        await bot.sendMessage(user.telegramId,
          `⏰ Sizning Premium obunangiz tugadi!\n\n` +
          `Premium xizmatlardan yana foydalanish uchun /premium buyrug'ini yuboring.`
        );
      } catch (error) {
        console.log(`User ${user.telegramId} ga xabar yuborib bo'lmadi`);
      }
    }

    if (users.length > 0) {
      console.log(`🔔 ${users.length} ta Premium tugadi`);
    }

  } catch (error) {
    console.error('Premium checker xatosi:', error);
  }
}

// Har 1 soatda tekshirish
function startPremiumChecker(bot) {
  setInterval(() => {
    checkPremiumExpiry(bot);
  }, 60 * 60 * 1000); // 1 soat

  // Dastlab bir marta ishga tushirish
  checkPremiumExpiry(bot);
}

module.exports = { startPremiumChecker };