const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
    seriesId: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['webseries', 'anime'], required: true },
    description: String,
    year: Number,
    genre: [String],
    telegramChannel: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seasons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Season' }],
    uploadStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], 
        default: 'pending' 
    },
    uploadError: String,
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

// Static method to cleanup cancelled series
SeriesSchema.statics.cleanupCancelled = async function() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cancelledSeries = await this.find({ 
        uploadStatus: 'cancelled',
        createdAt: { $lt: oneHourAgo }
    });
    
    for (const series of cancelledSeries) {
        // Delete all seasons and episodes
        const seasons = await mongoose.model('Season').find({ series: series._id });
        for (const season of seasons) {
            await mongoose.model('Episode').deleteMany({ season: season._id });
            await mongoose.model('Season').deleteOne({ _id: season._id });
        }
        await this.deleteOne({ _id: series._id });
    }
    
    return cancelledSeries.length;
};

module.exports = mongoose.model('Series', SeriesSchema);