const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const Track = require('../models/Track');
const TELEGRAM_CONFIG = require('../config/telegram');

class UserBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.BOT_TOKEN;
        this.botUsername = TELEGRAM_CONFIG.BOT_USERNAME;
        this.adminUsers = TELEGRAM_CONFIG.ADMIN_USERS || [];
        this.channels = TELEGRAM_CONFIG.CHANNELS;
        
        console.log('==========================================');
        console.log('🔄 USERBOT INITIALIZATION STARTED');
        console.log('==========================================');
        console.log('🔑 BOT_TOKEN present:', !!this.botToken);
        console.log('👑 ADMIN_USERS:', this.adminUsers);
        console.log('👑 ADMIN count:', this.adminUsers.length);
        console.log('==========================================');
        
        if (!this.botToken) {
            console.error('❌ CRITICAL: BOT_TOKEN is missing!');
            return;
        }
        
        // Ensure adminUsers are numbers
        this.adminUsers = this.adminUsers.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        console.log('✅ Final ADMIN_USERS (numbers):', this.adminUsers);
        
        this.bot = new Telegraf(this.botToken);
        
        // Add global error handler
        this.bot.catch((err, ctx) => {
            console.error('🤖 Bot error:', err);
        });
        
        // Setup handlers in correct order
        this.setupAdminCommands(); // SETUP COMMANDS FIRST!
        this.setupHandlers();
    }
    
    start() {
        if (!this.bot) {
            console.error('❌ Cannot start: Bot not initialized');
            return;
        }
        
        this.bot.launch().then(() => {
            console.log('✅ User Telegram bot started successfully');
            console.log('👑 Admin users ready:', this.adminUsers);
        }).catch(err => {
            console.error('❌ Error starting bot:', err);
        });
        
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
    
    setupAdminCommands() {
        console.log('🔧 Setting up ADMIN commands FIRST...');
        
        // /admincheck command - Debug command
        this.bot.command('admincheck', async (ctx) => {
            console.log('🔐 /admincheck command received');
            const userId = parseInt(ctx.from.id);
            const isAdmin = this.adminUsers.includes(userId);
            
            await ctx.reply(
                `🔐 <b>Admin Check</b>\n\n` +
                `👤 Your ID: <code>${userId}</code>\n` +
                `👑 Admin Status: ${isAdmin ? '✅ YES' : '❌ NO'}\n` +
                `📋 Admin List: ${this.adminUsers.join(', ')}\n\n` +
                `Try /stats to test admin commands.`,
                { parse_mode: 'HTML' }
            );
        });
        
        // /debug command - Shows all configuration
        this.bot.command('debug', async (ctx) => {
            console.log('🐛 /debug command received');
            const userId = parseInt(ctx.from.id);
            const isAdmin = this.adminUsers.includes(userId);
            
            if (!isAdmin) {
                await ctx.reply('⛔️ Admin only command');
                return;
            }
            
            await ctx.reply(
                `🐛 <b>Debug Information</b>\n\n` +
                `👤 Your ID: <code>${userId}</code>\n` +
                `👑 Admin Status: ${isAdmin ? '✅ YES' : '❌ NO'}\n` +
                `📋 Admin Users: ${JSON.stringify(this.adminUsers)}\n` +
                `🔢 Admin Count: ${this.adminUsers.length}\n` +
                `🤖 Bot Token: ${this.botToken ? 'Present' : 'Missing'}\n` +
                `📡 Channels: ${Object.keys(this.channels).length}\n` +
                `🕒 Time: ${new Date().toISOString()}`,
                { parse_mode: 'HTML' }
            );
        });
        
        // /stats command
        this.bot.command('stats', async (ctx) => {
            console.log('📊 /stats command received');
            
            // Admin check
            const userId = parseInt(ctx.from.id);
            if (!this.adminUsers.includes(userId)) {
                await ctx.reply(`⛔️ Admin only. Your ID: ${userId}`);
                return;
            }
            
            try {
                // Get stats
                const totalUsers = await Track.distinct('telegramId').countDocuments() || 0;
                const totalRequests = await Track.countDocuments() || 0;
                const successful = await Track.countDocuments({ status: 'delivered' }) || 0;
                const failed = await Track.countDocuments({ status: 'failed' }) || 0;
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayCount = await Track.countDocuments({ timestamp: { $gte: today } }) || 0;
                
                let message = `📊 <b>ArcXzone Bot Statistics</b>\n\n`;
                message += `👥 <b>Total Unique Users:</b> ${totalUsers}\n`;
                message += `📨 <b>Total Requests:</b> ${totalRequests}\n`;
                message += `✅ <b>Successful Deliveries:</b> ${successful}\n`;
                message += `❌ <b>Failed Requests:</b> ${failed}\n`;
                message += `📈 <b>Today's Requests:</b> ${todayCount}\n`;
                message += `👑 <b>Your Admin ID:</b> ${userId}\n`;
                
                await ctx.reply(message, { parse_mode: 'HTML' });
                console.log('✅ Stats sent successfully');
                
            } catch (error) {
                console.error('❌ Error in /stats:', error);
                await ctx.reply(
                    `📊 <b>Basic Stats</b>\n\n` +
                    `👑 Your ID (${userId}) is admin: ✅\n` +
                    `❌ Database error: ${error.message}`,
                    { parse_mode: 'HTML' }
                );
            }
        });
        
        // /activity command
        this.bot.command('activity', async (ctx) => {
            console.log('📈 /activity command received');
            
            // Admin check
            const userId = parseInt(ctx.from.id);
            if (!this.adminUsers.includes(userId)) {
                await ctx.reply(`⛔️ Admin only. Your ID: ${userId}`);
                return;
            }
            
            try {
                const limit = 15;
                const activities = await Track.find()
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .lean();
                
                if (!activities || activities.length === 0) {
                    await ctx.reply('📭 No activity recorded yet.');
                    return;
                }
                
                let message = `⚡ <b>Recent Activity (Last ${activities.length})</b>\n\n`;
                
                activities.forEach((act, index) => {
                    const timeAgo = this.formatTimeAgo(act.timestamp);
                    let contentInfo = '';
                    
                    if (act.movieName) {
                        contentInfo = `🎬 ${act.movieName}`;
                    } else if (act.seriesName) {
                        contentInfo = `📺 ${act.seriesName}`;
                        if (act.seasonNumber) contentInfo += ` S${act.seasonNumber}`;
                        if (act.episodeNumber) contentInfo += `E${act.episodeNumber}`;
                    } else if (act.contentType === 'bot_start') {
                        contentInfo = '🤖 Bot Start/Help';
                    } else {
                        contentInfo = act.contentId ? `🔗 ${act.contentId}` : '📝 Interaction';
                    }
                    
                    const username = act.username ? `@${act.username}` : 
                                   act.firstName ? act.firstName : `User ${act.telegramId}`;
                    
                    const statusIcon = act.status === 'delivered' ? '✅' : 
                                     act.status === 'failed' ? '❌' : 
                                     act.status === 'not_found' ? '🔍' : '⏳';
                    
                    message += `${index + 1}. <b>${username}</b>\n`;
                    message += `   ${contentInfo}\n`;
                    message += `   ${statusIcon} ${act.status} | 📍 ${act.ipAddress || 'N/A'} | ⏰ ${timeAgo}\n`;
                    message += `---\n`;
                });
                
                await ctx.reply(message, { parse_mode: 'HTML' });
                console.log('✅ Activity sent successfully');
                
            } catch (error) {
                console.error('❌ Error in /activity:', error);
                await ctx.reply(`❌ Error fetching activity: ${error.message}`);
            }
        });
        
        // /logs command
        this.bot.command('logs', async (ctx) => {
            console.log('📋 /logs command received');
            
            // Admin check
            const userId = parseInt(ctx.from.id);
            if (!this.adminUsers.includes(userId)) {
                await ctx.reply(`⛔️ Admin only. Your ID: ${userId}`);
                return;
            }
            
            try {
                const args = ctx.message.text.split(' ');
                const limit = args.length > 1 && !isNaN(args[1]) ? parseInt(args[1]) : 20;
                
                const logs = await Track.find({
                    contentType: { $in: ['movie', 'episode', 'series_selection'] }
                }).sort({ timestamp: -1 }).limit(limit).lean();
                
                if (!logs || logs.length === 0) {
                    await ctx.reply('📭 No download logs found.');
                    return;
                }
                
                let message = `📋 <b>Recent Downloads (Last ${logs.length})</b>\n\n`;
                
                logs.forEach((log, index) => {
                    const timeAgo = this.formatTimeAgo(log.timestamp);
                    let contentName = 'Unknown Content';
                    
                    if (log.movieName) contentName = `🎬 ${log.movieName}`;
                    else if (log.seriesName) {
                        contentName = `📺 ${log.seriesName}`;
                        if (log.seasonNumber) contentName += ` S${log.seasonNumber}`;
                        if (log.episodeNumber) contentName += `E${log.episodeNumber}`;
                    }
                    
                    const username = log.username ? `@${log.username}` : 
                                   log.firstName ? log.firstName : `User ${log.telegramId}`;
                    
                    message += `${index + 1}. ${username}\n`;
                    message += `   ${contentName}\n`;
                    message += `   📍 ${log.ipAddress || 'N/A'} | ⏰ ${timeAgo}\n`;
                    message += `---\n`;
                });
                
                await ctx.reply(message, { parse_mode: 'HTML' });
                console.log('✅ Logs sent successfully');
                
            } catch (error) {
                console.error('❌ Error in /logs:', error);
                await ctx.reply(`❌ Error fetching logs: ${error.message}`);
            }
        });
        
        // /users command
        this.bot.command('users', async (ctx) => {
            console.log('👥 /users command received');
            
            // Admin check
            const userId = parseInt(ctx.from.id);
            if (!this.adminUsers.includes(userId)) {
                await ctx.reply(`⛔️ Admin only. Your ID: ${userId}`);
                return;
            }
            
            try {
                const users = await Track.aggregate([
                    { $group: {
                        _id: '$telegramId',
                        username: { $last: '$username' },
                        firstName: { $last: '$firstName' },
                        requestCount: { $sum: 1 },
                        lastSeen: { $max: '$timestamp' }
                    }},
                    { $sort: { lastSeen: -1 } },
                    { $limit: 50 }
                ]);
                
                if (!users || users.length === 0) {
                    await ctx.reply('👥 No users found yet.');
                    return;
                }
                
                let message = `👥 <b>Registered Users (${users.length})</b>\n\n`;
                
                users.forEach((user, index) => {
                    const name = user.username ? `@${user.username}` : 
                               user.firstName ? user.firstName : `User ${user._id}`;
                    const lastSeen = this.formatTimeAgo(user.lastSeen);
                    
                    message += `${index + 1}. ${name}\n`;
                    message += `   📊 Requests: ${user.requestCount}\n`;
                    message += `   👀 Last seen: ${lastSeen}\n`;
                    message += `---\n`;
                });
                
                await ctx.reply(message, { parse_mode: 'HTML' });
                console.log('✅ Users list sent successfully');
                
            } catch (error) {
                console.error('❌ Error in /users:', error);
                await ctx.reply(`❌ Error fetching users: ${error.message}`);
            }
        });
        
        // /export command
        this.bot.command('export', async (ctx) => {
            console.log('💾 /export command received');
            
            // Admin check
            const userId = parseInt(ctx.from.id);
            if (!this.adminUsers.includes(userId)) {
                await ctx.reply(`⛔️ Admin only. Your ID: ${userId}`);
                return;
            }
            
            try {
                const args = ctx.message.text.split(' ');
                const days = args.length > 1 && !isNaN(args[1]) ? parseInt(args[1]) : 7;
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                
                const data = await Track.find({
                    timestamp: { $gte: startDate }
                }).sort({ timestamp: -1 }).lean();
                
                if (!data || data.length === 0) {
                    await ctx.reply(`📭 No data found for the last ${days} days.`);
                    return;
                }
                
                // Create CSV content
                let csvContent = 'Timestamp,TelegramID,Username,FirstName,ContentType,ContentID,MovieName,SeriesName,Season,Episode,IP,Status,ErrorMessage\n';
                
                data.forEach(item => {
                    const row = [
                        item.timestamp.toISOString(),
                        item.telegramId,
                        item.username || '',
                        item.firstName || '',
                        item.contentType,
                        item.contentId || '',
                        item.movieName || '',
                        item.seriesName || '',
                        item.seasonNumber || '',
                        item.episodeNumber || '',
                        item.ipAddress || '',
                        item.status,
                        (item.errorMessage || '').replace(/"/g, '""')
                    ].map(field => `"${field}"`).join(',');
                    
                    csvContent += row + '\n';
                });
                
                // Send as document
                await ctx.replyWithDocument({
                    source: Buffer.from(csvContent, 'utf-8'),
                    filename: `arcxzone_export_${new Date().toISOString().split('T')[0]}.csv`
                }, {
                    caption: `💾 Exported ${data.length} records from last ${days} days`,
                    parse_mode: 'HTML'
                });
                
                console.log('✅ Export sent successfully');
                
            } catch (error) {
                console.error('❌ Error in /export:', error);
                await ctx.reply(`❌ Error exporting data: ${error.message}`);
            }
        });
        
        console.log('✅ All admin commands registered');
    }
    
    setupHandlers() {
        console.log('🔧 Setting up regular bot handlers...');
        
        // Add middleware to log incoming updates
        this.bot.use(async (ctx, next) => {
            if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
                console.log(`📨 COMMAND: ${ctx.message.text} from ${ctx.from.id}`);
            }
            await next();
        });
        
        // Start command with deep link support
        this.bot.start(async (ctx) => {
            console.log('🚀 /start command received');
            
            let contentId = ctx.startPayload;
            
            console.log('Raw deep link received:', contentId || 'No payload');
            
            // Track user access
            const track = await this.trackUserRequest(ctx, contentId);
            
            // Decode URL encoding if present
            if (contentId) {
                contentId = decodeURIComponent(contentId);
                console.log('Decoded content ID:', contentId);
                
                await this.handleContentRequest(ctx, contentId, track);
            } else {
                // Update track for bot start
                if (track) {
                    await this.updateTrackDelivery(track._id, {
                        status: 'delivered',
                        contentType: 'bot_start'
                    });
                }
                
                const welcomeMessage = 'Welcome to Arcxzone Download Bot! 🤖\n\n' +
                    'This bot provides access to movies, web series, and anime.\n\n' +
                    '**How to use:**\n' +
                    '1. Visit our website\n' +
                    '2. Browse content\n' +
                    '3. Click "Download" button\n' +
                    '4. Content will be sent here automatically!\n\n' +
                    '[🎥 Browse Content](https://arc-xzone-webapp.vercel.app)\n\n' +
                    'Need help? Use /help command';
                
                await ctx.reply(welcomeMessage, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                });
            }
        });
        
        // Help command
        this.bot.help(async (ctx) => {
            console.log('❓ /help command received');
            await this.trackUserRequest(ctx, null, { contentType: 'bot_start' });
            
            await ctx.reply(
                '📖 **ArcXzone Bot Help**\n\n' +
                '**How it works:**\n' +
                '• Visit our website\n' +
                '• Browse movies, web series, or anime\n' +
                '• Click the "Download" button\n' +
                '• The content will be sent to you here automatically!\n\n' +
                '**Commands:**\n' +
                '/start - Start the bot\n' +
                '/help - Show this help message\n\n' +
                '[🌐 Visit Website](https://arc-xzone-webapp.vercel.app)',
                { parse_mode: 'Markdown' }
            );
        });
        
        // REMOVED the generic text handler that was intercepting commands
        // Commands are already handled by their specific handlers
        
        // Only handle non-command text messages
        this.bot.on('text', async (ctx) => {
            const text = ctx.message.text;
            
            // Skip commands (they start with /)
            if (text.startsWith('/')) {
                console.log(`⚠️ Unhandled command: ${text}`);
                return;
            }
            
            console.log('💬 Non-command text message:', text);
            
            await this.trackUserRequest(ctx, null, {
                contentType: 'bot_start',
                errorMessage: 'User sent text: ' + text.substring(0, 100)
            });
            
            await ctx.reply(
                'ℹ️ I can only send content via download links from our website.\n\n' +
                'Please visit [ArcXzone Website](https://arc-xzone-webapp.vercel.app) to browse and download content.\n\n' +
                'Use /help for more information.',
                { parse_mode: 'Markdown' }
            );
        });
        
        // Callback query handler for series episodes
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            console.log('🔘 Callback data received:', data);
            
            // Track callback query
            const track = await this.trackUserRequest(ctx, data, {
                contentType: 'series_selection'
            });
            
            await ctx.answerCbQuery();
            
            if (data.startsWith('season_')) {
                await this.handleSeasonSelection(ctx, data, track);
            }
        });
    }
    
    // ==============================================
    // TRACKING METHODS
    // ==============================================
    
    async trackUserRequest(ctx, contentId, options = {}) {
        try {
            const user = ctx.from;
            
            const trackData = {
                telegramId: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                contentId: contentId || null,
                contentType: options.contentType || 'unknown_content',
                ipAddress: 'N/A',
                userAgent: 'Telegram Bot',
                requestDetails: {
                    chatType: ctx.chat?.type,
                    chatId: ctx.chat?.id,
                    messageId: ctx.message?.message_id,
                    isCommand: ctx.message?.text?.startsWith('/') || false
                },
                status: 'requested'
            };
            
            // Try to find content details if we have contentId
            if (contentId) {
                try {
                    const movie = await Content.findOne({ contentId });
                    if (movie) {
                        trackData.movieName = movie.title;
                        trackData.contentType = 'movie';
                    }
                    
                    const episode = await Episode.findOne({ contentId });
                    if (episode) {
                        trackData.contentType = 'episode';
                        trackData.episodeTitle = episode.title;
                        trackData.episodeNumber = episode.episodeNumber;
                        
                        // Get season info
                        const season = await Season.findById(episode.season);
                        if (season) {
                            trackData.seasonNumber = season.seasonNumber;
                            
                            // Get series info
                            const series = await Series.findById(season.series);
                            if (series) {
                                trackData.seriesName = series.title;
                            }
                        }
                    }
                    
                    const series = await Series.findOne({ seriesId: contentId });
                    if (series) {
                        trackData.seriesName = series.title;
                        trackData.contentType = 'series_selection';
                    }
                } catch (dbError) {
                    console.error('Error fetching content details:', dbError);
                }
            }
            
            const track = new Track(trackData);
            await track.save();
            
            console.log(`📝 Tracked: ${user.id} - ${trackData.contentType} - ${contentId || 'no-content'}`);
            
            // Store track ID in context for later update
            ctx.trackId = track._id;
            
            return track;
            
        } catch (error) {
            console.error('❌ Error tracking user request:', error);
            return null;
        }
    }
    
    async updateTrackDelivery(trackId, updates) {
        try {
            if (!trackId) return;
            
            await Track.findByIdAndUpdate(trackId, updates);
            console.log(`📝 Updated track ${trackId}:`, updates);
            
        } catch (error) {
            console.error('❌ Error updating track delivery:', error);
        }
    }
    
    // ==============================================
    // CONTENT DELIVERY METHODS
    // ==============================================
    
    async handleContentRequest(ctx, contentId, track) {
        try {
            console.log('🔍 Looking for content with ID:', contentId);
            
            // Check if it's a movie
            const movie = await Content.findOne({ contentId });
            if (movie) {
                console.log('✅ Found movie:', movie.title);
                await this.deliverMovie(ctx, movie, track);
                return;
            }
            
            // Check if it's an episode
            const episode = await Episode.findOne({ contentId });
            if (episode) {
                console.log('✅ Found episode:', episode.title);
                await this.deliverEpisode(ctx, episode, track);
                return;
            }
            
            // Check if it's a series
            let series = await Series.findOne({ seriesId: contentId });
            
            // If not found, try case-insensitive search
            if (!series) {
                series = await Series.findOne({ 
                    seriesId: { $regex: new RegExp(`^${contentId}$`, 'i') } 
                });
            }
            
            if (series) {
                console.log('✅ Found series:', series.title);
                await this.showSeasonSelection(ctx, series, track);
                return;
            }
            
            console.log('❌ Content not found for ID:', contentId);
            
            // Update track to show content not found
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'not_found',
                    errorMessage: 'Content not found for ID: ' + contentId
                });
            }
            
            await ctx.reply(
                '❌ Sorry, the requested content was not found.\n\n' +
                'Please check the link and try again, or visit our website for available content:\n' +
                '[arc-xzone-webapp.vercel.app](https://arc-xzone-webapp.vercel.app)',
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            console.error('❌ Error handling content request:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: error.message
                });
            }
            
            await ctx.reply('❌ An error occurred while processing your request. Please try again later.');
        }
    }
    
    async deliverMovie(ctx, movie, track) {
        try {
            // Send the movie file
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                movie.telegramChannel,
                parseInt(movie.telegramMessageId)
            );
            
            // Update tracking with movie details
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    movieName: movie.title,
                    contentType: 'movie',
                    status: 'delivered'
                });
            }
            
            // Send completion message
            await ctx.reply(
                `✅ **${movie.title}** sent successfully! 🎬\n\n` +
                `Enjoy watching!\n\n` +
                `[🎥 Browse More Content](https://arc-xzone-webapp.vercel.app)`,
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            console.error('❌ Error delivering movie:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: 'Delivery error: ' + error.message
                });
            }
            
            await ctx.reply('❌ Sorry, I could not retrieve the movie. Please try again later.');
        }
    }
    
    async deliverEpisode(ctx, episode, track) {
        try {
            const season = await Season.findById(episode.season).populate('series');
            
            if (!season || !season.series) {
                throw new Error('Could not find series information for this episode.');
            }
            
            // Send the episode file
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                season.series.telegramChannel,
                parseInt(episode.telegramMessageId)
            );
            
            // Update tracking with episode details
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    seriesName: season.series.title,
                    seasonNumber: season.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    episodeTitle: episode.title,
                    contentType: 'episode',
                    status: 'delivered'
                });
            }
            
        } catch (error) {
            console.error('❌ Error delivering episode:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: 'Episode delivery error: ' + error.message
                });
            }
            
            await ctx.reply('❌ Sorry, I could not retrieve the episode. Please try again later.');
        }
    }
    
    async showSeasonSelection(ctx, series, track) {
        try {
            console.log('📺 Showing season selection for series:', series.title);
            const seasons = await Season.find({ series: series._id }).sort({ seasonNumber: 1 });
            
            console.log('✅ Found seasons:', seasons.length);
            
            if (!seasons || seasons.length === 0) {
                console.log('❌ No seasons found for series:', series.title);
                return ctx.reply('No seasons available for this series.');
            }
            
            const keyboard = {
                inline_keyboard: seasons.map(season => ([
                    {
                        text: season.title || `Season ${season.seasonNumber}`,
                        callback_data: `season_${series.seriesId}_${season.seasonNumber}`
                    }
                ]))
            };
            
            await ctx.reply(`Select a season for **${series.title}**:`, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });
            
            // Update track for season selection
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    seriesName: series.title,
                    contentType: 'series_selection',
                    status: 'requested'
                });
            }
            
        } catch (error) {
            console.error('❌ Error showing season selection:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: 'Season selection error: ' + error.message
                });
            }
            
            ctx.reply('❌ An error occurred while loading seasons.');
        }
    }
    
    async handleSeasonSelection(ctx, data, track) {
        try {
            console.log('🔄 Handling season selection:', data);
            
            // Format: season_{seriesId}_{seasonNumber}
            const parts = data.split('_');
            const seasonNumber = parseInt(parts[parts.length - 1]);
            const seriesId = parts.slice(1, parts.length - 1).join('_');
            
            console.log('🔍 Parsed seriesId:', seriesId);
            console.log('🔍 Parsed seasonNumber:', seasonNumber);
            
            const series = await Series.findOne({ seriesId });
            if (!series) {
                console.log('❌ Series not found:', seriesId);
                return ctx.reply('❌ Sorry, the requested series was not found.');
            }
            
            const season = await Season.findOne({ 
                series: series._id, 
                seasonNumber: seasonNumber
            });
            
            if (!season) {
                console.log('❌ Season not found:', seasonNumber);
                return ctx.reply('❌ Season not found.');
            }
            
            const episodes = await Episode.find({ season: season._id }).sort({ episodeNumber: 1 });
            
            console.log('✅ Found episodes:', episodes.length);
            
            if (!episodes || episodes.length === 0) {
                return ctx.reply('❌ No episodes found for this season.');
            }
            
            // Update tracking for season selection
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    seriesName: series.title,
                    seasonNumber: season.seasonNumber,
                    contentType: 'series_selection',
                    status: 'requested'
                });
            }
            
            // Send all episodes
            await this.sendAllEpisodes(ctx, series, season, episodes, track);
            
        } catch (error) {
            console.error('❌ Error handling season selection:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: 'Season selection error: ' + error.message
                });
            }
            
            ctx.reply('❌ An error occurred while processing your request.');
        }
    }
    
    async sendAllEpisodes(ctx, series, season, episodes, track) {
        try {
            // First, send series and season information
            let infoMessage = `📺 **${series.title}**`;
            
            if (series.year) {
                infoMessage += ` (${series.year})`;
            }
            
            infoMessage += `\n${season.title || `Season ${season.seasonNumber}`}`;
            
            if (series.description) {
                infoMessage += `\n\n${series.description}`;
            }
            
            if (series.genre && series.genre.length > 0) {
                infoMessage += `\n\n**Genre:** ${series.genre.join(', ')}`;
            }
            
            infoMessage += `\n\n**Episodes:** ${episodes.length}`;
            
            // Edit the original message
            try {
                await ctx.editMessageText(infoMessage, { parse_mode: 'Markdown' });
            } catch (editError) {
                await ctx.reply(infoMessage, { parse_mode: 'Markdown' });
            }
            
            // Send a small delay message
            const progressMsg = await ctx.reply(`⏳ Sending ${episodes.length} episodes...`);
            
            // Send each episode
            let successfulEpisodes = 0;
            for (const episode of episodes) {
                try {
                    await this.bot.telegram.copyMessage(
                        ctx.chat.id,
                        series.telegramChannel,
                        parseInt(episode.telegramMessageId)
                    );
                    
                    successfulEpisodes++;
                    
                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.error(`❌ Error sending episode ${episode.episodeNumber}:`, error);
                    await ctx.reply(`❌ Failed to send episode ${episode.episodeNumber}`);
                }
            }
            
            // Delete the progress message
            try {
                await this.bot.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id);
            } catch (e) {
                // Ignore delete errors
            }
            
            // Send completion message
            await ctx.reply(
                `✅ Successfully sent ${successfulEpisodes}/${episodes.length} episodes of **${series.title}**! 🎬\n\n` +
                `Enjoy watching!\n\n` +
                `[🎥 Browse More Content](https://arc-xzone-webapp.vercel.app)`,
                { parse_mode: 'Markdown' }
            );
            
            // Update track with final status
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'delivered',
                    contentType: 'series_selection'
                });
            }
            
        } catch (error) {
            console.error('❌ Error sending all episodes:', error);
            
            if (track) {
                await this.updateTrackDelivery(track._id, {
                    status: 'failed',
                    errorMessage: 'Episode delivery error: ' + error.message
                });
            }
            
            await ctx.reply('❌ An error occurred while sending episodes. Please try again.');
        }
    }
    
    // ==============================================
    // HELPER METHODS
    // ==============================================
    
    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;
        
        return `${Math.floor(months / 12)}y ago`;
    }
}

module.exports = UserBot;