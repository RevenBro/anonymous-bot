// bot/jobs/premiumChecker.js
const { User } = require('@revencoder/anonymous-shared');
const TelegramBot = require('node-telegram-bot-api');

/**
 * Premium muddati tugganmi tekshirish
 * Har 1 soatda ishga tushadi
 */
const startPremiumChecker = (bot) => {
  // Har soatda ishga tushirish
  const premiumCheckInterval = 60 * 60 * 1000; // 1 soat

  setInterval(async () => {
    try {
      console.log('🔄 Premium expiry check started...');
      
      const now = new Date();
      
      // Muddati tuggan premium user'larni topish
      const expiredUsers = await User.find({
        isPremium: true,
        premiumUntil: { $lt: now }
      });

      if (expiredUsers.length === 0) {
        console.log('✅ Muddati tuggan premium yo\'q');
        return;
      }

      // Har bir expired user uchun
      for (const user of expiredUsers) {
        try {
          // User ma'lumotlarini yangilash
          user.isPremium = false;
          user.premiumType = null;
          user.premiumUntil = null;
          await user.save();

          // User'ga xabar yuborish
          await bot.sendMessage(
            user.telegramId,
            `⏰ Sizning PREMIUM obunasi tugab qoldi\n\n` +
            `🔗 Davom ettirish uchun /premium buyrug'idan foydalaning`
          ).catch(err => {
            console.error(`Failed to notify user ${user.telegramId}:`, err.message);
          });

          console.log(`❌ Premium expired for user: ${user.telegramId}`);

        } catch (error) {
          console.error(`Error processing user ${user._id}:`, error);
        }
      }

      console.log(`✅ Premium check completed. ${expiredUsers.length} users processed`);

    } catch (error) {
      console.error('❌ Premium checker error:', error);
    }
  }, premiumCheckInterval);

  console.log('🚀 Premium checker started (interval: 1 hour)');
};

/**
 * On-demand premium expiry check
 * API orqali chaqirilishi mumkin
 */
const checkPremiumExpiry = async () => {
  try {
    const now = new Date();
    
    const result = await User.updateMany(
      {
        isPremium: true,
        premiumUntil: { $lt: now }
      },
      {
        isPremium: false,
        premiumType: null,
        premiumUntil: null
      }
    );

    console.log(`🔄 Premium expiry check: ${result.modifiedCount} users updated`);
    return result.modifiedCount;

  } catch (error) {
    console.error('❌ Premium expiry check error:', error);
    return 0;
  }
};

module.exports = {
  startPremiumChecker,
  checkPremiumExpiry
};