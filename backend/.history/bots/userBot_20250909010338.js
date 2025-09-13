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
        
        // View content command
        this.bot.command('view', async (ctx) => {
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
        this.bot.command('find', async (ctx) => {
            const searchQuery = ctx.message.text.replace('/find', '').trim();
            
            if (!searchQuery) {
                return ctx.reply('Please provide a search term. Example: /find Avengers');
            }
            
            try {
                // Search for content
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
            } catch (error) {
                console.error('Error finding content:', error);
                await ctx.reply('❌ Error searching for content. Please try again.');
            }
        });
        
        // Callback query handler for series episodes
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            console.log('Callback data received:', data);
            
            // ANSWER THE CALLBACK QUERY IMMEDIATELY to prevent timeout
            await ctx.answerCbQuery();
            
            if (data.startsWith('season_')) {
                await this.handleSeasonSelection(ctx, data);
            }
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
            // Send the movie file ONLY (it already contains all metadata in caption)
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                movie.telegramChannel,
                parseInt(movie.telegramMessageId)
            );
            
            // DO NOT send any additional messages - the file caption already has everything
            
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
            
            // Send the episode file ONLY (it already contains metadata in caption)
            await this.bot.telegram.copyMessage(
                ctx.chat.id,
                season.series.telegramChannel,
                parseInt(episode.telegramMessageId)
            );
            
            // DO NOT send additional messages for episodes either
            
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
            
            // Format: season_{seriesId}_{seasonNumber}
            const parts = data.split('_');
            const seasonNumber = parseInt(parts[parts.length - 1]); // Last part is season number
            const seriesId = parts.slice(1, parts.length - 1).join('_'); // Everything between first and last is seriesId
            
            console.log('Parsed seriesId:', seriesId);
            console.log('Parsed seasonNumber:', seasonNumber);
            
            const series = await Series.findOne({ seriesId });
            if (!series) {
                console.log('Series not found:', seriesId);
                return ctx.reply('Sorry, the requested series was not found.');
            }
            
            const season = await Season.findOne({ 
                series: series._id, 
                seasonNumber: seasonNumber
            });
            
            if (!season) {
                console.log('Season not found:', seasonNumber);
                return ctx.reply('Season not found.');
            }
            
            const episodes = await Episode.find({ season: season._id }).sort({ episodeNumber: 1 });
            
            console.log('Found episodes:', episodes.length);
            
            if (!episodes || episodes.length === 0) {
                return ctx.reply('No episodes found for this season.');
            }
            
            // Send all episodes directly
            await this.sendAllEpisodes(ctx, series, season, episodes);
            
        } catch (error) {
            console.error('Error handling season selection:', error);
            ctx.reply('An error occurred while processing your request.');
        }
    }
    
    async sendAllEpisodes(ctx, series, season, episodes) {
        try {
            // First, send series and season information
            let infoMessage = `📺 <b>${series.title}</b>`;
            
            if (series.year) {
                infoMessage += ` (${series.year})`;
            }
            
            infoMessage += `\n${season.title || `Season ${season.seasonNumber}`}`;
            
            if (series.description) {
                infoMessage += `\n\n${series.description}`;
            }
            
            if (series.genre && series.genre.length > 0) {
                infoMessage += `\n\n<b>Genre:</b> ${series.genre.join(', ')}`;
            }
            
            infoMessage += `\n\n<b>Episodes:</b> ${episodes.length}`;
            
            // Edit the original message to show series info
            try {
                await ctx.editMessageText(infoMessage, { parse_mode: 'HTML' });
            } catch (editError) {
                // If editing fails (message too old), send a new message
                console.log('Could not edit message, sending new one:', editError.message);
                await ctx.reply(infoMessage, { parse_mode: 'HTML' });
            }
            
            // Send a small delay message
            await ctx.reply('⏳ Sending episodes...');
            
            // Send each episode one by one (episode files already contain metadata)
            for (const episode of episodes) {
                try {
                    await this.bot.telegram.copyMessage(
                        ctx.chat.id,
                        series.telegramChannel,
                        parseInt(episode.telegramMessageId)
                    );
                    
                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`Error sending episode ${episode.episodeNumber}:`, error);
                    await ctx.reply(`❌ Failed to send episode ${episode.episodeNumber}`);
                }
            }
            
            // Send completion message
            await ctx.reply(`✅ All ${episodes.length} episodes sent! Enjoy watching ${series.title} 🎬`);
            
        } catch (error) {
            console.error('Error sending all episodes:', error);
            await ctx.reply('❌ An error occurred while sending episodes. Please try again.');
        }
    }
}

module.exports = UserBot;