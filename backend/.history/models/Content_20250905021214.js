const mongoose = require('mongoose');

const ContentSchema = new mongoose.Schema({
    contentId: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['movie'], required: true },
    description: String,
    year: Number,
    genre: [String],
    telegramMessageId: { type: String, required: true },
    telegramChannel: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed'], 
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

module.exports = mongoose.model('Content', ContentSchema);