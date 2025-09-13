const mongoose = require('mongoose');

const EpisodeSchema = new mongoose.Schema({
    episodeNumber: { type: Number, required: true },
    title: { type: String, required: true },
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true },
    telegramMessageId: { type: String },
    contentId: { type: String, required: true, unique: true },
    telegramLink: { type: String },
    addedAt: { type: Date, default: Date.now }
});

EpisodeSchema.index({ contentId: 1 });
// Add index for season + episodeNumber to prevent duplicates
EpisodeSchema.index({ season: 1, episodeNumber: 1 }, { unique: true });

module.exports = mongoose.model('Episode', EpisodeSchema);