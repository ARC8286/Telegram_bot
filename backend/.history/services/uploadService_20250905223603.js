const axios = require('axios');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const TELEGRAM_CONFIG = require('../config/telegram');
const { generateContentId, generateSeriesId, generateEpisodeId } = require('../utils/idGenerator');

class UploadService {
  constructor() {
    this.uploadBotToken = TELEGRAM_CONFIG.UPLOAD_BOT_TOKEN;
    this.uploadBaseUrl = `https://api.telegram.org/bot${this.uploadBotToken}`;
    this.uploadQueue = [];
    this.isProcessing = false;
  }

  // Add content to upload queue
  addToUploadQueue(contentId) {
    if (!this.uploadQueue.includes(contentId)) {
      this.uploadQueue.push(contentId);
      console.log(`Added ${contentId} to upload queue. Queue size: ${this.uploadQueue.length}`);
      
      // Start processing if not already processing
      if (!this.isProcessing) {
        this.processUploadQueue();
      }
    }
  }

  // Process upload queue
  async processUploadQueue() {
    if (this.isProcessing || this.uploadQueue.length === 0) {
      setTimeout(() => this.processUploadQueue(), 5000);
      return;
    }
    
    this.isProcessing = true;
    const contentId = this.uploadQueue.shift();
    
    try {
      console.log(`Processing upload for: ${contentId}`);
      
      // Check if this is an episode or main content
      if (contentId.includes('_s') && contentId.includes('_e')) {
        // Episode upload
        const parts = contentId.split('_');
        const mainContentId = parts.slice(0, -2).join('_');
        const seasonNumber = parseInt(parts[parts.length - 2].replace('s', ''));
        const episodeNumber = parseInt(parts[parts.length - 1].replace('e', ''));
        
        await this.uploadEpisode(mainContentId, seasonNumber, episodeNumber);
      } else {
        // Main content upload
        await this.uploadContent(contentId);
      }
    } catch (error) {
      console.error(`Error processing upload for ${contentId}:`, error);
      
      // Update content status to failed
      try {
        if (contentId.includes('_s') && contentId.includes('_e')) {
          const parts = contentId.split('_');
          const mainContentId = parts.slice(0, -2).join('_');
          const seasonNumber = parts[parts.length - 2].replace('s', '');
          const episodeNumber = parts[parts.length - 1].replace('e', '');
          
          const series = await Series.findOne({ seriesId: mainContentId });
          if (series) {
            const season = await Season.findOne({ 
              series: series._id, 
              seasonNumber: parseInt(seasonNumber) 
            });
            
            if (season) {
              const episode = await Episode.findOne({ 
                season: season._id, 
                episodeNumber: parseInt(episodeNumber) 
              });
              
              if (episode) {
                episode.uploadError = error.message;
                await episode.save();
              }
            }
          }
        } else {
          await Content.findOneAndUpdate(
            { contentId },
            { 
              uploadStatus: 'failed',
              uploadError: error.message 
            }
          );
        }
      } catch (updateError) {
        console.error('Error updating failed status:', updateError);
      }
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.processUploadQueue(), 1000);
    }
  }

  // Upload content to channel
  async uploadContent(contentId) {
    const content = await Content.findOne({ contentId });
    
    if (!content) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    if (content.uploadStatus === 'completed') {
      console.log(`Content ${contentId} already uploaded`);
      return;
    }
    
    // Update status to processing
    await Content.findOneAndUpdate(
      { contentId },
      { uploadStatus: 'processing' }
    );
    
    try {
      // Forward file to target channel
      const result = await this.forwardFileToChannel(
        content.fileInfo.fileId,
        content.telegramChannel,
        this.generateCaption(content)
      );
      
      // Update content with message ID
      await Content.findOneAndUpdate(
        { contentId },
        { 
          telegramMessageId: result.message_id.toString(),
          uploadStatus: 'completed',
          uploadError: null
        }
      );
      
      console.log(`Successfully uploaded ${contentId} to channel ${content.telegramChannel}`);
      
    } catch (error) {
      await Content.findOneAndUpdate(
        { contentId },
        { 
          uploadStatus: 'failed',
          uploadError: error.message 
        }
      );
      throw error;
    }
  }

  // Upload episode to channel
  async uploadEpisode(seriesId, seasonNumber, episodeNumber) {
    const series = await Series.findOne({ seriesId });
    
    if (!series) {
      throw new Error(`Series not found: ${seriesId}`);
    }
    
    const season = await Season.findOne({ 
      series: series._id, 
      seasonNumber: parseInt(seasonNumber) 
    });
    
    if (!season) {
      throw new Error(`Season ${seasonNumber} not found for series ${seriesId}`);
    }
    
    const episode = await Episode.findOne({ 
      season: season._id, 
      episodeNumber: parseInt(episodeNumber) 
    });
    
    if (!episode) {
      throw new Error(`Episode ${episodeNumber} not found for season ${seasonNumber}`);
    }
    
    if (episode.telegramMessageId) {
      console.log(`Episode ${seriesId} s${seasonNumber}e${episodeNumber} already uploaded`);
      return;
    }
    
    try {
      // Forward file to target channel
      const result = await this.forwardFileToChannel(
        episode.fileInfo.fileId,
        series.telegramChannel,
        this.generateEpisodeCaption(series, season, episode)
      );
      
      // Update episode with message ID
      episode.telegramMessageId = result.message_id.toString();
      episode.telegramLink = `https://t.me/c/${series.telegramChannel.replace('-100', '')}/${result.message_id}`;
      await episode.save();
      
      console.log(`Successfully uploaded episode ${seriesId} s${seasonNumber}e${episodeNumber} to channel ${series.telegramChannel}`);
      
    } catch (error) {
      episode.uploadError = error.message;
      await episode.save();
      throw error;
    }
  }

  // Forward file to channel
  async forwardFileToChannel(fileId, channelId, caption = '') {
    try {
      // Try sending as document first
      const url = `${this.uploadBaseUrl}/sendDocument`;
      const formData = {
        chat_id: channelId,
        document: fileId,
        caption: caption.substring(0, 1024), // Telegram caption limit
        parse_mode: 'HTML'
      };
      
      const response = await axios.post(url, formData);
      
      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }
      
      return response.data.result;
    } catch (error) {
      console.error('Error forwarding file as document:', error);
      
      // If it's a document sending error, try sending as video
      if (error.response && error.response.data && 
          error.response.data.description.includes('file')) {
        return this.sendVideoToChannel(fileId, channelId, caption);
      }
      
      throw error;
    }
  }

  // Send video to channel
  async sendVideoToChannel(fileId, channelId, caption = '') {
    try {
      const url = `${this.uploadBaseUrl}/sendVideo`;
      const formData = {
        chat_id: channelId,
        video: fileId,
        caption: caption.substring(0, 1024),
        parse_mode: 'HTML',
        supports_streaming: true
      };
      
      const response = await axios.post(url, formData);
      
      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }
      
      return response.data.result;
    } catch (error) {
      console.error('Error sending video to channel:', error);
      throw error;
    }
  }

  // Generate caption for content
  generateCaption(content) {
    let caption = `<b>${content.title}</b> (${content.year})`;
    
    if (content.description) {
      caption += `\n\n${content.description}`;
    }
    
    if (content.genre && content.genre.length > 0) {
      caption += `\n\nGenre: ${content.genre.join(', ')}`;
    }
    
    caption += `\n\nType: ${content.type}`;
    caption += `\nContent ID: ${content.contentId}`;
    caption += `\n\nUploaded via @${TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME}`;
    
    return caption;
  }

  // Generate caption for episode
  generateEpisodeCaption(series, season, episode) {
    let caption = `<b>${series.title}</b> - ${season.title || `Season ${season.seasonNumber}`} - Episode ${episode.episodeNumber}`;
    
    if (episode.title) {
      caption += `: ${episode.title}`;
    }
    
    if (series.description) {
      caption += `\n\n${series.description}`;
    }
    
    if (series.genre && series.genre.length > 0) {
      caption += `\n\nGenre: ${series.genre.join(', ')}`;
    }
    
    caption += `\n\nContent ID: ${episode.contentId}`;
    caption += `\nSeason: ${season.seasonNumber}`;
    caption += `\nEpisode: ${episode.episodeNumber}`;
    caption += `\n\nUploaded via @${TELEGRAM_CONFIG.UPLOAD_BOT_USERNAME}`;
    
    return caption;
  }

  // Get queue status
  getQueueStatus() {
    return {
      queueSize: this.uploadQueue.length,
      processing: this.isProcessing,
      currentUpload: this.isProcessing && this.uploadQueue.length > 0 ? this.uploadQueue[0] : null,
      nextCheck: Date.now() + 5000
    };
  }

  // Test connection to upload bot
  async testConnection() {
    if (!this.uploadBotToken) {
      return false;
    }
    
    try {
      const response = await axios.get(`${this.uploadBaseUrl}/getMe`);
      return response.data.ok;xx
    } catch (error) {
      console.error('Error testing upload bot connection:', error);
      return false;
    }
  }
}

module.exports = new UploadService();