const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const User = require('../models/User');
const { generateContentId, generateEpisodeId } = require('../utils/idGenerator');
const TELEGRAM_CONFIG = require('../config/telegram'); // Add this import

class UploadBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.UPLOAD_BOT_TOKEN; // Use from config
        this.botUsername = TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME;
        this.pendingOperations = new Map();
        this.seriesCreationState = new Map();
        
        console.log('UploadBot token check:', !!this.botToken);
        
        if (this.botToken) {
            this.bot = new Telegraf(this.botToken);
            this.setupHandlers();
        } else {
            console.warn('UPLOAD_BOT_TOKEN not found. Upload bot functionality disabled.');
        }
    }
    
    start() {
        if (!this.bot) return;
        
        this.bot.launch().then(() => {
            console.log('✅ Upload Telegram bot started successfully');
        }).catch(err => {
            console.error('❌ Error starting Upload Telegram bot:', err);
        });
    }
    
    setupHandlers() {
        // Start command
        this.bot.start(async (ctx) => {
            const userId = ctx.from.id;
            
            let user = await User.findOne({ telegramId: userId });
            if (!user) {
                user = new User({
                    telegramId: userId,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    isAdmin: false,
                    canUpload: false
                });
                await user.save();
            }
            
            if (user.canUpload || user.isAdmin) {
                await ctx.reply(`Welcome ${ctx.from.first_name}! You can upload content using:
/uploadmovie - Upload a movie
/uploadseries - Create a series with episodes
/cancel - Cancel current operation`);
            } else {
                await ctx.reply(`Hello ${ctx.from.first_name}! You don't have upload permissions yet.`);
            }
        });
        
        // Upload movie command
        this.bot.command('uploadmovie', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to upload content.');
            }
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId)) {
                return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
            }
            
            this.pendingOperations.set(userId, {
                type: 'movie',
                step: 'awaiting_title',
                data: {}
            });
            
            await ctx.reply('🎬 Let\'s upload a movie!\n\nPlease send me the movie title:');
        });
        
        // Upload series command
        this.bot.command('uploadseries', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to upload content.');
            }
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId)) {
                return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
            }
            
            // Start series creation process
            this.seriesCreationState.set(userId, {
                step: 'awaiting_series_type',
                data: {
                    type: '',
                    title: '',
                    year: '',
                    description: '',
                    genre: [],
                    channel: '',
                    seasons: []
                }
            });
            
            await ctx.reply('🎬 Let\'s create a series!\n\nFirst, what type of series is this?\n\nPlease reply with: webseries or anime');
        });
        
        // Cancel command
        this.bot.command('cancel', async (ctx) => {
            const userId = ctx.from.id;
            
            if (this.pendingOperations.has(userId)) {
                this.pendingOperations.delete(userId);
                await ctx.reply('✅ Operation cancelled successfully.');
            } else if (this.seriesCreationState.has(userId)) {
                this.seriesCreationState.delete(userId);
                await ctx.reply('✅ Series creation cancelled successfully.');
            } else {
                await ctx.reply('❌ No pending operation to cancel.');
            }
        });
        
        // Text message handler for conversation flow
        this.bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            const messageText = ctx.message.text;
            
            // Handle series creation
            if (this.seriesCreationState.has(userId)) {
                await this.handleSeriesCreation(ctx, userId, messageText);
                return;
            }
            
            // Handle movie upload
            if (this.pendingOperations.has(userId)) {
                await this.handleMovieUpload(ctx, userId, messageText);
            }
        });
        
        // File upload handler
        this.bot.on(['document', 'video'], async (ctx) => {
            const userId = ctx.from.id;
            
            if (this.seriesCreationState.has(userId)) {
                await this.handleSeriesFileUpload(ctx, userId);
            } else if (this.pendingOperations.has(userId)) {
                await this.handleMovieFileUpload(ctx, userId);
            }
        });
    }
    
    async handleMovieUpload(ctx, userId, messageText) {
        const state = this.pendingOperations.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_title':
                    state.data.title = messageText;
                    state.step = 'awaiting_year';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('Great! Now what year was this movie released?');
                    break;
                    
                case 'awaiting_year':
                    const year = parseInt(messageText);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    
                    state.data.year = year;
                    state.step = 'awaiting_genre';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('Good! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama):');
                    break;
                    
                case 'awaiting_genre':
                    state.data.genre = messageText.split(',').map(g => g.trim());
                    state.step = 'awaiting_description';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('Now please provide a description (or type "skip" to skip this):');
                    break;
                    
                case 'awaiting_description':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.description = messageText;
                    }
                    state.step = 'awaiting_channel';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('Now which channel should I upload this movie to? Please choose:\n\n• MOVIES');
                    break;
                    
                case 'awaiting_channel':
                    if (messageText.toUpperCase() !== 'MOVIES') {
                        return ctx.reply('❌ Invalid channel. Please choose: MOVIES');
                    }
                    
                    state.data.channel = TELEGRAM_CONFIG.CHANNELS.MOVIES;
                    state.step = 'awaiting_file';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('Perfect! Now please send me the movie file:');
                    break;
                    
                default:
                    this.pendingOperations.delete(userId);
                    await ctx.reply('❌ Operation cancelled due to unexpected error.');
            }
        } catch (error) {
            console.error('Error in movie upload:', error);
            this.pendingOperations.delete(userId);
            await ctx.reply('❌ An error occurred. Please start over with /uploadmovie.');
        }
    }
    
    async handleMovieFileUpload(ctx, userId) {
        const state = this.pendingOperations.get(userId);
        
        if (state.step !== 'awaiting_file') {
            return ctx.reply('❌ Please complete the previous steps first.');
        }
        
        try {
            const file = ctx.message.document || ctx.message.video;
            const fileId = file.file_id;
            
            // Upload file to channel
            const caption = this.generateMovieCaption(state.data);
            const isVideo = ctx.message.video !== undefined;
            
            let response;
            if (isVideo) {
                response = await this.bot.telegram.sendVideo(
                    state.data.channel,
                    fileId,
                    { caption: caption, parse_mode: 'HTML' }
                );
            } else {
                response = await this.bot.telegram.sendDocument(
                    state.data.channel,
                    fileId,
                    { caption: caption, parse_mode: 'HTML' }
                );
            }
            
            // Create content record
            const contentId = generateContentId('movie', state.data.title, state.data.year);
            const user = await User.findOne({ telegramId: userId });
            
            const newContent = new Content({
                contentId,
                title: state.data.title,
                type: 'movie',
                description: state.data.description || '',
                year: state.data.year,
                genre: state.data.genre,
                telegramMessageId: response.message_id.toString(),
                telegramChannel: state.data.channel,
                uploadedBy: user._id,
                uploadStatus: 'completed'
            });
            
            await newContent.save();
            
            // Generate deep link
            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${contentId}`;
            
            await ctx.reply(`✅ Movie uploaded successfully!\n\nTitle: ${state.data.title}\nDeep Link: ${deepLink}`);
            
            // Clean up
            this.pendingOperations.delete(userId);
            
        } catch (error) {
            console.error('Error uploading movie:', error);
            this.pendingOperations.delete(userId);
            await ctx.reply('❌ Failed to upload movie. Please try again with /uploadmovie.');
        }
    }
    
    generateMovieCaption(movieData) {
        let caption = `<b>${movieData.title}</b> (${movieData.year})\n`;
        
        if (movieData.description) {
            caption += `\n${movieData.description}`;
        }
        
        if (movieData.genre && movieData.genre.length > 0) {
            caption += `\n\nGenre: ${movieData.genre.join(', ')}`;
        }
        
        caption += `\n\nUploaded via @${this.botUsername}`;
        
        return caption;
    }
    
    async handleSeriesCreation(ctx, userId, messageText) {
        // Implementation for series creation would go here
        // This would be similar to your existing implementation
        await ctx.reply('Series creation is not yet implemented.');
        this.seriesCreationState.delete(userId);
    }
    
    async handleSeriesFileUpload(ctx, userId) {
        // Implementation for series file upload would go here
        await ctx.reply('Series file upload is not yet implemented.');
        this.seriesCreationState.delete(userId);
    }
}

module.exports = UploadBot;