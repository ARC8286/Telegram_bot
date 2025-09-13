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
  }
};

console.log(TELEGRAM_CONFIG)
module.exports = TELEGRAM_CONFIG;