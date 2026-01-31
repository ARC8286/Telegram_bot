const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema({
    telegramId: {
        type: Number,
        required: true,
        index: true
    },
    username: String,
    firstName: String,
    lastName: String,
    contentId: String,
    contentType: {
        type: String,
        enum: ['movie', 'episode', 'series_selection', 'bot_start', 'unknown_content'],
        required: true
    },
    movieName: String,
    seriesName: String,
    seasonNumber: Number,
    episodeNumber: Number,
    episodeTitle: String,
    ipAddress: String,
    userAgent: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    requestDetails: Object,
    status: {
        type: String,
        enum: ['requested', 'delivered', 'failed', 'not_found'],
        default: 'requested'
    },
    messageIds: [Number],
    errorMessage: String
});

// Add indexes for better query performance
trackSchema.index({ timestamp: -1 });
trackSchema.index({ contentType: 1 });
trackSchema.index({ telegramId: 1, timestamp: -1 });

module.exports = mongoose.model('Track', trackSchema);