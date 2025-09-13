const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const User = require('../models/User');
const { generateContentId, generateSeriesId, generateEpisodeId } = require('../utils/idGenerator');
const TELEGRAM_CONFIG = require('../config/telegram');

class UploadBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.UPLOAD_BOT_TOKEN;
        this.botUsername = TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME;
        this.pendingOperations = new Map();
        this.seriesCreationState = new Map();
        this.editState = new Map();
        
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
                await ctx.reply(`Welcome ${ctx.from.first_name}! You can manage content using:
/uploadmovie - Upload a movie
/uploadseries - Create a series with episodes
/editcontent - Edit existing content
/deletecontent - Delete content
/viewcontent - View all content
/findcontent - Find specific content
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
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId) || this.editState.has(userId)) {
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
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId) || this.editState.has(userId)) {
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
        
        // Edit content command
        this.bot.command('editcontent', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to edit content.');
            }
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId) || this.editState.has(userId)) {
                return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
            }
            
            this.editState.set(userId, {
                step: 'awaiting_content_id',
                type: '',
                data: {}
            });
            
            await ctx.reply('📝 Let\'s edit content!\n\nPlease send me the content ID you want to edit:');
        });
        
        // Delete content command
        this.bot.command('deletecontent', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to delete content.');
            }
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId) || this.editState.has(userId)) {
                return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
            }
            
            this.editState.set(userId, {
                step: 'awaiting_delete_id',
                type: '',
                data: {}
            });
            
            await ctx.reply('🗑️ Let\'s delete content!\n\nPlease send me the content ID you want to delete:');
        });
        
        // View all content command
        this.bot.command('viewcontent', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to view content.');
            }
            
            try {
                // Get all movies
                const movies = await Content.find({}).sort({ createdAt: -1 }).limit(10);
                // Get all series
                const series = await Series.find({}).sort({ createdAt: -1 }).limit(10);
                
                let response = '📋 Recent Content:\n\n';
                
                if (movies.length > 0) {
                    response += '🎬 Movies:\n';
                    movies.forEach(movie => {
                        const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${movie.contentId}`;
                        response += `- ${movie.title} (${movie.year}) - ID: ${movie.contentId}\n  🔗 ${deepLink}\n\n`;
                    });
                }
                
                if (series.length > 0) {
                    response += '📺 Series:\n';
                    series.forEach(s => {
                        const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${s.seriesId}`;
                        response += `- ${s.title} (${s.year}) - ${s.type} - ID: ${s.seriesId}\n  🔗 ${deepLink}\n\n`;
                    });
                }
                
                if (movies.length === 0 && series.length === 0) {
                    response = 'No content found.';
                }
                
                await ctx.reply(response);
            } catch (error) {
                console.error('Error viewing content:', error);
                await ctx.reply('❌ Error fetching content. Please try again.');
            }
        });
        
        // Find content command
        this.bot.command('findcontent', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ You do not have permission to find content.');
            }
            
            if (this.pendingOperations.has(userId) || this.seriesCreationState.has(userId) || this.editState.has(userId)) {
                return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
            }
            
            this.editState.set(userId, {
                step: 'awaiting_search_query',
                type: '',
                data: {}
            });
            
            await ctx.reply('🔍 Let\'s find content!\n\nPlease send me the title or part of the title to search for:');
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
            } else if (this.editState.has(userId)) {
                this.editState.delete(userId);
                await ctx.reply('✅ Edit operation cancelled successfully.');
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
                return;
            }
            
            // Handle edit and delete operations
            if (this.editState.has(userId)) {
                await this.handleEditOperations(ctx, userId, messageText);
                return;
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
        
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error in upload bot:`, err);
            ctx.reply('❌ An error occurred. Please try again.');
        });
    }
    
    async handleEditOperations(ctx, userId, messageText) {
        const state = this.editState.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_content_id':
                    // Check if it's a movie or series
                    const movie = await Content.findOne({ contentId: messageText });
                    const series = await Series.findOne({ seriesId: messageText });
                    
                    if (!movie && !series) {
                        return ctx.reply('❌ Content not found. Please enter a valid content ID:');
                    }
                    
                    if (movie) {
                        state.type = 'movie';
                        state.data = movie;
                        state.step = 'awaiting_edit_field';
                        this.editState.set(userId, state);
                        
                        await ctx.reply(`🎬 Editing movie: ${movie.title}\n\nWhat would you like to edit?\n\n- title\n- year\n- description\n- genre\n- channel\n\nPlease type your choice:`);
                    } else if (series) {
                        state.type = 'series';
                        state.data = series;
                        state.step = 'awaiting_edit_field';
                        this.editState.set(userId, state);
                        
                        await ctx.reply(`📺 Editing series: ${series.title}\n\nWhat would you like to edit?\n\n- title\n- year\n- description\n- genre\n- channel\n\nPlease type your choice:`);
                    }
                    break;
                    
                case 'awaiting_delete_id':
                    // Check if it's a movie or series
                    const movieToDelete = await Content.findOne({ contentId: messageText });
                    const seriesToDelete = await Series.findOne({ seriesId: messageText });
                    
                    if (!movieToDelete && !seriesToDelete) {
                        return ctx.reply('❌ Content not found. Please enter a valid content ID:');
                    }
                    
                    if (movieToDelete) {
                        await Content.deleteOne({ contentId: messageText });
                        await ctx.reply(`✅ Movie "${movieToDelete.title}" deleted successfully.`);
                    } else if (seriesToDelete) {
                        // Delete all seasons and episodes first
                        const seasons = await Season.find({ series: seriesToDelete._id });
                        for (const season of seasons) {
                            await Episode.deleteMany({ season: season._id });
                            await Season.deleteOne({ _id: season._id });
                        }
                        await Series.deleteOne({ seriesId: messageText });
                        await ctx.reply(`✅ Series "${seriesToDelete.title}" and all associated content deleted successfully.`);
                    }
                    
                    this.editState.delete(userId);
                    break;
                    
                case 'awaiting_search_query':
                    // Search for content
                    const searchQuery = messageText;
                    const movies = await Content.find({
                        title: { $regex: searchQuery, $options: 'i' }
                    }).limit(10);
                    
                    const seriesList = await Series.find({
                        title: { $regex: searchQuery, $options: 'i' }
                    }).limit(10);
                    
                    let response = `🔍 Search results for "${searchQuery}":\n\n`;
                    
                    if (movies.length > 0) {
                        response += '🎬 Movies:\n';
                        movies.forEach(movie => {
                            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${movie.contentId}`;
                            response += `- ${movie.title} (${movie.year}) - ID: ${movie.contentId}\n  🔗 ${deepLink}\n\n`;
                        });
                    }
                    
                    if (seriesList.length > 0) {
                        response += '📺 Series:\n';
                        seriesList.forEach(s => {
                            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${s.seriesId}`;
                            response += `- ${s.title} (${s.year}) - ${s.type} - ID: ${s.seriesId}\n  🔗 ${deepLink}\n\n`;
                        });
                    }
                    
                    if (movies.length === 0 && seriesList.length === 0) {
                        response = `No content found for "${searchQuery}".`;
                    }
                    
                    await ctx.reply(response);
                    this.editState.delete(userId);
                    break;
                    
                case 'awaiting_edit_field':
                    state.field = messageText.toLowerCase();
                    if (!['title', 'year', 'description', 'genre', 'channel'].includes(state.field)) {
                        return ctx.reply('❌ Invalid field. Please choose from: title, year, description, genre, channel');
                    }
                    
                    state.step = 'awaiting_edit_value';
                    this.editState.set(userId, state);
                    
                    await ctx.reply(`Please enter the new value for ${state.field}:`);
                    break;
                    
                case 'awaiting_edit_value':
                    const newValue = messageText;
                    
                    if (state.type === 'movie') {
                        const updateData = {};
                        
                        if (state.field === 'title') {
                            updateData.title = newValue;
                            // Regenerate content ID if title changed
                            updateData.contentId = generateContentId('movie', newValue, state.data.year);
                        } else if (state.field === 'year') {
                            const year = parseInt(newValue);
                            if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                                return ctx.reply('❌ Invalid year. Please enter a valid year:');
                            }
                            updateData.year = year;
                            // Regenerate content ID if year changed
                            updateData.contentId = generateContentId('movie', state.data.title, year);
                        } else if (state.field === 'description') {
                            updateData.description = newValue;
                        } else if (state.field === 'genre') {
                            updateData.genre = newValue.split(',').map(g => g.trim());
                        } else if (state.field === 'channel') {
                            const channelId = TELEGRAM_CONFIG.CHANNELS[newValue.toUpperCase()];
                            if (!channelId) {
                                return ctx.reply('❌ Invalid channel. Please choose: MOVIES, WEBSERIES, or ANIME');
                            }
                            updateData.telegramChannel = channelId;
                        }
                        
                        await Content.findByIdAndUpdate(state.data._id, updateData);
                        await ctx.reply(`✅ Movie updated successfully!`);
                        
                    } else if (state.type === 'series') {
                        const updateData = {};
                        
                        if (state.field === 'title') {
                            updateData.title = newValue;
                            // Regenerate series ID if title changed
                            updateData.seriesId = generateSeriesId(state.data.type, newValue, state.data.year);
                        } else if (state.field === 'year') {
                            const year = parseInt(newValue);
                            if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                                return ctx.reply('❌ Invalid year. Please enter a valid year:');
                            }
                            updateData.year = year;
                            // Regenerate series ID if year changed
                            updateData.seriesId = generateSeriesId(state.data.type, state.data.title, year);
                        } else if (state.field === 'description') {
                            updateData.description = newValue;
                        } else if (state.field === 'genre') {
                            updateData.genre = newValue.split(',').map(g => g.trim());
                        } else if (state.field === 'channel') {
                            const channelId = TELEGRAM_CONFIG.CHANNELS[newValue.toUpperCase()];
                            if (!channelId) {
                                return ctx.reply('❌ Invalid channel. Please choose: MOVIES, WEBSERIES, or ANIME');
                            }
                            updateData.telegramChannel = channelId;
                        }
                        
                        await Series.findByIdAndUpdate(state.data._id, updateData);
                        await ctx.reply(`✅ Series updated successfully!`);
                    }
                    
                    this.editState.delete(userId);
                    break;
                    
                default:
                    this.editState.delete(userId);
                    await ctx.reply('❌ Operation cancelled due to unexpected error.');
            }
        } catch (error) {
            console.error('Error in edit operation:', error);
            this.editState.delete(userId);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
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
                    const channelName = messageText.toUpperCase();
                    const channelId = TELEGRAM_CONFIG.CHANNELS[channelName];
                    
                    if (!channelId) {
                        return ctx.reply('❌ Invalid channel. Please choose: MOVIES');
                    }
                    
                    state.data.channel = channelId;
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
            const fileName = file.file_name || 'movie_file';
            const fileSize = file.file_size;
            
            // Check file size limit (2GB Telegram limit)
            if (fileSize > 2000 * 1024 * 1024) {
                return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
            }
            
            // Upload file to channel with clean metadata (no upload credit)
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
                uploadStatus: 'completed'
            });
            
            await newContent.save();
            
            // Update user's upload count
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            // Generate deep link
            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${contentId}`;
            
            await ctx.reply(`✅ Movie uploaded successfully!\n\nTitle: ${state.data.title}\nYear: ${state.data.year}\nChannel: ${state.data.channel}\n\nDeep Link: ${deepLink}`);
            
            // Clean up
            this.pendingOperations.delete(userId);
            
        } catch (error) {
            console.error('Error uploading movie:', error);
            this.pendingOperations.delete(userId);
            
            let errorMessage = '❌ Failed to upload movie. Please try again with /uploadmovie.';
            if (error.response && error.response.description) {
                errorMessage += `\n\nError: ${error.response.description}`;
            }
            
            await ctx.reply(errorMessage);
        }
    }
    
    async handleSeriesCreation(ctx, userId, messageText) {
        const state = this.seriesCreationState.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_series_type':
                    if (!['webseries', 'anime'].includes(messageText.toLowerCase())) {
                        return ctx.reply('❌ Invalid series type. Please choose: webseries or anime');
                    }
                    
                    state.data.type = messageText.toLowerCase();
                    state.step = 'awaiting_series_title';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Great! Now please send me the title of the series:');
                    break;
                    
                case 'awaiting_series_title':
                    state.data.title = messageText;
                    state.step = 'awaiting_series_year';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Perfect! Now what year was this series released?');
                    break;
                    
                case 'awaiting_series_year':
                    const year = parseInt(messageText);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    
                    state.data.year = year;
                    state.step = 'awaiting_series_description';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Good! Now please provide a short description (or type "skip" to skip this):');
                    break;
                    
                case 'awaiting_series_description':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.description = messageText;
                    }
                    state.step = 'awaiting_series_genre';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Almost done! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama or type "skip" to skip):');
                    break;
                    
                case 'awaiting_series_genre':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.genre = messageText.split(',').map(g => g.trim());
                    }
                    state.step = 'awaiting_series_channel';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Now which channel should I upload this series to? Please choose:\n\n• WEBSERIES\n• ANIME');
                    break;
                    
                case 'awaiting_series_channel':
                    const channelName = messageText.toUpperCase();
                    const channelId = TELEGRAM_CONFIG.CHANNELS[channelName];
                    
                    if (!channelId) {
                        return ctx.reply('❌ Invalid channel. Please choose from: WEBSERIES or ANIME');
                    }
                    
                    state.data.channel = channelId;
                    
                    // Create the series record
                    const seriesId = generateSeriesId(state.data.type, state.data.title, state.data.year);
                    const user = await User.findOne({ telegramId: userId });
                    
                    const newSeries = new Series({
                        seriesId,
                        title: state.data.title,
                        type: state.data.type,
                        description: state.data.description || '',
                        year: state.data.year,
                        genre: state.data.genre || [],
                        telegramChannel: state.data.channel,
                        uploadedBy: user._id
                    });
                    
                    await newSeries.save();
                    
                    // Update state with series ID
                    state.data.seriesId = seriesId;
                    state.step = 'awaiting_season_number';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('✅ Series created successfully! Now let\'s add seasons.\n\nPlease send the season number (e.g., 1 for Season 1):');
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
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Season created! Now please provide a title for this season (or type "skip" to use default):');
                    break;
                    
                case 'awaiting_season_title':
                    if (messageText.toLowerCase() !== 'skip') {
                        const season = await Season.findById(state.data.currentSeason);
                        season.title = messageText;
                        await season.save();
                    }
                    
                    state.step = 'awaiting_episode_file';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Season title saved! Now please send the first episode file for this season.\n\nAfter sending the file, I\'ll ask for the episode details.');
                    break;
                    
                case 'awaiting_episode_number':
                    const episodeNumber = parseInt(messageText);
                    if (isNaN(episodeNumber) || episodeNumber < 1) {
                        return ctx.reply('❌ Invalid episode number. Please enter a valid number (e.g., 1):');
                    }
                    
                    state.data.tempEpisode.episodeNumber = episodeNumber;
                    state.step = 'awaiting_episode_title';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('Episode number saved! Now please provide a title for this episode:');
                    break;
                    
                case 'awaiting_episode_title':
                    if (!messageText.trim()) {
                        return ctx.reply('❌ Episode title cannot be empty. Please provide a title:');
                    }
                    
                    state.data.tempEpisode.title = messageText.trim();
                    
                    // Now upload the file and create episode
                    await this.uploadEpisodeFile(ctx, userId);
                    break;
                    
                case 'awaiting_next_action':
                    const action = messageText.toLowerCase();
                    
                    if (action === 'next episode') {
                        state.step = 'awaiting_episode_file';
                        this.seriesCreationState.set(userId, state);
                        
                        await ctx.reply('Great! Please send the next episode file:');
                    } else if (action === 'new season') {
                        state.step = 'awaiting_season_number';
                        this.seriesCreationState.set(userId, state);
                        
                        await ctx.reply('Let\'s create a new season! Please send the season number:');
                    } else if (action === 'finish') {
                        // Finish series creation
                        const series = await Series.findOne({ seriesId: state.data.seriesId }).populate('seasons');
                        const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${state.data.seriesId}`;
                        
                        await ctx.reply(`✅ Series completed successfully!\n\nTitle: ${series.title}\nSeasons: ${series.seasons.length}\n\nDeep Link: ${deepLink}\n\nUsers can now access this series using the deep link.`);
                        
                        // Clean up
                        this.seriesCreationState.delete(userId);
                    } else {
                        await ctx.reply('❌ Invalid action. Please choose: "next episode", "new season", or "finish"');
                    }
                    break;
                    
                default:
                    this.seriesCreationState.delete(userId);
                    await ctx.reply('❌ Operation cancelled due to unexpected error.');
            }
        } catch (error) {
            console.error('Error in series creation:', error);
            this.seriesCreationState.delete(userId);
            await ctx.reply('❌ An error occurred. Please start over with /uploadseries.');
        }
    }
    
    async handleSeriesFileUpload(ctx, userId) {
        const state = this.seriesCreationState.get(userId);
        
        if (state.step === 'awaiting_episode_file') {
            // File upload for an episode
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
            this.seriesCreationState.set(userId, state);
            
            await ctx.reply('File received! Now please send the episode number (e.g., 1 for Episode 1):');
        }
    }
    
    async uploadEpisodeFile(ctx, userId) {
        const state = this.seriesCreationState.get(userId);
        
        try {
            // Get series and season details
            const series = await Series.findOne({ seriesId: state.data.seriesId });
            const season = await Season.findById(state.data.currentSeason);
            
            // Upload file to channel with SIMPLIFIED caption (only episode info)
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
                contentId: episodeContentId
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
            this.seriesCreationState.set(userId, state);
            
            await ctx.reply(`✅ Episode uploaded successfully!\n\nWhat would you like to do next?\n\n- Type "next episode" to add another episode to this season\n- Type "new season" to create a new season\n- Type "finish" to complete the series`);
            
        } catch (error) {
            console.error('Error uploading episode file:', error);
            await ctx.reply('❌ Failed to upload episode. Please try again with /uploadseries.');
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
        
        // REMOVED: Uploaded via @ArcXzoneuploads_bot
        return caption;
    }
    
    generateSimpleEpisodeCaption(episode) {
        // SIMPLIFIED: Only show episode number and title
        return `<b>Episode ${episode.episodeNumber}:</b> ${episode.title}`;
    }
}

module.exports = UploadBot;