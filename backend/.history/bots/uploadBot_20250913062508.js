const { Telegraf, Markup, session } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const User = require('../models/User');
const { generateContentId, generateSeriesId, generateEpisodeId } = require('../utils/idGenerator');
const { formatFileSize, validateYear, validateGenres } = require('../utils/validationHelpers');
const TELEGRAM_CONFIG = require('../config/telegram');

class AdvancedUploadBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.UPLOAD_BOT_TOKEN;
        this.botUsername = TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME;
        this.userStates = new Map();
        this.rateLimits = new Map();
        
        console.log('Advanced UploadBot initialized:', !!this.botToken);
        
        if (this.botToken) {
            this.bot = new Telegraf(this.botToken);
            this.setupMiddlewares();
            this.setupHandlers();
        } else {
            console.warn('UPLOAD_BOT_TOKEN not found. Upload bot functionality disabled.');
        }
    }
    
    start() {
        if (!this.bot) return;
        
        this.bot.launch().then(() => {
            console.log('✅ Advanced Upload Telegram bot started successfully');
        }).catch(err => {
            console.error('❌ Error starting Advanced Upload Telegram bot:', err);
        });
        
        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
    
    setupMiddlewares() {
        // Session middleware for conversation state
        this.bot.use(session());
        
        // Rate limiting middleware
        this.bot.use(async (ctx, next) => {
            const userId = ctx.from.id;
            const now = Date.now();
            const windowMs = 1000; // 1 second window
            const maxRequests = 5; // Max 5 requests per second
            
            if (!this.rateLimits.has(userId)) {
                this.rateLimits.set(userId, { count: 1, lastReset: now });
                return next();
            }
            
            const userLimit = this.rateLimits.get(userId);
            
            // Reset counter if window has passed
            if (now - userLimit.lastReset > windowMs) {
                userLimit.count = 1;
                userLimit.lastReset = now;
                this.rateLimits.set(userId, userLimit);
                return next();
            }
            
            // Check if user has exceeded limit
            if (userLimit.count >= maxRequests) {
                await ctx.reply('⚠️ Too many requests. Please slow down.');
                return;
            }
            
            // Increment counter and continue
            userLimit.count++;
            this.rateLimits.set(userId, userLimit);
            return next();
        });
        
        // Authentication middleware
        this.bot.use(async (ctx, next) => {
            // Skip authentication for start command
            if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start')) {
                return next();
            }
            
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                await ctx.reply('❌ You do not have permission to use this bot.');
                return;
            }
            
            ctx.user = user;
            return next();
        });
    }
    
    setupHandlers() {
        // Start command with inline keyboard
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
                const welcomeMessage = `🎬 Welcome ${ctx.from.first_name} to Advanced Upload Bot!\n\nWhat would you like to do today?`;
                
                await ctx.reply(welcomeMessage, Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🎥 Upload Movie', 'upload_movie'),
                        Markup.button.callback('📺 Create Series', 'upload_series')
                    ],
                    [
                        Markup.button.callback('➕ Add Season', 'add_season'),
                        Markup.button.callback('➕ Add Episode', 'add_episode')
                    ],
                    [
                        Markup.button.callback('👁️ View Content', 'view_content'),
                        Markup.button.callback('🔍 Find Content', 'find_content')
                    ],
                    [
                        Markup.button.callback('✏️ Edit Content', 'edit_content'),
                        Markup.button.callback('🗑️ Delete Content', 'delete_content')
                    ]
                ]));
            } else {
                await ctx.reply(`👋 Hello ${ctx.from.first_name}!\n\nYou don't have upload permissions yet. Please contact an administrator.`);
            }
        });
        
        // Command handlers
        this.setupCommandHandlers();
        
        // Callback query handlers for inline buttons
        this.setupCallbackHandlers();
        
        // Text message handler for conversation flow
        this.bot.on('text', async (ctx) => {
            await this.handleTextMessage(ctx);
        });
        
        // File upload handler
        this.bot.on(['document', 'video'], async (ctx) => {
            await this.handleFileUpload(ctx);
        });
        
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error in advanced upload bot:`, err);
            ctx.reply('❌ An unexpected error occurred. Please try again or contact support.');
        });
    }
    
    setupCommandHandlers() {
        // Upload movie command
        this.bot.command('uploadmovie', async (ctx) => {
            await this.initiateMovieUpload(ctx);
        });
        
        // Upload series command
        this.bot.command('uploadseries', async (ctx) => {
            await this.initiateSeriesCreation(ctx);
        });
        
        // Add season command
        this.bot.command('addseason', async (ctx) => {
            await this.initiateAddSeason(ctx);
        });
        
        // Add episode command
        this.bot.command('addepisode', async (ctx) => {
            await this.initiateAddEpisode(ctx);
        });
        
        // View content command
        this.bot.command('viewcontent', async (ctx) => {
            await this.showAllContent(ctx);
        });
        
        // Find content command
        this.bot.command('findcontent', async (ctx) => {
            await this.initiateContentSearch(ctx);
        });
        
        // Edit content command
        this.bot.command('editcontent', async (ctx) => {
            await this.initiateContentEdit(ctx);
        });
        
        // Delete content command
        this.bot.command('deletecontent', async (ctx) => {
            await this.initiateContentDeletion(ctx);
        });
        
        // Cancel command
        this.bot.command('cancel', async (ctx) => {
            await this.cancelOperation(ctx);
        });
        
        // Help command
        this.bot.command('help', async (ctx) => {
            await this.showHelp(ctx);
        });
        
        // Stats command
        this.bot.command('stats', async (ctx) => {
            await this.showStats(ctx);
        });
    }
    
    setupCallbackHandlers() {
        // Handle inline button callbacks
        this.bot.action('upload_movie', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateMovieUpload(ctx);
        });
        
        this.bot.action('upload_series', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateSeriesCreation(ctx);
        });
        
        this.bot.action('add_season', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateAddSeason(ctx);
        });
        
        this.bot.action('add_episode', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateAddEpisode(ctx);
        });
        
        this.bot.action('view_content', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showAllContent(ctx);
        });
        
        this.bot.action('find_content', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateContentSearch(ctx);
        });
        
        this.bot.action('edit_content', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateContentEdit(ctx);
        });
        
        this.bot.action('delete_content', async (ctx) => {
            await ctx.answerCbQuery();
            await this.initiateContentDeletion(ctx);
        });
        
        // Edit field selection callbacks
        this.bot.action(/edit_field_(.+)/, async (ctx) => {
            await ctx.answerCbQuery();
            const field = ctx.match[1];
            await this.handleEditFieldSelection(ctx, field);
        });
        
        // Delete confirmation callbacks
        this.bot.action('confirm_delete', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleDeleteConfirmation(ctx, true);
        });
        
        this.bot.action('cancel_delete', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleDeleteConfirmation(ctx, false);
        });
    }
    
    async initiateMovieUpload(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'movie',
            step: 'awaiting_title',
            data: {}
        });
        
        await ctx.reply('🎬 Let\'s upload a movie!\n\nPlease send me the movie title:');
    }
    
    async initiateSeriesCreation(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'series_creation',
            step: 'awaiting_series_type',
            data: {}
        });
        
        await ctx.reply('📺 Let\'s create a series!\n\nWhat type of series is this?', Markup.inlineKeyboard([
            [Markup.button.callback('Web Series', 'series_type_webseries')],
            [Markup.button.callback('Anime', 'series_type_anime')]
        ]));
    }
    
    async initiateAddSeason(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'add_season',
            step: 'awaiting_series_id',
            data: {}
        });
        
        await ctx.reply('➕ Let\'s add a season to an existing series!\n\nPlease send me the series ID:');
    }
    
    async initiateAddEpisode(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'add_episode',
            step: 'awaiting_series_id',
            data: {}
        });
        
        await ctx.reply('➕ Let\'s add an episode to an existing season!\n\nPlease send me the series ID:');
    }
    
    async initiateContentSearch(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'find',
            step: 'awaiting_search_query',
            data: {}
        });
        
        await ctx.reply('🔍 Let\'s find content!\n\nPlease send me the title or content ID to search for:');
    }
    
    async initiateContentEdit(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'edit',
            step: 'awaiting_content_id',
            data: {}
        });
        
        await ctx.reply('✏️ Let\'s edit content!\n\nPlease send me the content ID of the item you want to edit:');
    }
    
    async initiateContentDeletion(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        this.userStates.set(userId, {
            type: 'delete',
            step: 'awaiting_content_id',
            data: {}
        });
        
        await ctx.reply('🗑️ Let\'s delete content!\n\nPlease send me the content ID of the item you want to delete:');
    }
    
    async cancelOperation(ctx) {
        const userId = ctx.from.id;
        
        if (this.userStates.has(userId)) {
            this.userStates.delete(userId);
            await ctx.reply('✅ Operation cancelled successfully.');
        } else {
            await ctx.reply('❌ No pending operation to cancel.');
        }
    }
    
    async showHelp(ctx) {
        const helpMessage = `🤖 Advanced Upload Bot Help

