{
  recipientId: Number,
  senderId: Number,
  content: String,
  messageType: 'text' | 'media',
  
  // Media maydonlari (YANGI)
  mediaType: 'photo' | 'audio' | 'animation' | 'document',
  fileId: String,           // Telegram file ID
  fileName: String,         // Asl fayl nomi
  fileSize: Number,         // Bayt-da o'lcham
  localPath: String,        // Server-dagi path (ixtiyoriy)
  
  // Moderatsiya (YANGI)
  isFlagged: Boolean,
  isModerated: Boolean,
  flagReason: String,
  
  timestamp: Date,
  hasReplied: Boolean,
  isDeleted: Boolean
}