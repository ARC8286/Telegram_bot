const mongoose = require('mongoose');

const SeasonSchema = new mongoose.Schema({
    seasonNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
    episodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Episode' }],
    addedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Season', SeasonSchema);