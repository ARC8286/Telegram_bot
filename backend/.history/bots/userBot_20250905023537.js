const { Telegraf } = require('telegraf');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
require

class UserBot {
    constructor() {
        this.botToken = process.env.BOT_TOKEN;
        this.botUsername = process.env.BOT_USERNAME;
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
            console.log('User Telegram bot started successfully');
        }).catch(err => {
            console.error('Error starting User Telegram bot:', err);
        });
    }
    
    setupHandlers() {
        // Start command with deep link support
        this.bot.start(async (ctx) => {
            const contentId = ctx.startPayload;
            
            if (contentId) {
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
            // Check if it's a movie
            const movie = await Content.findOne({ contentId });
            if (movie) {
                await this.deliverMovie(ctx, movie);
                return;
            }
            
            // Check if it's an episode
            const episode = await Episode.findOne({ contentId });
            if (episode) {
                await this.deliverEpisode(ctx, episode);
                return;
            }
            
            // Check if it's a series (show season selection)
            const series = await Series.findOne({ seriesId: contentId });
            if (series) {
                await this.showSeasonSelection(ctx, series);
                return;
            }
            
            await ctx.reply('Sorry, the requested content was not found.');
            
        } catch (error) {
            console.error('Error handling content request:', error);
            ctx.reply('An error occurred while processing your request.');
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
            const seasons = await Season.find({ series: series._id }).sort({ seasonNumber: 1 });
            
            if (!seasons || seasons.length === 0) {
                return ctx.reply('No seasons available for this series.');
            }
            
            const keyboard = {
                inline_keyboard: seasons.map(season => ([
                    {
                        text: season.title,
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
            const [, seriesId, seasonNumber] = data.split('_');
            const series = await Series.findOne({ seriesId });
            
            if (!series) {
                return ctx.editMessageText('Sorry, the requested series was not found.');
            }
            
            const season = await Season.findOne({ 
                series: series._id, 
                seasonNumber: parseInt(seasonNumber) 
            });
            
            if (!season) {
                return ctx.editMessageText('Season not found.');
            }
            
            const episodes = await Episode.find({ season: season._id }).sort({ episodeNumber: 1 });
            
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
            
            await ctx.editMessageText(`Select an episode from ${season.title}:`, {
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Error handling season selection:', error);
            ctx.editMessageText('An error occurred while processing your request.');
        }
    }
    
    async handleEpisodeSelection(ctx, data) {
        try {
            const [, episodeId] = data.split('_');
            const episode = await Episode.findOne({ contentId: episodeId }).populate({
                path: 'season',
                populate: { path: 'series' }
            });
            
            if (!episode) {
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