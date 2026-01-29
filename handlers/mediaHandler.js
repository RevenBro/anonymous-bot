const fs = require('fs');
const path = require('path');

// Media tiplarini o'rnatish
const ALLOWED_MEDIA_TYPES = {
  'photo': true,      // Rasm
  'audio': true,      // Audio
  'document': true,   // Fayl (GIF va boshqa)
  'animation': true   // GIF
};

const BLOCKED_MEDIA_TYPES = {
  'video': true,      // Video taqiqlangan
  'video_note': true, // Video xabar
  'voice': true,      // Ovozli xabar
};

// Maksimum fayl hajmi: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// GIF file type control
const GIF_MIME_TYPES = ['image/gif', 'video/mp4'];
const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Media turini aniqlash
 */
function getMediaType(msg) {
  if (msg.photo) return 'photo';
  if (msg.audio) return 'audio';
  if (msg.animation) return 'animation'; // GIF
  if (msg.document) return 'document';
  if (msg.video) return 'video';
  if (msg.voice) return 'voice';
  if (msg.video_note) return 'video_note';
  return null;
}

/**
 * Media yuborish mumkinligini tekshirish
 */
function canSendMedia(user) {
  if (!user.isPremium) {
    return {
      allowed: false,
      reason: '🔒 Media yuborish faqat PREMIUM obunachilari uchun mavjud!\n\n' +
              'Premium olish uchun /premium buyrug\'idan foydalaning.'
    };
  }

  // Premium vaqtini tekshirish
  if (user.premiumUntil && new Date() > user.premiumUntil) {
    return {
      allowed: false,
      reason: '⏰ Sizning premium obunasi tugab qolgan!\n\n' +
              'Davom ettirish uchun /premium buyrug\'idan foydalaning.'
    };
  }

  return { allowed: true };
}

/**
 * Media turini validatsiya qilish
 */
function validateMediaType(mediaType) {
  // Taqiqlangan turlar
  if (BLOCKED_MEDIA_TYPES[mediaType]) {
    return {
      valid: false,
      reason: `❌ ${mediaType.toUpperCase()} yuborish taqiqlangan!\n\n` +
              'Ruxsat etilgan: Rasm, Audio, GIF'
    };
  }

  // Ruxsat etilgan turlar
  if (!ALLOWED_MEDIA_TYPES[mediaType]) {
    return {
      valid: false,
      reason: '❌ Bu media turi qo\'llab-quvvatlanmaydi!\n\n' +
              'Ruxsat etilgan: Rasm, Audio, GIF'
    };
  }

  return { valid: true };
}

/**
 * Fayl hajmini tekshirish (Telegram file_size orqali)
 */
async function validateFileSize(bot, fileId) {
  try {
    const file = await bot.getFile(fileId);
    const fileSizeBytes = file.file_size || 0;

    if (fileSizeBytes > MAX_FILE_SIZE) {
      return {
        valid: false,
        reason: `❌ Fayl juda katta! (${Math.round(fileSizeBytes / 1024 / 1024)}MB)\n\n` +
                `Maksimum 5MB gacha bo\'lgan fayllar ruxsat etilgan.`,
        fileSize: fileSizeBytes
      };
    }

    return {
      valid: true,
      fileSize: fileSizeBytes,
      filePath: file.file_path
    };
  } catch (error) {
    console.error('❌ Fayl o\'lchamini tekshirishda xato:', error);
    return {
      valid: false,
      reason: '❌ Fayl tekshirilmadi. Qayta urinib ko\'ring.'
    };
  }
}

/**
 * Media faylni serverga yuklab olish (moderatsiya uchun)
 */
