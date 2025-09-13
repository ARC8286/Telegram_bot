const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const User = require('../models/User');
const { generateContentId, generateSeriesId, generateEpisodeId } = require('../utils/idGenerator');
const TELEGRAM_CONFIG = require('../config/telegram');

class AdvancedUploadBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.UPLOAD_BOT_TOKEN;
        this.botUsername = TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME;
        this.pendingOperations = new Map();
        this.seriesCreationState = new Map();
        this.editingState = new Map();
        this.seriesEditState = new Map();
        this.viewState = new Map();
        
        console.log('AdvancedUploadBot token check:', !!this.botToken);
        
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
            console.log('✅ Advanced Upload Telegram bot started successfully');
        }).catch(err => {
            console.error('❌ Error starting Advanced Upload Telegram bot:', err);
        });
    }
    
    setupHandlers() {
        // Start command with modern interface
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
                const welcomeMessage = `
🎬 <b>Advanced Content Manager</b>

Welcome ${ctx.from.first_name}! 

<b>📤 UPLOAD COMMANDS:</b>
/uploadmovie - Upload a movie
/uploadseries - Create a series with episodes
/addseason - Add a season to existing series
/addepisode - Add an episode to existing season

<b>📋 VIEW COMMANDS:</b>
/viewcontent - View all content (structured)
/viewmovies - View all movies
/viewseries - View all series
/findcontent - Search specific content

<b>✏️ EDIT COMMANDS:</b>
/editcontent - Edit movies/series
/editepisode - Edit specific episodes
/editseason - Edit season details
/deletecontent - Delete content

<b>🔧 UTILITY:</b>
/stats - Show upload statistics
/help - Show this help menu
/cancel - Cancel current operation

<i>Powered by Advanced Upload Bot v2.0</i>
                `;
                
                await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
            } else {
                await ctx.reply(`🔒 <b>Access Restricted</b>\n\nHello ${ctx.from.first_name}! You don't have upload permissions yet.\nPlease contact an administrator.`, { parse_mode: 'HTML' });
            }
        });

        // Help command
        this.bot.command('help', async (ctx) => {
            await ctx.replyWithHTML(`
🆘 <b>Advanced Upload Bot Help</b>

<b>Content Management:</b>
• Use /uploadmovie for single movie uploads
• Use /uploadseries for series with multiple episodes
• Use /viewcontent for structured content listing
• Use /findcontent to search by title or ID

<b>Editing Features:</b>
• /editcontent - Edit movie/series metadata
• /editepisode - Edit specific episode details
• /editseason - Modify season information

<b>Tips:</b>
• All operations can be cancelled with /cancel
• Use proper file formats (MP4, MKV, AVI)
• File size limit: 2GB per file
• Genres should be comma-separated

<b>Support:</b> Contact @admin for permissions
            `);
        });

        // Stats command
        this.bot.command('stats', async (ctx) => {
            const userId = ctx.from.id;
            const user = await User.findOne({ telegramId: userId });
            
            if (!user || (!user.canUpload && !user.isAdmin)) {
                return ctx.reply('❌ Access denied.');
            }

            await this.showStats(ctx);
        });

        // View commands
        this.bot.command('viewcontent', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.showStructuredContent(ctx));
        });

        this.bot.command('viewmovies', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.showMoviesOnly(ctx));
        });

        this.bot.command('viewseries', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.showSeriesOnly(ctx));
        });

        // Upload commands
        this.bot.command('uploadmovie', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startMovieUpload(ctx));
        });

        this.bot.command('uploadseries', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startSeriesUpload(ctx));
        });

        this.bot.command('addseason', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startAddSeason(ctx));
        });

        this.bot.command('addepisode', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startAddEpisode(ctx));
        });

        // Edit commands
        this.bot.command('editcontent', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startEditContent(ctx));
        });

        this.bot.command('editepisode', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startEditEpisode(ctx));
        });

        this.bot.command('editseason', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startEditSeason(ctx));
        });

        this.bot.command('deletecontent', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startDeleteContent(ctx));
        });

        this.bot.command('findcontent', async (ctx) => {
            await this.checkPermissionAndExecute(ctx, () => this.startFindContent(ctx));
        });

        // Cancel command
        this.bot.command('cancel', async (ctx) => {
            const userId = ctx.from.id;
            let cancelled = false;

            if (this.pendingOperations.has(userId)) {
                this.pendingOperations.delete(userId);
                cancelled = true;
            }
            if (this.seriesCreationState.has(userId)) {
                this.seriesCreationState.delete(userId);
                cancelled = true;
            }
            if (this.editingState.has(userId)) {
                this.editingState.delete(userId);
                cancelled = true;
            }
            if (this.seriesEditState.has(userId)) {
                this.seriesEditState.delete(userId);
                cancelled = true;
            }
            if (this.viewState.has(userId)) {
                this.viewState.delete(userId);
                cancelled = true;
            }

            if (cancelled) {
                await ctx.reply('✅ Operation cancelled successfully.');
            } else {
                await ctx.reply('❌ No pending operation to cancel.');
            }
        });

        // Callback query handler for inline keyboards
        this.bot.on('callback_query', async (ctx) => {
            await this.handleCallbackQuery(ctx);
        });

        // Text message handler
        this.bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            const messageText = ctx.message.text;
            
            if (this.seriesEditState.has(userId)) {
                await this.handleSeriesEditOperations(ctx, userId, messageText);
            } else if (this.editingState.has(userId)) {
                await this.handleEditingOperations(ctx, userId, messageText);
            } else if (this.seriesCreationState.has(userId)) {
                await this.handleSeriesCreation(ctx, userId, messageText);
            } else if (this.pendingOperations.has(userId)) {
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
            } else if (this.seriesEditState.has(userId)) {
                await this.handleSeriesEditFileUpload(ctx, userId);
            }
        });

        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error in advanced upload bot:`, err);
            ctx.reply('❌ An unexpected error occurred. Please try again or contact support.');
        });
    }

    // Permission check utility
    async checkPermissionAndExecute(ctx, callback) {
        const userId = ctx.from.id;
        const user = await User.findOne({ telegramId: userId });
        
        if (!user || (!user.canUpload && !user.isAdmin)) {
            return ctx.reply('❌ You do not have permission to use this feature.');
        }
        
        if (this.hasActiveOperation(userId)) {
            return ctx.reply('❌ You already have an operation in progress. Use /cancel first.');
        }
        
        await callback();
    }

    hasActiveOperation(userId) {
        return this.pendingOperations.has(userId) || 
               this.seriesCreationState.has(userId) || 
               this.editingState.has(userId) || 
               this.seriesEditState.has(userId) ||
               this.viewState.has(userId);
    }

    // Enhanced content viewing with structure
    async showStructuredContent(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Get counts
            const movieCount = await Content.countDocuments({ type: 'movie' });
            const seriesCount = await Series.countDocuments();
            const totalSeasons = await Season.countDocuments();
            const totalEpisodes = await Episode.countDocuments();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `🎬 Movies (${movieCount})`, callback_data: 'view_movies_page_1' },
                        { text: `📺 Series (${seriesCount})`, callback_data: 'view_series_page_1' }
                    ],
                    [
                        { text: '🔍 Search Content', callback_data: 'search_content' },
                        { text: '📊 Statistics', callback_data: 'show_stats' }
                    ],
                    [
                        { text: '🔄 Refresh', callback_data: 'refresh_content' }
                    ]
                ]
            };

            const message = `
