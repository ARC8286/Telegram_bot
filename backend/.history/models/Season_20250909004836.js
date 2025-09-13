const mongoose = require('mongoose');

const SeasonSchema = new mongoose.Schema({
    seasonNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
    episodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Episode' }],
    addedAt: { type: Date, default: Date.now }
});

// Add correct index for better performance (series + seasonNumber should be unique)
SeasonSchema.index({ series: 1, seasonNumber: 1 }, { unique: true });

module.exports = mongoose.model('Season', SeasonSchema);