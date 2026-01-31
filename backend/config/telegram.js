const TELEGRAM_CONFIG = {
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  UPLOAD_BOT_TOKEN: process.env.UPLOAD_BOT_TOKEN,
  BOT_USERNAME: (process.env.BOT_USERNAME || "").replace(/^@/, ""),
  UPLOAD_BOT_USERNAME: (process.env.UPLOAD_BOT_USERNAME || "@ArcXzoneuploads_bot").replace(/^@/, ""),
  CHANNELS: {
    MOVIES: process.env.MOVIES_CHANNEL_ID,
    WEBSERIES: process.env.WEBSERIES_CHANNEL_ID,
    ANIME: process.env.ANIME_CHANNEL_ID,
    STORAGE: process.env.STORAGE_CHANNEL_ID,
    FORCEBOT: process.env.FORCEBOT_CHANNEL_ID
  },
  ADMIN_USERS: (() => {
    const adminIds = process.env.INITIAL_ADMIN_ID;
    if (!adminIds) {
      console.warn('⚠️ ADMIN_TELEGRAM_IDS not set in environment');
      return [];
    }
    
    // Split by comma, trim, convert to numbers, filter out NaN
    const ids = adminIds.split(',')
      .map(id => id.trim())
      .map(id => parseInt(id))
      .filter(id => !isNaN(id) && id > 0);
    
    console.log('✅ Parsed admin IDs:', ids);
    return ids;
  })()

};

console.log(TELEGRAM_CONFIG.BOT_TOKEN)
module.exports = TELEGRAM_CONFIG;