📋 <b>Content Management Dashboard</b>

<b>📈 Overview:</b>
🎬 Movies: <code>${movieCount}</code>
📺 Series: <code>${seriesCount}</code>
🏷️ Total Seasons: <code>${totalSeasons}</code>
🎞️ Total Episodes: <code>${totalEpisodes}</code>

<b>Quick Actions:</b>
Use the buttons below to navigate content or search for specific items.

<i>Last updated: ${new Date().toLocaleString()}</i>
            `;

            await ctx.replyWithHTML(message, { reply_markup: keyboard });

        } catch (error) {
            console.error('Error showing structured content:', error);
            await ctx.reply('❌ Error loading content dashboard.');
        }
    }

    async showMoviesOnly(ctx, page = 1) {
        try {
            const limit = 10;
            const skip = (page - 1) * limit;
            
            const movies = await Content.find({ type: 'movie' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('uploadedBy', 'firstName username');

            const totalMovies = await Content.countDocuments({ type: 'movie' });
            const totalPages = Math.ceil(totalMovies / limit);

            if (movies.length === 0) {
                return ctx.replyWithHTML('📽️ <b>No movies found</b>\n\nUse /uploadmovie to add the first movie!');
            }

            let message = `🎬 <b>Movies Library</b> (Page ${page}/${totalPages})\n\n`;

            movies.forEach((movie, index) => {
                const number = skip + index + 1;
                const uploader = movie.uploadedBy ? 
                    `@${movie.uploadedBy.username || movie.uploadedBy.firstName}` : 
                    'Unknown';
                
                message += `<b>${number}. ${movie.title}</b> (${movie.year})\n`;
                message += `📂 ID: <code>${movie.contentId}</code>\n`;
                message += `🎭 Genre: ${movie.genre ? movie.genre.join(', ') : 'N/A'}\n`;
                message += `👤 By: ${uploader}\n`;
                message += `🔗 <a href="https://t.me/${this.botUsername}?start=${movie.contentId}">Deep Link</a>\n\n`;
            });

            // Pagination keyboard
            const keyboard = this.createPaginationKeyboard('movies', page, totalPages);
            
            await ctx.replyWithHTML(message, { 
                reply_markup: keyboard,
                disable_web_page_preview: true 
            });

        } catch (error) {
            console.error('Error showing movies:', error);
            await ctx.reply('❌ Error loading movies.');
        }
    }

    async showSeriesOnly(ctx, page = 1) {
        try {
            const limit = 10;
            const skip = (page - 1) * limit;
            
            const series = await Series.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('uploadedBy', 'firstName username')
                .populate('seasons');

            const totalSeries = await Series.countDocuments();
            const totalPages = Math.ceil(totalSeries / limit);

            if (series.length === 0) {
                return ctx.replyWithHTML('📺 <b>No series found</b>\n\nUse /uploadseries to add the first series!');
            }

            let message = `📺 <b>Series Library</b> (Page ${page}/${totalPages})\n\n`;

            for (let i = 0; i < series.length; i++) {
                const serie = series[i];
                const number = skip + i + 1;
                const uploader = serie.uploadedBy ? 
                    `@${serie.uploadedBy.username || serie.uploadedBy.firstName}` : 
                    'Unknown';

                // Count episodes for this series
                const episodeCount = await Episode.countDocuments({
                    season: { $in: serie.seasons.map(s => s._id) }
                });

                message += `<b>${number}. ${serie.title}</b> (${serie.year})\n`;
                message += `📂 ID: <code>${serie.seriesId}</code>\n`;
                message += `🎭 Genre: ${serie.genre ? serie.genre.join(', ') : 'N/A'}\n`;
                message += `🏷️ Seasons: ${serie.seasons.length} | Episodes: ${episodeCount}\n`;
                message += `👤 By: ${uploader}\n`;
                message += `🔗 <a href="https://t.me/${this.botUsername}?start=${serie.seriesId}">Deep Link</a>\n\n`;
            }

            // Pagination keyboard
            const keyboard = this.createPaginationKeyboard('series', page, totalPages);
            
            await ctx.replyWithHTML(message, { 
                reply_markup: keyboard,
                disable_web_page_preview: true 
            });

        } catch (error) {
            console.error('Error showing series:', error);
            await ctx.reply('❌ Error loading series.');
        }
    }

    createPaginationKeyboard(type, currentPage, totalPages) {
        const buttons = [];
        
        // Previous/Next buttons
        const navButtons = [];
        if (currentPage > 1) {
            navButtons.push({ text: '◀️ Previous', callback_data: `view_${type}_page_${currentPage - 1}` });
        }
        if (currentPage < totalPages) {
            navButtons.push({ text: 'Next ▶️', callback_data: `view_${type}_page_${currentPage + 1}` });
        }
        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }

        // Page indicator and controls
        const controlButtons = [];
        if (totalPages > 1) {
            controlButtons.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: 'page_info' });
        }
        controlButtons.push({ text: '🔄 Refresh', callback_data: `view_${type}_page_${currentPage}` });
        controlButtons.push({ text: '🏠 Dashboard', callback_data: 'view_dashboard' });
        buttons.push(controlButtons);

        return { inline_keyboard: buttons };
    }

    // Enhanced editing features
    async startEditEpisode(ctx) {
        const userId = ctx.from.id;
        
        this.editingState.set(userId, {
            type: 'edit_episode',
            step: 'awaiting_series_id'
        });
        
        await ctx.reply('📝 <b>Edit Episode</b>\n\nPlease send the series ID containing the episode you want to edit:', { parse_mode: 'HTML' });
    }

    async startEditSeason(ctx) {
        const userId = ctx.from.id;
        
        this.editingState.set(userId, {
            type: 'edit_season',
            step: 'awaiting_series_id'
        });
        
        await ctx.reply('📝 <b>Edit Season</b>\n\nPlease send the series ID containing the season you want to edit:', { parse_mode: 'HTML' });
    }

    // Callback query handler
    async handleCallbackQuery(ctx) {
        const data = ctx.callbackQuery.data;
        
        try {
            if (data.startsWith('view_movies_page_')) {
                const page = parseInt(data.replace('view_movies_page_', ''));
                await this.showMoviesOnly(ctx, page);
                await ctx.answerCbQuery();
            } else if (data.startsWith('view_series_page_')) {
                const page = parseInt(data.replace('view_series_page_', ''));
                await this.showSeriesOnly(ctx, page);
                await ctx.answerCbQuery();
            } else if (data === 'view_dashboard') {
                await this.showStructuredContent(ctx);
                await ctx.answerCbQuery();
            } else if (data === 'show_stats') {
                await this.showStats(ctx);
                await ctx.answerCbQuery();
            } else if (data === 'search_content') {
                await this.startFindContent(ctx);
                await ctx.answerCbQuery('🔍 Starting search...');
            } else if (data === 'refresh_content') {
                await this.showStructuredContent(ctx);
                await ctx.answerCbQuery('🔄 Content refreshed!');
            } else {
                await ctx.answerCbQuery('Feature coming soon!');
            }
        } catch (error) {
            console.error('Callback query error:', error);
            await ctx.answerCbQuery('❌ Error processing request');
        }
    }

    async showStats(ctx) {
        try {
            const movieCount = await Content.countDocuments({ type: 'movie' });
            const seriesCount = await Series.countDocuments();
            const seasonCount = await Season.countDocuments();
            const episodeCount = await Episode.countDocuments();
            
            // Get top uploaders
            const topUploaders = await User.aggregate([
                { $match: { uploadCount: { $gt: 0 } } },
                { $sort: { uploadCount: -1 } },
                { $limit: 5 },
                { $project: { firstName: 1, username: 1, uploadCount: 1 } }
            ]);

            // Get recent activity
            const recentMovies = await Content.find({ type: 'movie' })
                .sort({ createdAt: -1 })
                .limit(3)
                .select('title year');

            const recentSeries = await Series.find()
                .sort({ createdAt: -1 })
                .limit(3)
                .select('title year');

            let message = `
