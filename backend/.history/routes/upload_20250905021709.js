const express = require('express');
const router = express.Router();
const uploadService = require('../services/uploadService');
const Content = require('../models/Content');
const Series = require('../models/Series');
const Episode = require('../models/Episode');

// Upload content via API
router.post('/', async (req, res) => {
  try {
    const { title, type, description, year, genre, channel, file, userId } = req.body;
    
    if (!title || !type || !year || !channel || !file) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, type, year, channel, file' 
      });
    }
    
    // For movies
    if (type === 'movie') {
      const contentId = generateContentId(type, title, year);
      
      const contentData = {
        contentId,
        title,
        type,
        description,
        year: parseInt(year),
        genre: Array.isArray(genre) ? genre : (genre || '').split(',').map(g => g.trim()).filter(Boolean),
        telegramChannel: channel,
        fileInfo: {
          fileId: file.fileId,
          fileSize: file.fileSize,
          mimeType: file.mimeType
        },
        uploadStatus: 'pending',
        uploadedBy: userId
      };
      
      const newContent = new Content(contentData);
      await newContent.save();
      
      // Add to upload queue
      uploadService.addToUploadQueue(contentId);
      
      res.json({
        success: true,
        message: 'Movie added to upload queue',
        contentId
      });
    } 
    // For series episodes
    else if (type === 'webseries' || type === 'anime') {
      // This would require additional parameters for series, season, and episode
      res.status(400).json({ 
        error: 'Series upload via API not yet implemented. Use the Telegram bot for series upload.' 
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid content type. Must be movie, webseries, or anime' 
      });
    }
  } catch (error) {
    console.error('Error uploading content:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get upload status
router.get('/status/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    
    // Check if it's a movie
    const content = await Content.findOne({ contentId });
    if (content) {
      return res.json({
        contentId,
        status: content.uploadStatus,
        error: content.uploadError,
        messageId: content.telegramMessageId
      });
    }
    
    // Check if it's an episode
    const episode = await Episode.findOne({ contentId });
    if (episode) {
      return res.json({
        contentId,
        status: episode.telegramMessageId ? 'completed' : 'pending',
        error: episode.uploadError,
        messageId: episode.telegramMessageId
      });
    }
    
    res.status(404).json({ error: 'Content not found' });
  } catch (error) {
    console.error('Error getting upload status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get upload queue status
router.get('/queue/status', async (req, res) => {
  try {
    const queueStatus = uploadService.getQueueStatus();
    res.json(queueStatus);
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;