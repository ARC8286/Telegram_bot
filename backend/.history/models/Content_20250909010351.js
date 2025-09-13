const mongoose = require('mongoose');

const ContentSchema = new mongoose.Schema({
    contentId: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['movie'], required: true },
    description: String,
    year: Number,
    genre: [String],
    telegramMessageId: { type: String },
    telegramChannel: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], 
        default: 'pending' 
    },
    uploadError: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

ContentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

ContentSchema.index({ contentId: 1 });

// Static method to cleanup cancelled content
ContentSchema.statics.cleanupCancelled = async function() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.deleteMany({ 
        uploadStatus: 'cancelled',
        createdAt: { $lt: oneHourAgo }
    });
};

module.exports = mongoose.model('Content', ContentSchema);