async function downloadMediaForModeration(bot, fileId, fileName) {
  try {
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;

    // Downloads papkasini yaratish
    const downloadDir = path.join(__dirname, 'downloads', 'pending');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const localPath = path.join(downloadDir, `${fileId}_${Date.now()}`);

    // Faylni yuklab olish
    await bot.downloadFile(fileId, localPath);

    return {
      success: true,
      localPath: localPath,
      fileName: fileName,
      fileId: fileId
    };
  } catch (error) {
    console.error('❌ Media yuklab olinmadi:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Moderatsiya kanali/botiga xabar yuborish
 */
async function sendToModerationChannel(bot, msg, mediaType, fileId, recipientId) {
  const MODERATION_CHAT_ID = process.env.MODERATION_CHAT_ID || -1001234567890;

  try {
    let caption = `🔍 MODERATSIYA KERAK\n\n` +
                  `📤 Yuboruvchi ID: ${msg.from.id}\n` +
                  `📥 Qabul qiluvchi ID: ${recipientId}\n` +
                  `📁 Media turi: ${mediaType}\n` +
                  `⏰ Vaqti: ${new Date().toLocaleString('uz-UZ')}\n` +
                  `File ID: \`${fileId}\``;

    // Media turiga qarab yuborish
    switch(mediaType) {
      case 'photo':
        await bot.sendPhoto(MODERATION_CHAT_ID, fileId, {
          caption: caption,
          parse_mode: 'Markdown'
        });
        break;
      case 'audio':
        await bot.sendAudio(MODERATION_CHAT_ID, fileId, {
          caption: caption,
          parse_mode: 'Markdown'
        });
        break;
      case 'animation':
        await bot.sendAnimation(MODERATION_CHAT_ID, fileId, {
          caption: caption,
          parse_mode: 'Markdown'
        });
        break;
      case 'document':
        await bot.sendDocument(MODERATION_CHAT_ID, fileId, {
          caption: caption,
          parse_mode: 'Markdown'
        });
        break;
    }

    console.log(`✅ Moderatsiyaga yuborildi: ${mediaType} from ${msg.from.id}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Moderatsiya kanaliga yuborishda xato:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Media faylni DB dan ma'lumot bilan saqlash
 */
function createMediaRecord(msg, mediaType, fileId, recipientId, senderId) {
  return {
    recipientId: recipientId,
    senderId: senderId,
    content: `[${mediaType.toUpperCase()}]`,
    messageType: 'media',
    mediaType: mediaType,
    fileId: fileId,
    fileName: msg.document?.file_name || `${mediaType}_${Date.now()}`,
    fileSize: msg.document?.file_size || msg.audio?.file_size || msg.photo?.[0]?.file_size || 0,
    isFlagged: false,
    isDeleted: false,
    hasReplied: false,
    timestamp: new Date()
  };
}

/**
 * Media faylni DB dan va server dan o'chirish
 */
async function deleteMediaFile(mediaRecord) {
  try {
    // Agar server da saqlangan bo'lsa
    if (mediaRecord.localPath && fs.existsSync(mediaRecord.localPath)) {
      fs.unlinkSync(mediaRecord.localPath);
      console.log(`🗑️ Fayl o'chirildi: ${mediaRecord.localPath}`);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Fayl o\'chirilmadi:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Media yuborishni qayta ishlash (asosiy funksiya)
 */
async function handleMediaSend(bot, msg, User, Message, recipientId) {
  const senderId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    // 1. Foydalanuvchini tekshirish
    const user = await User.findOne({ telegramId: senderId });
    if (!user) {
      await bot.sendMessage(chatId, '❌ Foydalanuvchi topilmadi!');
      return;
    }

    // 2. Premium tekshirish
    const premiumCheck = canSendMedia(user);
    if (!premiumCheck.allowed) {
      await bot.sendMessage(chatId, premiumCheck.reason);
      return;
    }

    // 3. Media turini aniqlash
    const mediaType = getMediaType(msg);
    if (!mediaType) {
      await bot.sendMessage(chatId, '❌ Media turi tanilmadi!');
      return;
    }

    // 4. Media turini validatsiya qilish
    const typeValidation = validateMediaType(mediaType);
    if (!typeValidation.valid) {
      await bot.sendMessage(chatId, typeValidation.reason);
      return;
    }

    // 5. Fayl ID'sini olish
    let fileId;
    switch(mediaType) {
      case 'photo':
        fileId = msg.photo[msg.photo.length - 1].file_id;
        break;
      case 'audio':
        fileId = msg.audio.file_id;
        break;
      case 'animation':
        fileId = msg.animation.file_id;
        break;
      case 'document':
        fileId = msg.document.file_id;
        break;
    }

    // 6. Fayl hajmini tekshirish
    const sizeValidation = await validateFileSize(bot, fileId);
    if (!sizeValidation.valid) {
      await bot.sendMessage(chatId, sizeValidation.reason);
      return;
    }

    // 7. Moderatsiyaga yuborish (kontentni tekshirish)
    const modCheck = await sendToModerationChannel(bot, msg, mediaType, fileId, recipientId);
    if (!modCheck.success) {
      await bot.sendMessage(chatId, '⚠️ Media tekshirilmadi. Qayta urinib ko\'ring.');
      return;
    }

    // 8. Media recordni yaratish
    const mediaRecord = createMediaRecord(msg, mediaType, fileId, recipientId, senderId);
    const savedMessage = await Message.create(mediaRecord);

    // 9. Media qabul qiluvchiga yuborish
    let sentMessage;
    switch(mediaType) {
      case 'photo':
        sentMessage = await bot.sendPhoto(recipientId, fileId, {
          caption: `🎭 Sizga anonim ${mediaType} keldi!\n\n💬 Javob berish uchun tugmani bosing.`,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Javob berish', callback_data: `reply_${savedMessage._id}` }
            ]]
          }
        });
        break;
      case 'audio':
        sentMessage = await bot.sendAudio(recipientId, fileId, {
          caption: `🎭 Sizga anonim audio keldi!`,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Javob berish', callback_data: `reply_${savedMessage._id}` }
            ]]
          }
        });
        break;
      case 'animation':
        sentMessage = await bot.sendAnimation(recipientId, fileId, {
          caption: `🎭 Sizga anonim GIF keldi!`,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Javob berish', callback_data: `reply_${savedMessage._id}` }
            ]]
          }
        });
        break;
      case 'document':
        sentMessage = await bot.sendDocument(recipientId, fileId, {
          caption: `🎭 Sizga anonim fayl keldi!`,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Javob berish', callback_data: `reply_${savedMessage._id}` }
            ]]
          }
        });
        break;
    }

    // 10. Yuboruvchiga tasdiqlash
    await bot.sendMessage(chatId,
      `✅ ${mediaType.toUpperCase()} muvaffaqiyatli yuborildi!\n\n` +
      `🔒 Sizning shaxsingiz anonim qoldi.`
    );

    // 11. Media faylni DB dan o'chirish (2 soat keyin yoki yuklab olingandan keyin)
    // Hozir - darhol o'chiramiz (Telegram ning o'zida saqlangan)
    setTimeout(async () => {
      try {
        await Message.updateOne(
          { _id: savedMessage._id },
          { isDeleted: true }
        );
        console.log(`🗑️ Media record o'chirildi: ${savedMessage._id}`);
      } catch (error) {
        console.error('❌ Record o\'chirilmadi:', error);
      }
    }, 2 * 60 * 60 * 1000); // 2 soat

    console.log(`📨 Media yuborildi: ${senderId} → ${recipientId} (${mediaType})`);

  } catch (error) {
    console.error('❌ Media yuborishda xato:', error);
    await bot.sendMessage(chatId, '❌ Media yuborishda xatolik yuz berdi.');
  }
}

module.exports = {
  handleMediaSend,
  getMediaType,
  canSendMedia,
  validateMediaType,
  validateFileSize,
  sendToModerationChannel,
  deleteMediaFile,
  MAX_FILE_SIZE,
  ALLOWED_MEDIA_TYPES,
  BLOCKED_MEDIA_TYPES
};