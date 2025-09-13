const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const TELEGRAM_CONFIG = require('../config/telegram');

class UserBot {
    constructor() {
        this.botToken = TELEGRAM_CONFIG.BOT_TOKEN;
        this.botUsername = TELEGRAM_CONFIG.BOT_USERNAME;
        
        console.log('UserBot token check:', !!this.botToken);
        
        if (this.botToken) {
            this.bot = new Telegraf(this.botToken);
            this.setupHandlers();
        } else {
            console.warn('BOT_TOKEN not found. User bot functionality disabled.');
        }
    }
    
    start() {
        if (!this.bot) return;
        
        this.bot.launch().then(() => {
            console.log('✅ User Telegram bot started successfully');
        }).catch(err => {
            console.error('❌ Error starting User Telegram bot:', err);
        });
    }
    
    setupHandlers() {
        // Start command with deep link support
        this.bot.start(async (ctx) => {
            let contentId = ctx.startPayload;
            
            console.log('Raw deep link received:', contentId);
            
            // Decode URL encoding if present
            if (contentId) {
                contentId = decodeURIComponent(contentId);
                console.log('Decoded content ID:', contentId);
                
                await this.handleContentRequest(ctx, contentId);
            } else {
                ctx.reply('Welcome to Arcxzone Download Bot! 🤖\n\nThis bot provides access to movies and series. Use the website to browse content.');
            }
        });
        
        // Help command
        this.bot.help((ctx) => {
            ctx.reply('This bot provides download links for Arcxzone content. Simply click on download links from the Arcxzone website to get your content.');
        });
        
        // Callback query handler for series episodes
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            console.log('Callback data received:', data);
            
            if (data.startsWith('season_')) {
                await this.handleSeasonSelection(ctx, data);
            } else if (data.startsWith('episode_')) {
                await this.handleEpisodeSelection(ctx, data);
            }
            
            ctx.answerCbQuery();
        });
    }
    
    async handleContentRequest(ctx, contentId) {
        try {
            console.log('Looking for content with ID:', contentId);
            
            // Check if it's a movie
            const movie = await Content.findOne({ contentId });
            if (movie) {
                console.log('Found movie:', movie.title);
                await this.deliverMovie(ctx, movie);
                return;
            }
            
            // Check if it's an episode
            const episode = await Episode.findOne({ contentId });
            if (episode) {
                console.log('Found episode:', episode.title);
                await this.deliverEpisode(ctx, episode);
                return;
            }
            
            // Check if it's a series - try multiple approaches
            let series = await Series.findOne({ seriesId: contentId });
            
            // If not found, try case-insensitive search
            if (!series) {
                series = await Series.findOne({ 
                    seriesId: { $regex: new RegExp(`^${contentId}$`, 'i') } 
                });
            }
            
            if (series) {
                console.log('Found series:', series.title);
                await this.showSeasonSelection(ctx, series);
                return;
            }
            
            console.log('Content not found for ID:', contentId);
            await ctx.reply('Sorry, the requested content was not found.');
            
        } catch (error) {
            console.error('Error handling content request:', error);
            ctx.reply('An error occurred while processing your request. Please try again.');
        }
    }
    
    async deliverMovie(ctx, movie) {
        try {
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                movie.telegramChannel,
                parseInt(movie.telegramMessageId)
            );
            
            await ctx.reply(`🎬 ${movie.title} (${movie.year})`);
            
            if (movie.description) {
                await ctx.reply(`📝 ${movie.description}`);
            }
            
        } catch (error) {
            console.error('Error delivering movie:', error);
            await ctx.reply('Sorry, I could not retrieve the content. Please try again later.');
        }
    }
    
    async deliverEpisode(ctx, episode) {
        try {
            const season = await Season.findById(episode.season).populate('series');
            
            if (!season || !season.series) {
                return ctx.reply('Error: Could not find series information for this episode.');
            }
            
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                season.series.telegramChannel,
                parseInt(episode.telegramMessageId)
            );
            
            await ctx.reply(`📺 ${season.series.title} - ${season.title} - ${episode.title}`);
            
        } catch (error) {
            console.error('Error delivering episode:', error);
            await ctx.reply('Sorry, I could not retrieve the episode. Please try again later.');
        }
    }
    
    async showSeasonSelection(ctx, series) {
        try {
            console.log('Showing season selection for series:', series.title);
            const seasons = await Season.find({ series: series._id }).sort({ seasonNumber: 1 });
            
            console.log('Found seasons:', seasons.length);
            
            if (!seasons || seasons.length === 0) {
                console.log('No seasons found for series:', series.title);
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
            
            await ctx.reply(`Select a season for ${series.title}:`, {
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Error showing season selection:', error);
            ctx.reply('An error occurred while loading seasons.');
        }
    }
    
    async handleSeasonSelection(ctx, data) {
        try {
            console.log('Handling season selection:', data);
            
            // Fix: Use a better approach to parse the callback data
            // Format: season_{seriesId}_{seasonNumber}
            const parts = data.split('_');
            const seasonNumber = parseInt(parts[parts.length - 1]); // Last part is season number
            const seriesId = parts.slice(1, parts.length - 1).join('_'); // Everything between first and last is seriesId
            
            console.log('Parsed seriesId:', seriesId);
            console.log('Parsed seasonNumber:', seasonNumber);
            
            const series = await Series.findOne({ seriesId });
            if (!series) {
                console.log('Series not found:', seriesId);
                return ctx.editMessageText('Sorry, the requested series was not found.');
            }
            
            const season = await Season.findOne({ 
                series: series._id, 
                seasonNumber: seasonNumber
            });
            
            if (!season) {
                console.log('Season not found:', seasonNumber);
                return ctx.editMessageText('Season not found.');
            }
            
            const episodes = await Episode.find({ season: season._id }).sort({ episodeNumber: 1 });
            
            console.log('Found episodes:', episodes.length);
            
            if (!episodes || episodes.length === 0) {
                return ctx.editMessageText('No episodes found for this season.');
            }
            
            const keyboard = {
                inline_keyboard: episodes.map(episode => ([
                    {
                        text: `E${episode.episodeNumber.toString().padStart(2, '0')} - ${episode.title}`,
                        callback_data: `episode_${episode.contentId}`
                    }
                ]))
            };
            
            await ctx.editMessageText(`Select an episode from ${season.title || 'this season'}:`, {
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Error handling season selection:', error);
            ctx.editMessageText('An error occurred while processing your request.');
        }
    }
    
    async handleEpisodeSelection(ctx, data) {
        try {
            console.log('Handling episode selection:', data);
            
            // Format: episode_{episodeContentId}
            const parts = data.split('_');
            const episodeContentId = parts.slice(1).join('_'); // Everything after "episode_" is the contentId
            
            console.log('Looking for episode with contentId:', episodeContentId);
            
            const episode = await Episode.findOne({ contentId: episodeContentId }).populate({
                path: 'season',
                populate: { path: 'series' }
            });
            
            if (!episode) {
                console.log('Episode not found:', episodeContentId);
                return ctx.editMessageText('Episode not found.');
            }
            
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                episode.season.series.telegramChannel,
                parseInt(episode.telegramMessageId)
            );
            
            await ctx.editMessageText(`✅ Here's your episode: ${episode.season.series.title} - ${episode.season.title} - ${episode.title}`);
            
        } catch (error) {
            console.error('Error handling episode selection:', error);
            ctx.editMessageText('An error occurred while processing your request.');
        }
    }
}

module.exports = UserBot;