🎬 Content Management:
/uploadmovie - Upload a movie
/uploadseries - Create a series with episodes
/addseason - Add a season to existing series
/addepisode - Add an episode to existing season

📋 Content Operations:
/viewcontent - View all content
/findcontent - Find specific content
/editcontent - Edit existing content
/deletecontent - Delete content

⚙️ Utilities:
/cancel - Cancel current operation
/help - Show this help message
/stats - Show your upload statistics

💡 Tips:
• Use the inline keyboard for quick access
• You can upload videos or documents
• File size limit: 2GB (Telegram limit)
• Use /cancel if you get stuck in an operation`;

        await ctx.reply(helpMessage);
    }
    
    async showStats(ctx) {
        const userId = ctx.from.id;
        const user = await User.findOne({ telegramId: userId });
        
        if (!user) {
            return ctx.reply('❌ User not found.');
        }
        
        // Get user's upload stats
        const movieCount = await Content.countDocuments({ uploadedBy: user._id });
        const seriesCount = await Series.countDocuments({ uploadedBy: user._id });
        const episodeCount = await Episode.countDocuments().populate({
            path: 'season',
            populate: {
                path: 'series',
                match: { uploadedBy: user._id }
            }
        });
        
        const statsMessage = `📊 Your Upload Statistics

👤 User: ${user.firstName} ${user.lastName || ''}
📅 Member since: ${user.createdAt.toLocaleDateString()}

📈 Upload Stats:
🎬 Movies: ${movieCount}
📺 Series: ${seriesCount}
🎞️ Episodes: ${episodeCount}

