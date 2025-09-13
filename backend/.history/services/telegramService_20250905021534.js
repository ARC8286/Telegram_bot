const axios = require('axios');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const TELEGRAM_CONFIG = require('../config/telegram');
const { generateContentId, generateEpisodeId } = require('../utils/idGenerator');

class TelegramService {
  constructor() {
    this.botToken = TELEGRAM_CONFIG.BOT_TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  // Extract message ID from Telegram link
  extractMessageIdFromLink(link) {
    const patterns = [
      /https:\/\/t\.me\/[^/]+\/(\d+)$/,
      /https:\/\/t\.me\/c\/(\d+)\/(\d+)$/,
      /https:\/\/t\.me\/[^/]+\/(\d+)\?.*$/,
    ];
    
    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) {
        return match[match.length - 1];
      }
    }
    
    return null;
  }

  // Generate deep link for bot
  generateDeepLink(contentId) {
    if (!TELEGRAM_CONFIG.BOT_USERNAME) {
      console.error('BOT_USERNAME not found in environment variables');
      return null;
    }
    return `https://t.me/${TELEGRAM_CONFIG.BOT_USERNAME}?start=${contentId}`;
  }

  // Verify bot has access to a channel
  async verifyChannelAccess(channelId) {
    try {
      const response = await axios.get(`${this.baseUrl}/getChat`, {
        params: { chat_id: channelId }
      });
      
      return response.data.ok;
    } catch (error) {
      console.error('Error verifying channel access:', error);
      return false;
    }
  }

  // Check if bot has admin rights in a channel
  async checkBotAdminRights(channelId) {
    try {
      const response = await axios.get(`${this.baseUrl}/getChatMember`, {
        params: {
          chat_id: channelId,
          user_id: TELEGRAM_CONFIG.BOT_USERNAME
        }
      });
      
      if (response.data.ok) {
        const status = response.data.result.status;
        return status === 'administrator' || status === 'creator';
      }
      
      return false;
    } catch (error) {
      console.error('Error checking admin rights:', error);
      return false;
    }
  }

  // Get channel information
  async getChannelInfo(channelId) {
    try {
      const response = await axios.get(`${this.baseUrl}/getChat`, {
        params: { chat_id: channelId }
      });
      
      if (response.data.ok) {
        return {
          id: response.data.result.id,
          title: response.data.result.title,
          type: response.data.result.type,
          username: response.data.result.username,
          description: response.data.result.description
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting channel info:', error);
      return null;
    }
  }

  // Forward message to user
  async forwardMessageToUser(userId, channelId, messageId) {
    try {
      const response = await axios.post(`${this.baseUrl}/forwardMessage`, {
        chat_id: userId,
        from_chat_id: channelId,
        message_id: messageId
      });
      
      return response.data.ok ? response.data.result : null;
    } catch (error) {
      console.error('Error forwarding message:', error);
      return null;
    }
  }

  // Copy message to user (no "forwarded from" tag)
  async copyMessageToUser(userId, channelId, messageId, caption = '') {
    try {
      const response = await axios.post(`${this.baseUrl}/copyMessage`, {
        chat_id: userId,
        from_chat_id: channelId,
        message_id: messageId,
        caption: caption
      });
      
      return response.data.ok ? response.data.result : null;
    } catch (error) {
      console.error('Error copying message:', error);
      return null;
    }
  }

  // Send message to user
  async sendMessage(userId, text, parseMode = 'HTML') {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: userId,
        text: text,
        parse_mode: parseMode
      });
      
      return response.data.ok ? response.data.result : null;
    } catch (error) {
      console.error('Error sending message:', error);
      return null;
    }
  }

  // Parse caption for metadata
  parseCaption(caption) {
    const data = {
      isSeriesEpisode: false
    };
    
    if (!caption) return data;
    
    const lines = caption.split('\n');
    
    // Check if this is a series episode format
    const hasSeriesInfo = lines.some(line => line.toLowerCase().includes('series:'));
    const hasSeasonInfo = lines.some(line => line.toLowerCase().includes('season:'));
    const hasEpisodeInfo = lines.some(line => line.toLowerCase().includes('episode:'));
    
    if (hasSeriesInfo && hasSeasonInfo && hasEpisodeInfo) {
      data.isSeriesEpisode = true;
      
      // Parse series episode format
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length > 1) {
          const key = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(':').trim();
          
          if (key === 'series') {
            data.seriesTitle = value;
          } else if (key === 'season') {
            data.seasonInfo = value;
          } else if (key === 'episode') {
            data.episodeTitle = value;
          } else if (key === 'format') {
            data.format = value;
          } else if (key === 'description') {
            data.description = value;
          } else if (key === 'genre') {
            data.genre = value.split(',').map(g => g.trim());
          }
        }
      });
      
      return data;
    }
    
    // Parse regular movie/series format
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length > 1) {
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();

        if (key === 'genre') {
          data[key] = value.split(',').map(g => g.trim());
        } else {
          data[key] = value;
        }
      }
    });
    
    return data;
  }
}

module.exports = new TelegramService();