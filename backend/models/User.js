const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    // Telegram user information
    telegramId: { 
        type: Number, 
        required: true, 
        unique: true 
    },
    username: { 
        type: String, 
        trim: true,
        sparse: true // Allows multiple null values but enforces uniqueness for non-null values
    },
    firstName: { 
        type: String, 
        trim: true,
        required: true 
    },
    lastName: { 
        type: String, 
        trim: true 
    },
    
    // Authentication (for web admin panel)
    email: {
        type: String,
        trim: true,
        lowercase: true,
        sparse: true
    },
    password: {
        type: String,
        minlength: 6
    },
    
    // Permissions and roles
    isAdmin: { 
        type: Boolean, 
        default: false 
    },
    canUpload: { 
        type: Boolean, 
        default: false 
    },
    roles: [{
        type: String,
        enum: ['content_manager', 'moderator', 'support', 'viewer']
    }],
    
    // User activity tracking
    uploadCount: { 
        type: Number, 
        default: 0 
    },
    lastUpload: { 
        type: Date 
    },
    permissionRequested: { 
        type: Boolean, 
        default: false 
    },
    lastActivity: { 
        type: Date, 
        default: Date.now 
    },
    
    // User preferences
    preferences: {
        notifications: {
            newContent: { type: Boolean, default: true },
            uploadStatus: { type: Boolean, default: true },
            adminAlerts: { type: Boolean, default: false }
        },
        language: {
            type: String,
            default: 'en',
            enum: ['en', 'hi', 'es', 'fr', 'de', 'ru', 'zh', 'ja', 'ar']
        }
    },
    
    // Account status
    isActive: { 
        type: Boolean, 
        default: true 
    },
    isBanned: { 
        type: Boolean, 
        default: false 
    },
    banReason: { 
        type: String 
    },
    banExpires: { 
        type: Date 
    },
    
    // Timestamps
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Indexes for better query performance
UserSchema.index({ telegramId: 1 });
UserSchema.index({ username: 1 }, { sparse: true });
UserSchema.index({ isAdmin: 1 });
UserSchema.index({ canUpload: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastActivity: -1 });

// Update timestamp before saving
UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Hash password if it's modified
    if (this.isModified('password') && this.password) {
        this.password = bcrypt.hashSync(this.password, 12);
    }
    
    next();
});

// Method to check password (for web authentication)
UserSchema.methods.comparePassword = function(candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compareSync(candidatePassword, this.password);
};

// Method to get user profile (excluding sensitive data)
UserSchema.methods.getProfile = function() {
    return {
        telegramId: this.telegramId,
        username: this.username,
        firstName: this.firstName,
        lastName: this.lastName,
        isAdmin: this.isAdmin,
        canUpload: this.canUpload,
        roles: this.roles,
        uploadCount: this.uploadCount,
        lastActivity: this.lastActivity,
        createdAt: this.createdAt,
        isActive: this.isActive
    };
};

// Static method to find or create user from Telegram data
UserSchema.statics.findOrCreateFromTelegram = async function(telegramUser) {
    let user = await this.findOne({ telegramId: telegramUser.id });
    
    if (!user) {
        user = new this({
            telegramId: telegramUser.id,
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name
        });
        await user.save();
    } else {
        // Update user information if it has changed
        const updates = {};
        if (telegramUser.username !== user.username) updates.username = telegramUser.username;
        if (telegramUser.first_name !== user.firstName) updates.firstName = telegramUser.first_name;
        if (telegramUser.last_name !== user.lastName) updates.lastName = telegramUser.last_name;
        
        if (Object.keys(updates).length > 0) {
            user = await this.findByIdAndUpdate(
                user._id,
                { ...updates, lastActivity: new Date() },
                { new: true }
            );
        }
    }
    
    return user;
};

// Static method to get user statistics
UserSchema.statics.getStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                adminUsers: { $sum: { $cond: [{ $eq: ['$isAdmin', true] }, 1, 0] } },
                uploadUsers: { $sum: { $cond: [{ $eq: ['$canUpload', true] }, 1, 0] } },
                activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                bannedUsers: { $sum: { $cond: [{ $eq: ['$isBanned', true] }, 1, 0] } },
                totalUploads: { $sum: '$uploadCount' },
                avgUploads: { $avg: '$uploadCount' }
            }
        }
    ]);
    
    return stats.length > 0 ? stats[0] : {
        totalUsers: 0,
        adminUsers: 0,
        uploadUsers: 0,
        activeUsers: 0,
        bannedUsers: 0,
        totalUploads: 0,
        avgUploads: 0
    };
};

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
    return `${this.firstName}${this.lastName ? ' ' + this.lastName : ''}`;
});

// Virtual for account age
UserSchema.virtual('accountAge').get(function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)); // Days
});

// Export the model
module.exports = mongoose.model('User', UserSchema);