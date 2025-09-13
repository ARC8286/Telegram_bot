const express = require('express');
const router = express.Router();
const Content = require('../models/Content');
const Series = require('../models/Series');
const telegramService = require('../services/telegramService');

// Channel name to ID mapping
const getChannelIdFromName = (channelName) => {
  const channelMapping = {
    'MOVIES': process.env.MOVIES_CHANNEL_ID,
    'WEBSERIES': process.env.WEBSERIES_CHANNEL_ID,
    'ANIME': process.env.ANIME_CHANNEL_ID,
    'STORAGE': process.env.STORAGE_CHANNEL_ID,
    'FORCEBOT': process.env.FORCEBOT_CHANNEL_ID,
    'FORCE_BOT': process.env.FORCEBOT_CHANNEL_ID
  };
  return channelMapping[channelName] || channelName;
};

// Verify channel access and bot admin rights
router.get('/verify-channel/:channelName', async (req, res) => {
  try {
    const { channelName } = req.params;
    console.log('Verifying channel access for:', channelName);
    
    const channelId = getChannelIdFromName(channelName);
    
    if (!channelId) {
      return res.status(400).json({ 
        error: 'Invalid channel name',
        availableChannels: ['MOVIES', 'WEBSERIES', 'ANIME', 'STORAGE', 'FORCEBOT'] 
      });
    }
    
    const hasAccess = await telegramService.verifyChannelAccess(channelId);
    const isAdmin = await telegramService.checkBotAdminRights(channelId);
    
    res.json({ 
      hasAccess,
      isAdmin,
      channelId,
      channelName,
      message: hasAccess ? 
        (isAdmin ? 'Channel access verified ✅ (Admin rights)' : 'Channel access verified ⚠️ (No admin rights)') : 
        'Cannot access channel'
    });
    
  } catch (error) {
    console.error('Error verifying channel access:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get channel information
router.get('/channel-info/:channelName', async (req, res) => {
  try {
    const { channelName } = req.params;
    const channelId = getChannelIdFromName(channelName);
    
    const info = await telegramService.getChannelInfo(channelId);
    res.json(info);
  } catch (error) {
    console.error('Error getting channel info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate deep link
router.post('/generate-deep-link', async (req, res) => {
  try {
    const { contentId } = req.body;
    const deepLink = telegramService.generateDeepLink(contentId);
    res.json({ deepLink });
  } catch (error) {
    console.error('Error generating deep link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content by deep link
router.get('/deep-link/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    
    // Check if it's a movie
    const movie = await Content.findOne({ contentId });
    if (movie) {
      const deepLink = telegramService.generateDeepLink(contentId);
      return res.json({ 
        contentId,
        title: movie.title,
        type: movie.type,
        year: movie.year,
        description: movie.description,
        deepLink,
        telegramChannel: movie.telegramChannel
      });
    }
    
    // Check if it's a series
    const series = await Series.findOne({ seriesId: contentId });
    if (series) {
      const deepLink = telegramService.generateDeepLink(contentId);
      return res.json({ 
        contentId,
        title: series.title,
        type: series.type,
        year: series.year,
        description: series.description,
        deepLink,
        telegramChannel: series.telegramChannel
      });
    }
    
    return res.status(404).json({ 
      error: 'Content not found',
      contentId 
    });
    
  } catch (error) {
    console.error('Error getting deep link:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get all available channels
router.get('/channels', async (req, res) => {
  try {
    const channels = [
      { name: 'MOVIES', id: process.env.MOVIES_CHANNEL_ID },
      { name: 'WEBSERIES', id: process.env.WEBSERIES_CHANNEL_ID },
      { name: 'ANIME', id: process.env.ANIME_CHANNEL_ID },
      { name: 'STORAGE', id: process.env.STORAGE_CHANNEL_ID },
      { name: 'FORCEBOT', id: process.env.FORCEBOT_CHANNEL_ID }
    ].filter(channel => channel.id); // Only include channels that have IDs set

    res.json(channels);
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content statistics
router.get('/stats', async (req, res) => {
  try {
    const movieStats = await Content.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          latest: { $max: '$createdAt' }
        }
      }
    ]);
    
    const seriesStats = await Series.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          latest: { $max: '$createdAt' }
        }
      }
    ]);
    
    const totalMovies = await Content.countDocuments();
    const totalSeries = await Series.countDocuments();
    
    res.json({
      totalMovies,
      totalSeries,
      byType: [...movieStats, ...seriesStats],
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;