🕒 Last upload: ${user.lastUpload ? user.lastUpload.toLocaleDateString() : 'Never'}`;

        await ctx.reply(statsMessage);
    }
    
    async handleTextMessage(ctx) {
        const userId = ctx.from.id;
        const messageText = ctx.message.text;
        
        if (!this.userStates.has(userId)) {
            return ctx.reply('❌ No active operation. Use /help to see available commands.');
        }
        
        const state = this.userStates.get(userId);
        
        try {
            switch (state.type) {
                case 'movie':
                    await this.handleMovieUploadText(ctx, userId, messageText, state);
                    break;
                case 'series_creation':
                    await this.handleSeriesCreationText(ctx, userId, messageText, state);
                    break;
                case 'add_season':
                case 'add_episode':
                    await this.handleSeriesEditText(ctx, userId, messageText, state);
                    break;
                case 'find':
                case 'edit':
                case 'delete':
                    await this.handleContentOperationsText(ctx, userId, messageText, state);
                    break;
                default:
                    this.userStates.delete(userId);
                    await ctx.reply('❌ Unknown operation type. Please start over.');
            }
        } catch (error) {
            console.error('Error handling text message:', error);
            this.userStates.delete(userId);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    }
    
    async handleMovieUploadText(ctx, userId, messageText, state) {
        switch (state.step) {
            case 'awaiting_title':
                state.data.title = messageText;
                state.step = 'awaiting_year';
                this.userStates.set(userId, state);
                
                await ctx.reply('Great! Now what year was this movie released?');
                break;
                
            case 'awaiting_year':
                if (!validateYear(messageText)) {
                    return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                }
                
                state.data.year = parseInt(messageText);
                state.step = 'awaiting_genre';
                this.userStates.set(userId, state);
                
                await ctx.reply('Good! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama):');
                break;
                
            case 'awaiting_genre':
                const genres = validateGenres(messageText);
                if (!genres) {
                    return ctx.reply('❌ Invalid genres. Please provide at least one valid genre (comma-separated):');
                }
                
                state.data.genre = genres;
                state.step = 'awaiting_description';
                this.userStates.set(userId, state);
                
                await ctx.reply('Now please provide a description (or type "skip" to skip this):');
                break;
                
            case 'awaiting_description':
                if (messageText.toLowerCase() !== 'skip') {
                    state.data.description = messageText;
                }
                state.step = 'awaiting_channel';
                this.userStates.set(userId, state);
                
                await ctx.reply('Now which channel should I upload this movie to?', Markup.inlineKeyboard([
                    [Markup.button.callback('MOVIES', 'channel_MOVIES')]
                ]));
                break;
                
            case 'awaiting_channel':
                const channelName = messageText.toUpperCase();
                const channelId = TELEGRAM_CONFIG.CHANNELS[channelName];
                
                if (!channelId) {
                    return ctx.reply('❌ Invalid channel. Please choose: MOVIES');
                }
                
                state.data.channel = channelId;
                state.step = 'awaiting_file';
                this.userStates.set(userId, state);
                
                await ctx.reply('Perfect! Now please send me the movie file:');
                break;
                
            default:
                this.userStates.delete(userId);
                await ctx.reply('❌ Operation cancelled due to unexpected error.');
        }
    }
    
    async handleSeriesCreationText(ctx, userId, messageText, state) {
        switch (state.step) {
            case 'awaiting_series_title':
                state.data.title = messageText;
                state.step = 'awaiting_series_year';
                this.userStates.set(userId, state);
                
                await ctx.reply('Perfect! Now what year was this series released?');
                break;
                
            case 'awaiting_series_year':
                if (!validateYear(messageText)) {
                    return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                }
                
                state.data.year = parseInt(messageText);
                state.step = 'awaiting_series_description';
                this.userStates.set(userId, state);
                
                await ctx.reply('Good! Now please provide a short description (or type "skip" to skip this):');
                break;
                
            case 'awaiting_series_description':
                if (messageText.toLowerCase() !== 'skip') {
                    state.data.description = messageText;
                }
                state.step = 'awaiting_series_genre';
                this.userStates.set(userId, state);
                
                await ctx.reply('Almost done! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama or type "skip" to skip):');
                break;
                
            case 'awaiting_series_genre':
                if (messageText.toLowerCase() !== 'skip') {
                    const genres = validateGenres(messageText);
                    if (!genres) {
                        return ctx.reply('❌ Invalid genres. Please provide at least one valid genre (comma-separated):');
                    }
                    state.data.genre = genres;
                }
                state.step = 'awaiting_series_channel';
                this.userStates.set(userId, state);
                
                await ctx.reply('Now which channel should I upload this series to?', Markup.inlineKeyboard([
                    [Markup.button.callback('WEBSERIES', 'channel_WEBSERIES')],
                    [Markup.button.callback('ANIME', 'channel_ANIME')]
                ]));
                break;
                
            case 'awaiting_season_number':
                const seasonNumber = parseInt(messageText);
                if (isNaN(seasonNumber) || seasonNumber < 1) {
                    return ctx.reply('❌ Invalid season number. Please enter a valid number (e.g., 1):');
                }
                
                // Create new season
                const series = await Series.findOne({ seriesId: state.data.seriesId });
                const newSeason = new Season({
                    seasonNumber,
                    title: `Season ${seasonNumber}`,
                    series: series._id
                });
                
                await newSeason.save();
                
                // Add season to series
                series.seasons.push(newSeason._id);
                await series.save();
                
                // Update state
                state.data.currentSeason = newSeason._id;
                state.step = 'awaiting_season_title';
                this.userStates.set(userId, state);
                
                await ctx.reply('Season created! Now please provide a title for this season (or type "skip" to use default):');
                break;
                
            case 'awaiting_season_title':
                if (messageText.toLowerCase() !== 'skip') {
                    const season = await Season.findById(state.data.currentSeason);
                    season.title = messageText;
                    await season.save();
                }
                
                state.step = 'awaiting_episode_file';
                this.userStates.set(userId, state);
                
                await ctx.reply('Season title saved! Now please send the first episode file for this season.\n\nAfter sending the file, I\'ll ask for the episode details.');
                break;
                
            case 'awaiting_episode_number':
                const episodeNumber = parseInt(messageText);
                if (isNaN(episodeNumber) || episodeNumber < 1) {
                    return ctx.reply('❌ Invalid episode number. Please enter a valid number (e.g., 1):');
                }
                
                state.data.tempEpisode.episodeNumber = episodeNumber;
                state.step = 'awaiting_episode_title';
                this.userStates.set(userId, state);
                
                await ctx.reply('Episode number saved! Now please provide a title for this episode:');
                break;
                
            case 'awaiting_episode_title':
                if (!messageText.trim()) {
                    return ctx.reply('❌ Episode title cannot be empty. Please provide a title:');
                }
                
                state.data.tempEpisode.title = messageText.trim();
                
                // Now upload the file and create episode
                await this.uploadEpisodeFile(ctx, userId, state);
                break;
                
            case 'awaiting_next_action':
                const action = messageText.toLowerCase();
                
                if (action === 'next episode') {
                    state.step = 'awaiting_episode_file';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply('Great! Please send the next episode file:');
                } else if (action === 'new season') {
                    state.step = 'awaiting_season_number';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply('Let\'s create a new season! Please send the season number:');
                } else if (action === 'finish') {
                    // Finish series creation
                    const series = await Series.findOne({ seriesId: state.data.seriesId }).populate('seasons');
                    const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${state.data.seriesId}`;
                    
                    await ctx.reply(`✅ Series completed successfully!\n\nTitle: ${series.title}\nSeasons: ${series.seasons.length}\n\nDeep Link: ${deepLink}\n\nUsers can now access this series using the deep link.`);
                    
                    // Clean up
                    this.userStates.delete(userId);
                } else {
                    await ctx.reply('❌ Invalid action. Please choose: "next episode", "new season", or "finish"');
                }
                break;
                
            default:
                this.userStates.delete(userId);
                await ctx.reply('❌ Operation cancelled due to unexpected error.');
        }
    }
    
    async handleSeriesEditText(ctx, userId, messageText, state) {
        switch (state.step) {
            case 'awaiting_series_id':
                await this.processSeriesId(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_season_number':
                await this.processSeasonNumber(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_season_title':
                await this.processSeasonTitle(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_episode_number':
                await this.processEpisodeNumber(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_episode_title':
                await this.processEpisodeTitle(ctx, userId, messageText, state);
                break;
                
            default:
                this.userStates.delete(userId);
                await ctx.reply('❌ Operation cancelled due to unexpected error.');
        }
    }
    
    async handleContentOperationsText(ctx, userId, messageText, state) {
        switch (state.step) {
            case 'awaiting_search_query':
                await this.searchContent(ctx, userId, messageText);
                break;
                
            case 'awaiting_content_id':
                await this.processContentId(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_edit_field':
                await this.processEditField(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_edit_value':
                await this.processEditValue(ctx, userId, messageText, state);
                break;
                
            case 'awaiting_delete_confirmation':
                await this.processDeleteConfirmation(ctx, userId, messageText, state);
                break;
                
            default:
                this.userStates.delete(userId);
                await ctx.reply('❌ Operation cancelled due to unexpected error.');
        }
    }
    
    async handleFileUpload(ctx) {
        const userId = ctx.from.id;
        
        if (!this.userStates.has(userId)) {
            return ctx.reply('❌ No active operation. Please start an upload operation first.');
        }
        
        const state = this.userStates.get(userId);
        
        try {
            if (state.type === 'movie' && state.step === 'awaiting_file') {
                await this.handleMovieFileUpload(ctx, userId, state);
            } else if (state.type === 'series_creation' && state.step === 'awaiting_episode_file') {
                await this.handleSeriesFileUpload(ctx, userId, state);
            } else if (state.type === 'add_episode' && state.step === 'awaiting_episode_file') {
                await this.handleSeriesEditFileUpload(ctx, userId, state);
            } else {
                await ctx.reply('❌ Not expecting a file at this time. Please complete the previous steps first.');
            }
        } catch (error) {
            console.error('Error handling file upload:', error);
            this.userStates.delete(userId);
            await ctx.reply('❌ An error occurred while processing the file. Please try again.');
        }
    }
    
    async handleMovieFileUpload(ctx, userId, state) {
        const file = ctx.message.document || ctx.message.video;
        const fileId = file.file_id;
        const fileName = file.file_name || 'movie_file';
        const fileSize = file.file_size;
        
        // Check file size limit (2GB Telegram limit)
        if (fileSize > 2000 * 1024 * 1024) {
            return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
        }
        
        // Show uploading status
        await ctx.reply(`📤 Uploading file: ${fileName}\nSize: ${formatFileSize(fileSize)}...`);
        
        try {
            // Upload file to channel with clean metadata
            const caption = this.generateMovieCaption(state.data);
            const isVideo = ctx.message.video !== undefined;
            
            let response;
            if (isVideo) {
                response = await this.bot.telegram.sendVideo(
                    state.data.channel,
                    fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML',
                        supports_streaming: true
                    }
                );
            } else {
                response = await this.bot.telegram.sendDocument(
                    state.data.channel,
                    fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML'
                    }
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
                uploadStatus: 'completed',
                fileSize: fileSize,
                fileName: fileName
            });
            
            await newContent.save();
            
            // Update user's upload count
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            // Generate deep link
            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${contentId}`;
            
            await ctx.reply(`✅ Movie uploaded successfully!\n\n🎬 Title: ${state.data.title}\n📅 Year: ${state.data.year}\n📁 Channel: ${state.data.channel}\n💾 Size: ${formatFileSize(fileSize)}\n\n🔗 Deep Link: ${deepLink}`);
            
            // Clean up
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error uploading movie:', error);
            this.userStates.delete(userId);
            
            let errorMessage = '❌ Failed to upload movie. Please try again with /uploadmovie.';
            if (error.response && error.response.description) {
                errorMessage += `\n\nError: ${error.response.description}`;
            }
            
            await ctx.reply(errorMessage);
        }
    }
    
    async handleSeriesFileUpload(ctx, userId, state) {
        const file = ctx.message.document || ctx.message.video;
        const fileId = file.file_id;
        const fileSize = file.file_size;
        
        // Check file size limit
        if (fileSize > 2000 * 1024 * 1024) {
            return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
        }
        
        // Store file info temporarily
        state.data.tempEpisode = {
            fileId: fileId,
            fileSize: fileSize
        };
        
        state.step = 'awaiting_episode_number';
        this.userStates.set(userId, state);
        
        await ctx.reply('File received! Now please send the episode number (e.g., 1 for Episode 1):');
    }
    
    async uploadEpisodeFile(ctx, userId, state) {
        try {
            // Get series and season details
            const series = await Series.findOne({ seriesId: state.data.seriesId });
            const season = await Season.findById(state.data.currentSeason);
            
            // Show uploading status
            await ctx.reply(`📤 Uploading episode ${state.data.tempEpisode.episodeNumber}...`);
            
            // Upload file to channel with SIMPLIFIED caption
            const caption = this.generateSimpleEpisodeCaption(state.data.tempEpisode);
            const isVideo = state.data.tempEpisode.fileId.startsWith('BA'); // Telegram video file IDs start with BA
            
            let response;
            if (isVideo) {
                response = await this.bot.telegram.sendVideo(
                    series.telegramChannel,
                    state.data.tempEpisode.fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML',
                        supports_streaming: true
                    }
                );
            } else {
                response = await this.bot.telegram.sendDocument(
                    series.telegramChannel,
                    state.data.tempEpisode.fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML'
                    }
                );
            }
            
            // Create episode record with message ID
            const episodeContentId = generateEpisodeId(state.data.seriesId, season.seasonNumber, state.data.tempEpisode.episodeNumber);
            const user = await User.findOne({ telegramId: userId });
            
            const newEpisode = new Episode({
                episodeNumber: state.data.tempEpisode.episodeNumber,
                title: state.data.tempEpisode.title,
                season: season._id,
                telegramMessageId: response.message_id.toString(),
                telegramLink: `https://t.me/c/${series.telegramChannel.replace('-100', '')}/${response.message_id}`,
                contentId: episodeContentId,
                fileSize: state.data.tempEpisode.fileSize
            });
            
            await newEpisode.save();
            
            // Add episode to season
            season.episodes.push(newEpisode._id);
            await season.save();
            
            // Update user's upload count
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            state.step = 'awaiting_next_action';
            this.userStates.set(userId, state);
            
            await ctx.reply(`✅ Episode uploaded successfully!\n\nWhat would you like to do next?\n\n- Type "next episode" to add another episode to this season\n- Type "new season" to create a new season\n- Type "finish" to complete the series`);
            
        } catch (error) {
            console.error('Error uploading episode file:', error);
            await ctx.reply('❌ Failed to upload episode. Please try again.');
        }
    }
    
    async handleSeriesEditFileUpload(ctx, userId, state) {
        const file = ctx.message.document || ctx.message.video;
        const fileId = file.file_id;
        const fileSize = file.file_size;
        
        // Check file size limit
        if (fileSize > 2000 * 1024 * 1024) {
            return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
        }
        
        // Store file info temporarily
        state.tempEpisode.fileId = fileId;
        state.tempEpisode.fileSize = fileSize;
        
        // Upload the file and create episode
        await this.uploadEditEpisodeFile(ctx, userId, state);
    }
    
    async uploadEditEpisodeFile(ctx, userId, state) {
        try {
            // Show uploading status
            await ctx.reply(`📤 Uploading episode ${state.tempEpisode.episodeNumber}...`);
            
            // Upload file to channel with SIMPLIFIED caption
            const caption = this.generateSimpleEpisodeCaption(state.tempEpisode);
            const isVideo = state.tempEpisode.fileId.startsWith('BA'); // Telegram video file IDs start with BA
            
            let response;
            if (isVideo) {
                response = await this.bot.telegram.sendVideo(
                    state.series.telegramChannel,
                    state.tempEpisode.fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML',
                        supports_streaming: true
                    }
                );
            } else {
                response = await this.bot.telegram.sendDocument(
                    state.series.telegramChannel,
                    state.tempEpisode.fileId,
                    { 
                        caption: caption, 
                        parse_mode: 'HTML'
                    }
                );
            }
            
            // Create episode record with message ID
            const episodeContentId = generateEpisodeId(state.series.seriesId, state.currentSeason.seasonNumber, state.tempEpisode.episodeNumber);
            const user = await User.findOne({ telegramId: userId });
            
            const newEpisode = new Episode({
                episodeNumber: state.tempEpisode.episodeNumber,
                title: state.tempEpisode.title,
                season: state.currentSeason._id,
                telegramMessageId: response.message_id.toString(),
                telegramLink: `https://t.me/c/${state.series.telegramChannel.replace('-100', '')}/${response.message_id}`,
                contentId: episodeContentId,
                fileSize: state.tempEpisode.fileSize
            });
            
            await newEpisode.save();
            
            // Add episode to season
            state.currentSeason.episodes.push(newEpisode._id);
            await state.currentSeason.save();
            
            // Update user's upload count
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            await ctx.reply(`✅ Episode uploaded successfully!\n\nEpisode ${state.tempEpisode.episodeNumber}: ${state.tempEpisode.title}\n\nAdded to ${state.series.title} - Season ${state.currentSeason.seasonNumber}`);
            
            // Clean up
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error uploading episode file:', error);
            await ctx.reply('❌ Failed to upload episode. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    // Additional helper methods for processing various operations
    async processSeriesId(ctx, userId, seriesId, state) {
        try {
            // Check if it's a series
            const series = await Series.findOne({ seriesId });
            if (!series) {
                await ctx.reply('❌ Series not found. Please check the series ID and try again.');
                this.userStates.delete(userId);
                return;
            }
            
            state.series = series;
            
            if (state.type === 'add_season') {
                state.step = 'awaiting_season_number';
                this.userStates.set(userId, state);
                
                await ctx.reply(`✅ Series found: ${series.title}\n\nPlease send the season number you want to add:`);
            } else if (state.type === 'add_episode') {
                // Get all seasons for this series
                const seasons = await Season.find({ series: series._id }).sort({ seasonNumber: 1 });
                
                if (seasons.length === 0) {
                    await ctx.reply('❌ This series has no seasons yet. Please add a season first using /addseason.');
                    this.userStates.delete(userId);
                    return;
                }
                
                let response = `✅ Series found: ${series.title}\n\nAvailable seasons:\n`;
                seasons.forEach(season => {
                    response += `• Season ${season.seasonNumber}: ${season.title || 'No title'}\n`;
                });
                
                response += '\nPlease send the season number you want to add an episode to:';
                
                state.step = 'awaiting_season_number';
                state.seasons = seasons;
                this.userStates.set(userId, state);
                
                await ctx.reply(response);
            }
            
        } catch (error) {
            console.error('Error processing series ID:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processSeasonNumber(ctx, userId, seasonNumberText, state) {
        try {
            const seasonNumber = parseInt(seasonNumberText);
            if (isNaN(seasonNumber) || seasonNumber < 1) {
                return ctx.reply('❌ Invalid season number. Please enter a valid number (e.g., 1):');
            }
            
            if (state.type === 'add_season') {
                // Check if season already exists
                const existingSeason = await Season.findOne({ 
                    series: state.series._id, 
                    seasonNumber 
                });
                
                if (existingSeason) {
                    await ctx.reply('❌ A season with this number already exists for this series. Please choose a different number.');
                    return;
                }
                
                // Create new season
                const newSeason = new Season({
                    seasonNumber,
                    title: `Season ${seasonNumber}`,
                    series: state.series._id
                });
                
                await newSeason.save();
                
                // Add season to series
                state.series.seasons.push(newSeason._id);
                await state.series.save();
                
                state.currentSeason = newSeason;
                state.step = 'awaiting_season_title';
                this.userStates.set(userId, state);
                
                await ctx.reply('✅ Season created! Now please provide a title for this season (or type "skip" to use default):');
                
            } else if (state.type === 'add_episode') {
                // Find the selected season
                const season = state.seasons.find(s => s.seasonNumber === seasonNumber);
                if (!season) {
                    await ctx.reply('❌ Season not found. Please choose from the available seasons.');
                    return;
                }
                
                state.currentSeason = season;
                state.step = 'awaiting_episode_number';
                this.userStates.set(userId, state);
                
                await ctx.reply(`✅ Season ${seasonNumber} selected!\n\nPlease send the episode number:`);
            }
            
        } catch (error) {
            console.error('Error processing season number:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processSeasonTitle(ctx, userId, title, state) {
        try {
            if (title.toLowerCase() !== 'skip') {
                state.currentSeason.title = title;
                await state.currentSeason.save();
            }
            
            await ctx.reply('✅ Season title saved! The season has been successfully added to the series.');
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error processing season title:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processEpisodeNumber(ctx, userId, episodeNumberText, state) {
        try {
            const episodeNumber = parseInt(episodeNumberText);
            if (isNaN(episodeNumber) || episodeNumber < 1) {
                return ctx.reply('❌ Invalid episode number. Please enter a valid number (e.g., 1):');
            }
            
            // Check if episode already exists
            const existingEpisode = await Episode.findOne({ 
                season: state.currentSeason._id, 
                episodeNumber 
            });
            
            if (existingEpisode) {
                await ctx.reply('❌ An episode with this number already exists for this season. Please choose a different number.');
                return;
            }
            
            state.tempEpisode = {
                episodeNumber
            };
            
            state.step = 'awaiting_episode_title';
            this.userStates.set(userId, state);
            
            await ctx.reply('Episode number saved! Now please provide a title for this episode:');
            
        } catch (error) {
            console.error('Error processing episode number:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processEpisodeTitle(ctx, userId, title, state) {
        try {
            if (!title.trim()) {
                return ctx.reply('❌ Episode title cannot be empty. Please provide a title:');
            }
            
            state.tempEpisode.title = title.trim();
            state.step = 'awaiting_episode_file';
            this.userStates.set(userId, state);
            
            await ctx.reply('Episode title saved! Now please send the episode file:');
            
        } catch (error) {
            console.error('Error processing episode title:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async searchContent(ctx, userId, searchQuery) {
        try {
            // Search in movies
            const movies = await Content.find({
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { contentId: { $regex: searchQuery, $options: 'i' } }
                ]
            }).limit(10);
            
            // Search in series
            const series = await Series.find({
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { seriesId: { $regex: searchQuery, $options: 'i' } }
                ]
            }).limit(10);
            
            if (movies.length === 0 && series.length === 0) {
                await ctx.reply('❌ No content found matching your search.');
                this.userStates.delete(userId);
                return;
            }
            
            let response = '🔍 Search Results:\n\n';
            
            if (movies.length > 0) {
                response += '🎬 Movies:\n';
                movies.forEach(movie => {
                    const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${movie.contentId}`;
                    response += `• ${movie.title} (${movie.year}) - ID: ${movie.contentId}\nDeep Link: ${deepLink}\n\n`;
                });
            }
            
            if (series.length > 0) {
                response += '📺 Series:\n';
                series.forEach(serie => {
                    const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${serie.seriesId}`;
                    response += `• ${serie.title} (${serie.year}) - ID: ${serie.seriesId}\nDeep Link: ${deepLink}\n\n`;
                });
            }
            
            await ctx.reply(response);
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error searching content:', error);
            await ctx.reply('❌ An error occurred while searching. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processContentId(ctx, userId, contentId, state) {
        try {
            // Check if it's a movie
            const movie = await Content.findOne({ contentId });
            if (movie) {
                state.content = movie;
                state.contentType = 'movie';
                
                if (state.type === 'edit') {
                    state.step = 'awaiting_edit_field';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply(`✏️ Editing movie: ${movie.title}\n\nWhat would you like to edit?`, Markup.inlineKeyboard([
                        [
                            Markup.button.callback('Title', 'edit_field_title'),
                            Markup.button.callback('Year', 'edit_field_year')
                        ],
                        [
                            Markup.button.callback('Description', 'edit_field_description'),
                            Markup.button.callback('Genre', 'edit_field_genre')
                        ]
                    ]));
                } else if (state.type === 'delete') {
                    state.step = 'awaiting_delete_confirmation';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply(`🗑️ Are you sure you want to delete this movie?\n\nTitle: ${movie.title}\nYear: ${movie.year}\nID: ${movie.contentId}`, Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Yes, delete', 'confirm_delete'),
                            Markup.button.callback('❌ Cancel', 'cancel_delete')
                        ]
                    ]));
                }
                return;
            }
            
            // Check if it's a series
            const series = await Series.findOne({ seriesId: contentId });
            if (series) {
                state.content = series;
                state.contentType = 'series';
                
                if (state.type === 'edit') {
                    state.step = 'awaiting_edit_field';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply(`✏️ Editing series: ${series.title}\n\nWhat would you like to edit?`, Markup.inlineKeyboard([
                        [
                            Markup.button.callback('Title', 'edit_field_title'),
                            Markup.button.callback('Year', 'edit_field_year')
                        ],
                        [
                            Markup.button.callback('Description', 'edit_field_description'),
                            Markup.button.callback('Genre', 'edit_field_genre')
                        ]
                    ]));
                } else if (state.type === 'delete') {
                    state.step = 'awaiting_delete_confirmation';
                    this.userStates.set(userId, state);
                    
                    await ctx.reply(`🗑️ Are you sure you want to delete this series?\n\nTitle: ${series.title}\nYear: ${series.year}\nID: ${series.seriesId}\n\nThis will delete all seasons and episodes!`, Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Yes, delete', 'confirm_delete'),
                            Markup.button.callback('❌ Cancel', 'cancel_delete')
                        ]
                    ]));
                }
                return;
            }
            
            await ctx.reply('❌ Content not found. Please check the content ID and try again.');
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error processing content ID:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async handleEditFieldSelection(ctx, field) {
        const userId = ctx.from.id;
        const state = this.userStates.get(userId);
        
        if (!state || state.step !== 'awaiting_edit_field') {
            return ctx.reply('❌ Invalid operation state.');
        }
        
        state.editField = field;
        state.step = 'awaiting_edit_value';
        this.userStates.set(userId, state);
        
        await ctx.reply(`Please enter the new value for ${field}:`);
    }
    
    async processEditField(ctx, userId, fieldName, state) {
        const validFields = ['title', 'year', 'description', 'genre'];
        
        if (!validFields.includes(fieldName.toLowerCase())) {
            await ctx.reply('❌ Invalid field. Please choose from: title, year, description, genre');
            return;
        }
        
        state.editField = fieldName.toLowerCase();
        state.step = 'awaiting_edit_value';
        this.userStates.set(userId, state);
        
        await ctx.reply(`Please enter the new value for ${fieldName}:`);
    }
    
    async processEditValue(ctx, userId, newValue, state) {
        try {
            let updateData = {};
            
            switch (state.editField) {
                case 'title':
                    updateData.title = newValue;
                    break;
                    
                case 'year':
                    const year = parseInt(newValue);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    updateData.year = year;
                    break;
                    
                case 'description':
                    updateData.description = newValue;
                    break;
                    
                case 'genre':
                    const genres = validateGenres(newValue);
                    if (!genres) {
                        return ctx.reply('❌ Invalid genres. Please provide at least one valid genre (comma-separated):');
                    }
                    updateData.genre = genres;
                    break;
            }
            
            if (state.contentType === 'movie') {
                await Content.findOneAndUpdate(
                    { contentId: state.content.contentId },
                    updateData
                );
            } else if (state.contentType === 'series') {
                await Series.findOneAndUpdate(
                    { seriesId: state.content.seriesId },
                    updateData
                );
            }
            
            await ctx.reply(`✅ ${state.editField} updated successfully!`);
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error updating content:', error);
            await ctx.reply('❌ An error occurred while updating. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async handleDeleteConfirmation(ctx, confirm) {
        const userId = ctx.from.id;
        const state = this.userStates.get(userId);
        
        if (!state || state.step !== 'awaiting_delete_confirmation') {
            return ctx.reply('❌ Invalid operation state.');
        }
        
        if (!confirm) {
            await ctx.reply('✅ Deletion cancelled.');
            this.userStates.delete(userId);
            return;
        }
        
        try {
            if (state.contentType === 'movie') {
                await Content.findOneAndDelete({ contentId: state.content.contentId });
                await ctx.reply('✅ Movie deleted successfully!');
            } else if (state.contentType === 'series') {
                // Delete series and all related seasons and episodes
                const series = await Series.findOne({ seriesId: state.content.seriesId });
                if (series) {
                    // Delete all seasons
                    for (const seasonId of series.seasons) {
                        const season = await Season.findById(seasonId);
                        if (season) {
                            // Delete all episodes
                            await Episode.deleteMany({ season: seasonId });
                            await Season.findByIdAndDelete(seasonId);
                        }
                    }
                    await Series.findByIdAndDelete(series._id);
                }
                await ctx.reply('✅ Series and all related content deleted successfully!');
            }
            
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error deleting content:', error);
            await ctx.reply('❌ An error occurred while deleting. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async processDeleteConfirmation(ctx, userId, confirmation, state) {
        if (confirmation.toLowerCase() !== 'yes') {
            await ctx.reply('✅ Deletion cancelled.');
            this.userStates.delete(userId);
            return;
        }
        
        try {
            if (state.contentType === 'movie') {
                await Content.findOneAndDelete({ contentId: state.content.contentId });
                await ctx.reply('✅ Movie deleted successfully!');
            } else if (state.contentType === 'series') {
                // Delete series and all related seasons and episodes
                const series = await Series.findOne({ seriesId: state.content.seriesId });
                if (series) {
                    // Delete all seasons
                    for (const seasonId of series.seasons) {
                        const season = await Season.findById(seasonId);
                        if (season) {
                            // Delete all episodes
                            await Episode.deleteMany({ season: seasonId });
                            await Season.findByIdAndDelete(seasonId);
                        }
                    }
                    await Series.findByIdAndDelete(series._id);
                }
                await ctx.reply('✅ Series and all related content deleted successfully!');
            }
            
            this.userStates.delete(userId);
            
        } catch (error) {
            console.error('Error deleting content:', error);
            await ctx.reply('❌ An error occurred while deleting. Please try again.');
            this.userStates.delete(userId);
        }
    }
    
    async showAllContent(ctx) {
        try {
            // Get all movies
            const movies = await Content.find().sort({ createdAt: -1 }).limit(10);
            
            // Get all series
            const series = await Series.find().sort({ createdAt: -1 }).limit(10);
            
            if (movies.length === 0 && series.length === 0) {
                await ctx.reply('❌ No content available yet.');
                return;
            }
            
            let response = '📋 Recent Content:\n\n';
            
            if (movies.length > 0) {
                response += '🎬 Movies:\n';
                movies.forEach(movie => {
                    const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${movie.contentId}`;
                    response += `• ${movie.title} (${movie.year}) - ID: ${movie.contentId}\nDeep Link: ${deepLink}\n\n`;
                });
            }
            
            if (series.length > 0) {
                response += '📺 Series:\n';
                series.forEach(serie => {
                    const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${serie.seriesId}`;
                    response += `• ${serie.title} (${serie.year}) - ID: ${serie.seriesId}\nDeep Link: ${deepLink}\n\n`;
                });
            }
            
            response += '\nℹ️ Showing latest 10 items of each type. Use /findcontent to search for specific content.';
            
            await ctx.reply(response);
            
        } catch (error) {
            console.error('Error showing all content:', error);
            await ctx.reply('❌ An error occurred while fetching content. Please try again.');
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
        
        return caption;
    }
    
    generateSimpleEpisodeCaption(episode) {
        return `<b>Episode ${episode.episodeNumber}:</b> ${episode.title}`;
    }
}

module.exports = UploadBot;