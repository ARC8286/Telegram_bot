const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
    seriesId: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['webseries', 'anime'], required: true },
    description: String,
    year: Number,
    genre: [String],
    telegramChannel: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seasons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Season' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

SeriesSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Add indexes for better performance
SeriesSchema.index({ seriesId: 1 });
SeriesSchema.index({ title: 1 });
SeriesSchema.index({ type: 1 });
SeriesSchema.index({ year: 1 });

module.exports = mongoose.model('Series', SeriesSchema);