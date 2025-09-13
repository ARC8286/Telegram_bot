const mongoose = require('mongoose');

const SeasonSchema = new mongoose.Schema({
    seasonNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
    episodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Episode' }],
    addedAt: { type: Date, default: Date.now }
});

// Add index for better performance
SeasonSchema.index({ series: 1, seasonNumber: 1 });

module.exports = mongoose.model('Season', SeasonSchema);