📊 <b>Content Statistics</b>

<b>📈 Overview:</b>
🎬 Total Movies: <code>${movieCount}</code>
📺 Total Series: <code>${seriesCount}</code>
🏷️ Total Seasons: <code>${seasonCount}</code>
🎞️ Total Episodes: <code>${episodeCount}</code>

<b>🏆 Top Uploaders:</b>
`;

            topUploaders.forEach((uploader, index) => {
                const name = uploader.username ? `@${uploader.username}` : uploader.firstName;
                message += `${index + 1}. ${name} - ${uploader.uploadCount} uploads\n`;
            });

            if (recentMovies.length > 0) {
                message += `\n<b>🎬 Recent Movies:</b>\n`;
                recentMovies.forEach(movie => {
                    message += `• ${movie.title} (${movie.year})\n`;
                });
            }

            if (recentSeries.length > 0) {
                message += `\n<b>📺 Recent Series:</b>\n`;
                recentSeries.forEach(serie => {
                    message += `• ${serie.title} (${serie.year})\n`;
                });
            }

            message += `\n<i>Generated: ${new Date().toLocaleString()}</i>`;

            await ctx.replyWithHTML(message);

        } catch (error) {
            console.error('Error showing stats:', error);
            await ctx.reply('❌ Error loading statistics.');
        }
    }

    // Enhanced episode editing
    async handleEpisodeEdit(ctx, userId, messageText) {
        const state = this.editingState.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_series_id':
                    const series = await Series.findOne({ seriesId: messageText }).populate('seasons');
                    if (!series) {
                        return ctx.reply('❌ Series not found. Please check the series ID.');
                    }
                    
                    if (series.seasons.length === 0) {
                        this.editingState.delete(userId);
                        return ctx.reply('❌ This series has no seasons yet.');
                    }

                    state.series = series;
                    state.step = 'awaiting_season_selection';
                    this.editingState.set(userId, state);

                    let seasonList = `✅ Series found: ${series.title}\n\nAvailable seasons:\n`;
                    series.seasons.forEach(season => {
                        seasonList += `• Season ${season.seasonNumber}: ${season.title}\n`;
                    });
                    seasonList += '\nPlease send the season number:';

                    await ctx.reply(seasonList);
                    break;

                case 'awaiting_season_selection':
                    const seasonNumber = parseInt(messageText);
                    const season = state.series.seasons.find(s => s.seasonNumber === seasonNumber);
                    
                    if (!season) {
                        return ctx.reply('❌ Season not found. Please enter a valid season number.');
                    }

                    const episodes = await Episode.find({ season: season._id }).sort({ episodeNumber: 1 });
                    if (episodes.length === 0) {
                        this.editingState.delete(userId);
                        return ctx.reply('❌ This season has no episodes yet.');
                    }

                    state.season = season;
                    state.episodes = episodes;
                    state.step = 'awaiting_episode_selection';
                    this.editingState.set(userId, state);

                    let episodeList = `✅ Season ${seasonNumber} selected!\n\nAvailable episodes:\n`;
                    episodes.forEach(episode => {
                        episodeList += `• Episode ${episode.episodeNumber}: ${episode.title}\n`;
                    });
                    episodeList += '\nPlease send the episode number you want to edit:';

                    await ctx.reply(episodeList);
                    break;

                case 'awaiting_episode_selection':
                    const episodeNumber = parseInt(messageText);
                    const episode = state.episodes.find(e => e.episodeNumber === episodeNumber);
                    
                    if (!episode) {
                        return ctx.reply('❌ Episode not found. Please enter a valid episode number.');
                    }

                    state.episode = episode;
                    state.step = 'awaiting_field_selection';
                    this.editingState.set(userId, state);

                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📝 Title', callback_data: 'edit_episode_title' },
                                { text: '🔢 Number', callback_data: 'edit_episode_number' }
                            ],
                            [
                                { text: '❌ Cancel', callback_data: 'cancel_edit' }
                            ]
                        ]
                    };

                    await ctx.replyWithHTML(
                        `✅ Episode selected!\n\n<b>Current Details:</b>\nEpisode ${episode.episodeNumber}: ${episode.title}\n\nWhat would you like to edit?`,
                        { reply_markup: keyboard }
                    );
                    break;

                // Add more episode editing cases here...
            }
        } catch (error) {
            console.error('Error in episode edit:', error);
            this.editingState.delete(userId);
            await ctx.reply('❌ Error during episode editing. Please try again.');
        }
    }

    // Continue with all other existing methods from the original code...
    // [Include all the remaining methods from your original code: handleMovieUpload, handleSeriesCreation, etc.]
    
    // Movie upload methods (keeping existing functionality)
    async startMovieUpload(ctx) {
        const userId = ctx.from.id;
        
        this.pendingOperations.set(userId, {
            type: 'movie',
            step: 'awaiting_title',
            data: {}
        });
        
        await ctx.reply('🎬 <b>Movie Upload</b>\n\nPlease send me the movie title:', { parse_mode: 'HTML' });
    }

    async startSeriesUpload(ctx) {
        const userId = ctx.from.id;
        
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
        
        await ctx.reply('🎬 <b>Series Creation</b>\n\nFirst, what type of series is this?\n\nPlease reply with: <code>webseries</code> or <code>anime</code>', { parse_mode: 'HTML' });
    }

    async startAddSeason(ctx) {
        const userId = ctx.from.id;
        
        this.seriesEditState.set(userId, {
            type: 'add_season',
            step: 'awaiting_series_id'
        });
        
        await ctx.reply('📺 <b>Add Season</b>\n\nPlease send me the series ID:', { parse_mode: 'HTML' });
    }

    async startAddEpisode(ctx) {
        const userId = ctx.from.id;
        
        this.seriesEditState.set(userId, {
            type: 'add_episode',
            step: 'awaiting_series_id'
        });
        
        await ctx.reply('🎬 <b>Add Episode</b>\n\nPlease send me the series ID:', { parse_mode: 'HTML' });
    }

    async startEditContent(ctx) {
        const userId = ctx.from.id;
        
        this.editingState.set(userId, {
            type: 'edit',
            step: 'awaiting_content_id'
        });
        
        await ctx.reply('✏️ <b>Edit Content</b>\n\nPlease send me the content ID of the item you want to edit:', { parse_mode: 'HTML' });
    }

    async startDeleteContent(ctx) {
        const userId = ctx.from.id;
        
        this.editingState.set(userId, {
            type: 'delete',
            step: 'awaiting_content_id'
        });
        
        await ctx.reply('🗑️ <b>Delete Content</b>\n\nPlease send me the content ID of the item you want to delete:', { parse_mode: 'HTML' });
    }

    async startFindContent(ctx) {
        const userId = ctx.from.id;
        
        this.editingState.set(userId, {
            type: 'find',
            step: 'awaiting_search_query'
        });
        
        await ctx.reply('🔍 <b>Find Content</b>\n\nPlease send me the title or content ID to search for:', { parse_mode: 'HTML' });
    }

    // Keep all existing methods from the original code for backwards compatibility
    // This includes handleMovieUpload, handleSeriesCreation, handleSeriesFileUpload, etc.
    // [The rest of the methods remain the same as in your original code]

    // All existing methods from original code with enhanced error handling
    async handleMovieUpload(ctx, userId, messageText) {
        const state = this.pendingOperations.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_title':
                    if (!messageText.trim()) {
                        return ctx.reply('❌ Title cannot be empty. Please provide a valid title:');
                    }
                    state.data.title = messageText.trim();
                    state.step = 'awaiting_year';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('📅 Great! Now what year was this movie released?');
                    break;
                    
                case 'awaiting_year':
                    const year = parseInt(messageText);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    
                    state.data.year = year;
                    state.step = 'awaiting_genre';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('🎭 Good! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama):');
                    break;
                    
                case 'awaiting_genre':
                    state.data.genre = messageText.split(',').map(g => g.trim()).filter(g => g.length > 0);
                    state.step = 'awaiting_description';
                    this.pendingOperations.set(userId, state);
                    
                    await ctx.reply('📝 Now please provide a description (or type "skip" to skip this):');
                    break;
                    
                case 'awaiting_description':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.description = messageText;
                    }
                    state.step = 'awaiting_channel';
                    this.pendingOperations.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: '🎬 MOVIES', callback_data: 'channel_movies' }]
                        ]
                    };
                    
                    await ctx.reply('📺 Now which channel should I upload this movie to?', { reply_markup: keyboard });
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
                    
                    await ctx.reply('📁 Perfect! Now please send me the movie file:');
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
            
            if (fileSize > 2000 * 1024 * 1024) {
                return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
            }
            
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
            
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${contentId}`;
            
            await ctx.replyWithHTML(`✅ <b>Movie uploaded successfully!</b>\n\n<b>Title:</b> ${state.data.title}\n<b>Year:</b> ${state.data.year}\n<b>Channel:</b> ${state.data.channel}\n\n<b>Deep Link:</b> ${deepLink}`);
            
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
                    
                    await ctx.reply('📺 Great! Now please send me the title of the series:');
                    break;
                    
                case 'awaiting_series_title':
                    if (!messageText.trim()) {
                        return ctx.reply('❌ Title cannot be empty. Please provide a valid title:');
                    }
                    state.data.title = messageText.trim();
                    state.step = 'awaiting_series_year';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('📅 Perfect! Now what year was this series released?');
                    break;
                    
                case 'awaiting_series_year':
                    const year = parseInt(messageText);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    
                    state.data.year = year;
                    state.step = 'awaiting_series_description';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('📝 Good! Now please provide a short description (or type "skip" to skip this):');
                    break;
                    
                case 'awaiting_series_description':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.description = messageText;
                    }
                    state.step = 'awaiting_series_genre';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('🎭 Almost done! Now please provide genres (comma-separated, e.g., Action, Adventure, Drama or type "skip" to skip):');
                    break;
                    
                case 'awaiting_series_genre':
                    if (messageText.toLowerCase() !== 'skip') {
                        state.data.genre = messageText.split(',').map(g => g.trim()).filter(g => g.length > 0);
                    }
                    state.step = 'awaiting_series_channel';
                    this.seriesCreationState.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📺 WEBSERIES', callback_data: 'channel_webseries' },
                                { text: '🎌 ANIME', callback_data: 'channel_anime' }
                            ]
                        ]
                    };
                    
                    await ctx.reply('📺 Now which channel should I upload this series to?', { reply_markup: keyboard });
                    break;
                    
                case 'awaiting_series_channel':
                    const channelName = messageText.toUpperCase();
                    const channelId = TELEGRAM_CONFIG.CHANNELS[channelName];
                    
                    if (!channelId) {
                        return ctx.reply('❌ Invalid channel. Please choose from: WEBSERIES or ANIME');
                    }
                    
                    state.data.channel = channelId;
                    
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
                    
                    state.data.seriesId = seriesId;
                    state.step = 'awaiting_season_number';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('✅ Series created successfully! Now let\'s add seasons.\n\n🏷️ Please send the season number (e.g., 1 for Season 1):');
                    break;
                    
                case 'awaiting_season_number':
                    const seasonNumber = parseInt(messageText);
                    if (isNaN(seasonNumber) || seasonNumber < 1) {
                        return ctx.reply('❌ Invalid season number. Please enter a valid number (e.g., 1):');
                    }
                    
                    const series = await Series.findOne({ seriesId: state.data.seriesId });
                    const newSeason = new Season({
                        seasonNumber,
                        title: `Season ${seasonNumber}`,
                        series: series._id
                    });
                    
                    await newSeason.save();
                    
                    series.seasons.push(newSeason._id);
                    await series.save();
                    
                    state.data.currentSeason = newSeason._id;
                    state.step = 'awaiting_season_title';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('🏷️ Season created! Now please provide a title for this season (or type "skip" to use default):');
                    break;
                    
                case 'awaiting_season_title':
                    if (messageText.toLowerCase() !== 'skip') {
                        const season = await Season.findById(state.data.currentSeason);
                        season.title = messageText;
                        await season.save();
                    }
                    
                    state.step = 'awaiting_episode_file';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('📁 Season title saved! Now please send the first episode file for this season.\n\nAfter sending the file, I\'ll ask for the episode details.');
                    break;
                    
                case 'awaiting_episode_number':
                    const episodeNumber = parseInt(messageText);
                    if (isNaN(episodeNumber) || episodeNumber < 1) {
                        return ctx.reply('❌ Invalid episode number. Please enter a valid number (e.g., 1):');
                    }
                    
                    state.data.tempEpisode.episodeNumber = episodeNumber;
                    state.step = 'awaiting_episode_title';
                    this.seriesCreationState.set(userId, state);
                    
                    await ctx.reply('📝 Episode number saved! Now please provide a title for this episode:');
                    break;
                    
                case 'awaiting_episode_title':
                    if (!messageText.trim()) {
                        return ctx.reply('❌ Episode title cannot be empty. Please provide a title:');
                    }
                    
                    state.data.tempEpisode.title = messageText.trim();
                    await this.uploadEpisodeFile(ctx, userId);
                    break;
                    
                case 'awaiting_next_action':
                    const action = messageText.toLowerCase();
                    
                    if (action === 'next episode') {
                        state.step = 'awaiting_episode_file';
                        this.seriesCreationState.set(userId, state);
                        
                        await ctx.reply('📁 Great! Please send the next episode file:');
                    } else if (action === 'new season') {
                        state.step = 'awaiting_season_number';
                        this.seriesCreationState.set(userId, state);
                        
                        await ctx.reply('🏷️ Let\'s create a new season! Please send the season number:');
                    } else if (action === 'finish') {
                        const series = await Series.findOne({ seriesId: state.data.seriesId }).populate('seasons');
                        const deepLink = `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${state.data.seriesId}`;
                        
                        await ctx.replyWithHTML(`✅ <b>Series completed successfully!</b>\n\n<b>Title:</b> ${series.title}\n<b>Seasons:</b> ${series.seasons.length}\n\n<b>Deep Link:</b> ${deepLink}\n\nUsers can now access this series using the deep link.`);
                        
                        this.seriesCreationState.delete(userId);
                    } else {
                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: '➕ Next Episode', callback_data: 'next_episode' },
                                    { text: '🆕 New Season', callback_data: 'new_season' }
                                ],
                                [
                                    { text: '✅ Finish', callback_data: 'finish_series' }
                                ]
                            ]
                        };
                        await ctx.reply('❌ Invalid action. Please choose:', { reply_markup: keyboard });
                    }
                    break;
                    
                default:
                    this.seriesCreationState.delete(userId);
                    await ctx.reply('❌ Operation cancelled due to unexpected error.');
            }
        } catch (error) {
            console.error('Error in series creation:', error);
            if (state && state.data && state.data.seriesId) {
                try {
                    const series = await Series.findOne({ seriesId: state.data.seriesId });
                    if (series) {
                        await Series.findByIdAndDelete(series._id);
                        console.log(`Deleted incomplete series: ${state.data.seriesId}`);
                    }
                } catch (deleteError) {
                    console.error('Error deleting incomplete series:', deleteError);
                }
            }
            this.seriesCreationState.delete(userId);
            await ctx.reply('❌ An error occurred. Please start over with /uploadseries.');
        }
    }

    async handleSeriesFileUpload(ctx, userId) {
        const state = this.seriesCreationState.get(userId);
        
        if (state.step === 'awaiting_episode_file') {
            const file = ctx.message.document || ctx.message.video;
            const fileId = file.file_id;
            const fileSize = file.file_size;
            
            if (fileSize > 2000 * 1024 * 1024) {
                return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
            }
            
            state.data.tempEpisode = {
                fileId: fileId,
                fileSize: fileSize
            };
            
            state.step = 'awaiting_episode_number';
            this.seriesCreationState.set(userId, state);
            
            await ctx.reply('📁 File received! Now please send the episode number (e.g., 1 for Episode 1):');
        }
    }

    async uploadEpisodeFile(ctx, userId) {
        const state = this.seriesCreationState.get(userId);
        
        try {
            const series = await Series.findOne({ seriesId: state.data.seriesId });
            const season = await Season.findById(state.data.currentSeason);
            
            const caption = this.generateSimpleEpisodeCaption(state.data.tempEpisode);
            const isVideo = state.data.tempEpisode.fileId.startsWith('BA');
            
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
            
            season.episodes.push(newEpisode._id);
            await season.save();
            
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            state.step = 'awaiting_next_action';
            this.seriesCreationState.set(userId, state);
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Next Episode', callback_data: 'next_episode' },
                        { text: '🆕 New Season', callback_data: 'new_season' }
                    ],
                    [
                        { text: '✅ Finish Series', callback_data: 'finish_series' }
                    ]
                ]
            };
            
            await ctx.reply(`✅ Episode uploaded successfully!\n\nWhat would you like to do next?`, { reply_markup: keyboard });
            
        } catch (error) {
            console.error('Error uploading episode file:', error);
            await ctx.reply('❌ Failed to upload episode. Please try again with /uploadseries.');
        }
    }

    async handleSeriesEditOperations(ctx, userId, messageText) {
        const state = this.seriesEditState.get(userId);
        
        try {
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
                    this.seriesEditState.delete(userId);
                    await ctx.reply('❌ Operation cancelled due to unexpected error.');
            }
        } catch (error) {
            console.error('Error in series edit operation:', error);
            this.seriesEditState.delete(userId);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    }

    async handleEditingOperations(ctx, userId, messageText) {
        const state = this.editingState.get(userId);
        
        try {
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
                    if (state.type === 'edit_episode') {
                        await this.handleEpisodeEdit(ctx, userId, messageText);
                    } else if (state.type === 'edit_season') {
                        await this.handleSeasonEdit(ctx, userId, messageText);
                    } else {
                        this.editingState.delete(userId);
                        await ctx.reply('❌ Operation cancelled due to unexpected error.');
                    }
            }
        } catch (error) {
            console.error('Error in editing operation:', error);
            this.editingState.delete(userId);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    }

    async handleSeasonEdit(ctx, userId, messageText) {
        const state = this.editingState.get(userId);
        
        try {
            switch (state.step) {
                case 'awaiting_series_id':
                    const series = await Series.findOne({ seriesId: messageText }).populate('seasons');
                    if (!series) {
                        this.editingState.delete(userId);
                        return ctx.reply('❌ Series not found. Please check the series ID.');
                    }
                    
                    if (series.seasons.length === 0) {
                        this.editingState.delete(userId);
                        return ctx.reply('❌ This series has no seasons yet.');
                    }

                    state.series = series;
                    state.step = 'awaiting_season_selection';
                    this.editingState.set(userId, state);

                    let seasonList = `✅ Series found: ${series.title}\n\nAvailable seasons:\n`;
                    series.seasons.forEach(season => {
                        seasonList += `• Season ${season.seasonNumber}: ${season.title}\n`;
                    });
                    seasonList += '\nPlease send the season number you want to edit:';

                    await ctx.reply(seasonList);
                    break;

                case 'awaiting_season_selection':
                    const seasonNumber = parseInt(messageText);
                    const season = state.series.seasons.find(s => s.seasonNumber === seasonNumber);
                    
                    if (!season) {
                        return ctx.reply('❌ Season not found. Please enter a valid season number.');
                    }

                    state.season = season;
                    state.step = 'awaiting_season_field';
                    this.editingState.set(userId, state);

                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📝 Title', callback_data: 'edit_season_title' }
                            ],
                            [
                                { text: '❌ Cancel', callback_data: 'cancel_edit' }
                            ]
                        ]
                    };

                    await ctx.replyWithHTML(
                        `✅ Season ${seasonNumber} selected!\n\n<b>Current Details:</b>\nTitle: ${season.title}\n\nWhat would you like to edit?`,
                        { reply_markup: keyboard }
                    );
                    break;
            }
        } catch (error) {
            console.error('Error in season edit:', error);
            this.editingState.delete(userId);
            await ctx.reply('❌ Error during season editing. Please try again.');
        }
    }

    // Additional helper methods for enhanced functionality
    async processSeriesId(ctx, userId, seriesId, state) {
        try {
            const series = await Series.findOne({ seriesId });
            if (!series) {
                await ctx.reply('❌ Series not found. Please check the series ID and try again.');
                this.seriesEditState.delete(userId);
                return;
            }
            
            state.series = series;
            
            if (state.type === 'add_season') {
                state.step = 'awaiting_season_number';
                this.seriesEditState.set(userId, state);
                
                await ctx.reply(`✅ Series found: ${series.title}\n\nPlease send the season number you want to add:`);
            } else if (state.type === 'add_episode') {
                const seasons = await Season.find({ series: series._id }).sort({ seasonNumber: 1 });
                
                if (seasons.length === 0) {
                    await ctx.reply('❌ This series has no seasons yet. Please add a season first using /addseason.');
                    this.seriesEditState.delete(userId);
                    return;
                }
                
                let response = `✅ Series found: ${series.title}\n\nAvailable seasons:\n`;
                seasons.forEach(season => {
                    response += `• Season ${season.seasonNumber}: ${season.title || 'No title'}\n`;
                });
                
                response += '\nPlease send the season number you want to add an episode to:';
                
                state.step = 'awaiting_season_number';
                state.seasons = seasons;
                this.seriesEditState.set(userId, state);
                
                await ctx.reply(response);
            }
            
        } catch (error) {
            console.error('Error processing series ID:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.seriesEditState.delete(userId);
        }
    }

    async processSeasonNumber(ctx, userId, seasonNumberText, state) {
        try {
            const seasonNumber = parseInt(seasonNumberText);
            if (isNaN(seasonNumber) || seasonNumber < 1) {
                return ctx.reply('❌ Invalid season number. Please enter a valid number (e.g., 1):');
            }
            
            if (state.type === 'add_season') {
                const existingSeason = await Season.findOne({ 
                    series: state.series._id, 
                    seasonNumber 
                });
                
                if (existingSeason) {
                    await ctx.reply('❌ A season with this number already exists for this series. Please choose a different number.');
                    return;
                }
                
                const newSeason = new Season({
                    seasonNumber,
                    title: `Season ${seasonNumber}`,
                    series: state.series._id
                });
                
                await newSeason.save();
                
                state.series.seasons.push(newSeason._id);
                await state.series.save();
                
                state.currentSeason = newSeason;
                state.step = 'awaiting_season_title';
                this.seriesEditState.set(userId, state);
                
                await ctx.reply('✅ Season created! Now please provide a title for this season (or type "skip" to use default):');
                
            } else if (state.type === 'add_episode') {
                const season = state.seasons.find(s => s.seasonNumber === seasonNumber);
                if (!season) {
                    await ctx.reply('❌ Season not found. Please choose from the available seasons.');
                    return;
                }
                
                state.currentSeason = season;
                state.step = 'awaiting_episode_number';
                this.seriesEditState.set(userId, state);
                
                await ctx.reply(`✅ Season ${seasonNumber} selected!\n\nPlease send the episode number:`);
            }
            
        } catch (error) {
            console.error('Error processing season number:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.seriesEditState.delete(userId);
        }
    }

    async processSeasonTitle(ctx, userId, title, state) {
        try {
            if (title.toLowerCase() !== 'skip') {
                state.currentSeason.title = title;
                await state.currentSeason.save();
            }
            
            await ctx.reply('✅ Season title saved! The season has been successfully added to the series.');
            this.seriesEditState.delete(userId);
            
        } catch (error) {
            console.error('Error processing season title:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.seriesEditState.delete(userId);
        }
    }

    async processEpisodeNumber(ctx, userId, episodeNumberText, state) {
        try {
            const episodeNumber = parseInt(episodeNumberText);
            if (isNaN(episodeNumber) || episodeNumber < 1) {
                return ctx.reply('❌ Invalid episode number. Please enter a valid number (e.g., 1):');
            }
            
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
            this.seriesEditState.set(userId, state);
            
            await ctx.reply('Episode number saved! Now please provide a title for this episode:');
            
        } catch (error) {
            console.error('Error processing episode number:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.seriesEditState.delete(userId);
        }
    }

    async processEpisodeTitle(ctx, userId, title, state) {
        try {
            if (!title.trim()) {
                return ctx.reply('❌ Episode title cannot be empty. Please provide a title:');
            }
            
            state.tempEpisode.title = title.trim();
            state.step = 'awaiting_episode_file';
            this.seriesEditState.set(userId, state);
            
            await ctx.reply('Episode title saved! Now please send the episode file:');
            
        } catch (error) {
            console.error('Error processing episode title:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.seriesEditState.delete(userId);
        }
    }

    async handleSeriesEditFileUpload(ctx, userId) {
        const state = this.seriesEditState.get(userId);
        
        if (state.step === 'awaiting_episode_file') {
            const file = ctx.message.document || ctx.message.video;
            const fileId = file.file_id;
            const fileSize = file.file_size;
            
            if (fileSize > 2000 * 1024 * 1024) {
                return ctx.reply('❌ File is too large. Telegram has a 2GB limit for files.');
            }
            
            state.tempEpisode.fileId = fileId;
            state.tempEpisode.fileSize = fileSize;
            
            await this.uploadEditEpisodeFile(ctx, userId, state);
        }
    }

    async uploadEditEpisodeFile(ctx, userId, state) {
        try {
            const caption = this.generateSimpleEpisodeCaption(state.tempEpisode);
            const isVideo = state.tempEpisode.fileId.startsWith('BA');
            
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
            
            const episodeContentId = generateEpisodeId(state.series.seriesId, state.currentSeason.seasonNumber, state.tempEpisode.episodeNumber);
            const user = await User.findOne({ telegramId: userId });
            
            const newEpisode = new Episode({
                episodeNumber: state.tempEpisode.episodeNumber,
                title: state.tempEpisode.title,
                season: state.currentSeason._id,
                telegramMessageId: response.message_id.toString(),
                telegramLink: `https://t.me/c/${state.series.telegramChannel.replace('-100', '')}/${response.message_id}`,
                contentId: episodeContentId
            });
            
            await newEpisode.save();
            
            state.currentSeason.episodes.push(newEpisode._id);
            await state.currentSeason.save();
            
            user.uploadCount += 1;
            user.lastUpload = new Date();
            await user.save();
            
            await ctx.reply(`✅ Episode uploaded successfully!\n\nEpisode ${state.tempEpisode.episodeNumber}: ${state.tempEpisode.title}\n\nAdded to ${state.series.title} - Season ${state.currentSeason.seasonNumber}`);
            
            this.seriesEditState.delete(userId);
            
        } catch (error) {
            console.error('Error uploading episode file:', error);
            await ctx.reply('❌ Failed to upload episode. Please try again with /addepisode.');
            this.seriesEditState.delete(userId);
        }
    }

    async searchContent(ctx, userId, searchQuery) {
        try {
            const movies = await Content.find({
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { contentId: { $regex: searchQuery, $options: 'i' } }
                ]
            }).limit(10).populate('uploadedBy', 'firstName username');
            
            const series = await Series.find({
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { seriesId: { $regex: searchQuery, $options: 'i' } }
                ]
            }).limit(10).populate('uploadedBy', 'firstName username');
            
            if (movies.length === 0 && series.length === 0) {
                await ctx.reply('❌ No content found matching your search.');
                this.editingState.delete(userId);
                return;
            }
            
            let message = `🔍 <b>Search Results for "${searchQuery}"</b>\n\n`;
            
            if (movies.length > 0) {
                message += '🎬 <b>Movies:</b>\n';
                movies.forEach((movie, index) => {
                    const uploader = movie.uploadedBy ? 
                        `@${movie.uploadedBy.username || movie.uploadedBy.firstName}` : 
                        'Unknown';
                    const deepLink = `https://t.me/${this.botUsername}?start=${movie.contentId}`;
                    message += `${index + 1}. <b>${movie.title}</b> (${movie.year})\n`;
                    message += `   📂 ID: <code>${movie.contentId}</code>\n`;
                    message += `   👤 By: ${uploader}\n`;
                    message += `   🔗 <a href="${deepLink}">Deep Link</a>\n\n`;
                });
            }
            
            if (series.length > 0) {
                message += '📺 <b>Series:</b>\n';
                series.forEach((serie, index) => {
                    const uploader = serie.uploadedBy ? 
                        `@${serie.uploadedBy.username || serie.uploadedBy.firstName}` : 
                        'Unknown';
                    const deepLink = `https://t.me/${this.botUsername}?start=${serie.seriesId}`;
                    message += `${index + 1}. <b>${serie.title}</b> (${serie.year})\n`;
                    message += `   📂 ID: <code>${serie.seriesId}</code>\n`;
                    message += `   👤 By: ${uploader}\n`;
                    message += `   🔗 <a href="${deepLink}">Deep Link</a>\n\n`;
                });
            }
            
            await ctx.replyWithHTML(message, { disable_web_page_preview: true });
            this.editingState.delete(userId);
            
        } catch (error) {
            console.error('Error searching content:', error);
            await ctx.reply('❌ An error occurred while searching. Please try again.');
            this.editingState.delete(userId);
        }
    }

    async processContentId(ctx, userId, contentId, state) {
        try {
            const movie = await Content.findOne({ contentId });
            if (movie) {
                state.content = movie;
                state.contentType = 'movie';
                
                if (state.type === 'edit') {
                    state.step = 'awaiting_edit_field';
                    this.editingState.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📝 Title', callback_data: 'edit_title' },
                                { text: '📅 Year', callback_data: 'edit_year' }
                            ],
                            [
                                { text: '🎭 Genre', callback_data: 'edit_genre' },
                                { text: '📄 Description', callback_data: 'edit_description' }
                            ],
                            [
                                { text: '❌ Cancel', callback_data: 'cancel_edit' }
                            ]
                        ]
                    };
                    
                    await ctx.replyWithHTML(`✏️ <b>Editing movie: ${movie.title}</b>\n\nWhat would you like to edit?`, { reply_markup: keyboard });
                } else if (state.type === 'delete') {
                    state.step = 'awaiting_delete_confirmation';
                    this.editingState.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '✅ Yes, Delete', callback_data: 'confirm_delete' },
                                { text: '❌ Cancel', callback_data: 'cancel_delete' }
                            ]
                        ]
                    };
                    
                    await ctx.replyWithHTML(`🗑️ <b>Delete Confirmation</b>\n\nAre you sure you want to delete this movie?\n\n<b>Title:</b> ${movie.title}\n<b>Year:</b> ${movie.year}\n<b>ID:</b> ${movie.contentId}\n\nThis action cannot be undone!`, { reply_markup: keyboard });
                }
                return;
            }
            
            const series = await Series.findOne({ seriesId: contentId });
            if (series) {
                state.content = series;
                state.contentType = 'series';
                
                if (state.type === 'edit') {
                    state.step = 'awaiting_edit_field';
                    this.editingState.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📝 Title', callback_data: 'edit_title' },
                                { text: '📅 Year', callback_data: 'edit_year' }
                            ],
                            [
                                { text: '🎭 Genre', callback_data: 'edit_genre' },
                                { text: '📄 Description', callback_data: 'edit_description' }
                            ],
                            [
                                { text: '❌ Cancel', callback_data: 'cancel_edit' }
                            ]
                        ]
                    };
                    
                    await ctx.replyWithHTML(`✏️ <b>Editing series: ${series.title}</b>\n\nWhat would you like to edit?`, { reply_markup: keyboard });
                } else if (state.type === 'delete') {
                    state.step = 'awaiting_delete_confirmation';
                    this.editingState.set(userId, state);
                    
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '✅ Yes, Delete', callback_data: 'confirm_delete' },
                                { text: '❌ Cancel', callback_data: 'cancel_delete' }
                            ]
                        ]
                    };
                    
                    await ctx.replyWithHTML(`🗑️ <b>Delete Confirmation</b>\n\nAre you sure you want to delete this series?\n\n<b>Title:</b> ${series.title}\n<b>Year:</b> ${series.year}\n<b>ID:</b> ${series.seriesId}\n\n<b>⚠️ Warning:</b> This will delete all seasons and episodes!\n\nThis action cannot be undone!`, { reply_markup: keyboard });
                }
                return;
            }
            
            await ctx.reply('❌ Content not found. Please check the content ID and try again.');
            this.editingState.delete(userId);
            
        } catch (error) {
            console.error('Error processing content ID:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
            this.editingState.delete(userId);
        }
    }

    async processEditField(ctx, userId, fieldName, state) {
        const validFields = ['title', 'year', 'description', 'genre'];
        
        if (!validFields.includes(fieldName.toLowerCase())) {
            await ctx.reply('❌ Invalid field. Please choose from: title, year, description, genre');
            return;
        }
        
        state.editField = fieldName.toLowerCase();
        state.step = 'awaiting_edit_value';
        this.editingState.set(userId, state);
        
        let currentValue = '';
        if (state.editField === 'genre' && state.content.genre) {
            currentValue = `\n\n<b>Current value:</b> ${state.content.genre.join(', ')}`;
        } else if (state.content[state.editField]) {
            currentValue = `\n\n<b>Current value:</b> ${state.content[state.editField]}`;
        }
        
        await ctx.replyWithHTML(`Please enter the new value for <b>${fieldName}</b>:${currentValue}`);
    }

    async processEditValue(ctx, userId, newValue, state) {
        try {
            let updateData = {};
            
            switch (state.editField) {
                case 'title':
                    if (!newValue.trim()) {
                        return ctx.reply('❌ Title cannot be empty. Please enter a valid title:');
                    }
                    updateData.title = newValue.trim();
                    break;
                    
                case 'year':
                    const year = parseInt(newValue);
                    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5) {
                        return ctx.reply('❌ Invalid year. Please enter a valid year (e.g., 2023):');
                    }
                    updateData.year = year;
                    break;
                    
                case 'description':
                    updateData.description = newValue.trim();
                    break;
                    
                case 'genre':
                    updateData.genre = newValue.split(',').map(g => g.trim()).filter(g => g.length > 0);
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
            this.editingState.delete(userId);
            
        } catch (error) {
            console.error('Error updating content:', error);
            await ctx.reply('❌ An error occurred while updating. Please try again.');
            this.editingState.delete(userId);
        }
    }

    async processDeleteConfirmation(ctx, userId, confirmation, state) {
        if (confirmation.toLowerCase() !== 'yes') {
            await ctx.reply('✅ Deletion cancelled.');
            this.editingState.delete(userId);
            return;
        }
        
        try {
            if (state.contentType === 'movie') {
                await Content.findOneAndDelete({ contentId: state.content.contentId });
                await ctx.reply('✅ Movie deleted successfully!');
            } else if (state.contentType === 'series') {
                const series = await Series.findOne({ seriesId: state.content.seriesId });
                if (series) {
                    for (const seasonId of series.seasons) {
                        const season = await Season.findById(seasonId);
                        if (season) {
                            await Episode.deleteMany({ season: seasonId });
                            await Season.findByIdAndDelete(seasonId);
                        }
                    }
                    await Series.findByIdAndDelete(series._id);
                }
                await ctx.reply('✅ Series and all related content deleted successfully!');
            }
            
            this.editingState.delete(userId);
            
        } catch (error) {
            console.error('Error deleting content:', error);
            await ctx.reply('❌ An error occurred while deleting. Please try again.');
            this.editingState.delete(userId);
        }
    }

    generateMovieCaption(movieData) {
        let caption = `<b>${movieData.title}</b> (${movieData.year})\n`;
        
        if (movieData.description) {
            caption += `\n${movieData.description}`;
        }
        
        if (movieData.genre && movieData.genre.length > 0) {
            caption += `\n\n<b>Genre:</b> ${movieData.genre.join(', ')}`;
        }
        
        return caption;
    }
    
    generateSimpleEpisodeCaption(episode) {
        return `<b>Episode ${episode.episodeNumber}:</b> ${episode.title}`;
    }

    // Enhanced error handling and logging
    logError(operation, error, userId = null) {
        console.error(`[AdvancedUploadBot] Error in ${operation}:`, {
            error: error.message,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // Cleanup function for graceful shutdown
    async cleanup() {
        try {
            console.log('Cleaning up Advanced Upload Bot...');
            
            // Clear all pending operations
            this.pendingOperations.clear();
            this.seriesCreationState.clear();
            this.editingState.clear();
            this.seriesEditState.clear();
            this.viewState.clear();
            
            if (this.bot) {
                await this.bot.stop('SIGTERM');
            }
            
            console.log('✅ Advanced Upload Bot cleanup completed');
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
}

module.exports = AdvancedUploadBot;