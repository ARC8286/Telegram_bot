const express = require('express');
const router = express.Router();
const Content = require('../models/Content');
const Series = require('../models/Series');
const Season = require('../models/Season');
const Episode = require('../models/Episode');
const telegramService = require('../services/telegramService');
const { generateContentId, generateSeriesId, generateEpisodeId } = require('../utils/idGenerator');

// Get all content with pagination
router.get('/', async (req, res) => {
  try {
    const { type, page = 1, limit = 10, search } = req.query;
    
    let query = {};
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };
    
    const content = await Content.find(query)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort);
    
    const total = await Content.countDocuments(query);
    
    res.json({
      success: true,
      content,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch content' 
    });
  }
});

// Add new movie content
router.post('/movie', async (req, res) => {
  try {
    const { title, description, year, genre, telegramLink, telegramChannel } = req.body;

    if (!title || !year || !telegramChannel) {
      return res.status(400).json({ success: false, error: 'Missing required fields: title, year, telegramChannel' });
    }

    const contentId = generateContentId('movie', title, year);
    let telegramMessageId = null;

    if (telegramLink) {
      telegramMessageId = telegramService.extractMessageIdFromLink(telegramLink);
      if (!telegramMessageId) {
        return res.status(400).json({ success: false, error: 'Invalid Telegram link format' });
      }
    }

    let genreArray = Array.isArray(genre) ? genre : (genre || '').split(',').map(g => g.trim()).filter(Boolean);

    const newContent = new Content({
      contentId,
      title,
      type: 'movie',
      description,
      year: parseInt(year),
      genre: genreArray,
      telegramMessageId,
      telegramChannel,
      uploadStatus: telegramMessageId ? 'completed' : 'pending'
    });

    await newContent.save();

    const botDeepLink = telegramService.generateDeepLink(contentId);

    res.status(201).json({
      success: true,
      message: 'Movie added successfully',
      content: newContent,
      botDeepLink
    });

  } catch (error) {
    console.error('Error adding movie:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Content with this ID already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to add movie' });
  }
});

// Create series with multiple seasons and episodes
router.post('/series', async (req, res) => {
  try {
    const { title, type, description, year, genre, telegramChannel, seasons } = req.body;

    if (!title || !type || !year || !telegramChannel || !seasons || !Array.isArray(seasons)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!['webseries', 'anime'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be webseries or anime for series' });
    }

    const seriesId = generateSeriesId(type, title, year);
    let genreArray = Array.isArray(genre) ? genre : (genre || '').split(',').map(g => g.trim()).filter(Boolean);

    // Create series
    const newSeries = new Series({
      seriesId,
      title,
      type,
      description,
      year: parseInt(year),
      genre: genreArray,
      telegramChannel
    });

    await newSeries.save();

    // Create seasons and episodes
    for (const seasonData of seasons) {
      const season = new Season({
        seasonNumber: seasonData.seasonNumber,
        title: seasonData.title || `Season ${seasonData.seasonNumber}`,
        series: newSeries._id
      });

      await season.save();

      // Add season to series
      newSeries.seasons.push(season._id);

      // Create episodes
      for (const episodeData of seasonData.episodes) {
        const episodeContentId = generateEpisodeId(seriesId, seasonData.seasonNumber, episodeData.episodeNumber);
        
        const episode = new Episode({
          episodeNumber: episodeData.episodeNumber,
          title: episodeData.title || `Episode ${episodeData.episodeNumber}`,
          season: season._id,
          telegramMessageId: episodeData.telegramMessageId,
          telegramLink: episodeData.telegramLink,
          contentId: episodeContentId
        });

        await episode.save();
        season.episodes.push(episode._id);
      }

      await season.save();
    }

    await newSeries.save();

    const botDeepLink = telegramService.generateDeepLink(seriesId);

    res.status(201).json({
      success: true,
      message: 'Series created successfully',
      series: newSeries,
      botDeepLink
    });

  } catch (error) {
    console.error('Error creating series:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Series with this ID already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to create series' });
  }
});

// Add season to series
router.post('/series/:seriesId/season', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { seasonNumber, title } = req.body;
    
    const series = await Series.findOne({ seriesId });
    if (!series) {
      return res.status(404).json({ 
        success: false,
        error: 'Series not found' 
      });
    }
    
    // Check if season already exists
    const existingSeason = await Season.findOne({ 
      series: series._id, 
      seasonNumber: parseInt(seasonNumber) 
    });
    
    if (existingSeason) {
      return res.status(400).json({ 
        success: false,
        error: 'Season already exists' 
      });
    }
    
    const season = new Season({
      seasonNumber: parseInt(seasonNumber),
      title: title || `Season ${seasonNumber}`,
      series: series._id
    });
    
    await season.save();
    
    // Add season to series
    series.seasons.push(season._id);
    await series.save();
    
    res.json({ 
      success: true,
      message: 'Season added successfully',
      season 
    });
    
  } catch (error) {
    console.error('Error adding season:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add season' 
    });
  }
});

// Add episode to season
router.post('/series/:seriesId/season/:seasonNumber/episode', async (req, res) => {
  try {
    const { seriesId, seasonNumber } = req.params;
    const { episodeNumber, title, telegramLink } = req.body;
    
    const series = await Series.findOne({ seriesId });
    if (!series) {
      return res.status(404).json({ 
        success: false,
        error: 'Series not found' 
      });
    }
    
    const season = await Season.findOne({ 
      series: series._id, 
      seasonNumber: parseInt(seasonNumber) 
    });
    
    if (!season) {
      return res.status(404).json({ 
        success: false,
        error: 'Season not found' 
      });
    }
    
    // Extract message ID from Telegram link
    const telegramMessageId = telegramService.extractMessageIdFromLink(telegramLink);
    if (!telegramMessageId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid Telegram link format' 
      });
    }
    
    // Check if episode already exists
    const existingEpisode = await Episode.findOne({ 
      season: season._id, 
      episodeNumber: parseInt(episodeNumber) 
    });
    
    if (existingEpisode) {
      return res.status(400).json({ 
        success: false,
        error: 'Episode already exists' 
      });
    }
    
    // Generate episode content ID
    const episodeContentId = generateEpisodeId(seriesId, seasonNumber, episodeNumber);
    
    const episode = new Episode({
      episodeNumber: parseInt(episodeNumber),
      title: title || `Episode ${episodeNumber}`,
      season: season._id,
      telegramMessageId,
      telegramLink,
      contentId: episodeContentId
    });
    
    await episode.save();
    
    // Add episode to season
    season.episodes.push(episode._id);
    await season.save();
    
    const botDeepLink = telegramService.generateDeepLink(episodeContentId);
    
    res.json({ 
      success: true,
      message: 'Episode added successfully',
      episode,
      botDeepLink
    });
    
  } catch (error) {
    console.error('Error adding episode:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add episode' 
    });
  }
});

// Get content by ID
router.get('/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    
    // Check if it's a movie
    const movie = await Content.findOne({ contentId });
    if (movie) {
      return res.json({ 
        success: true,
        type: 'movie',
        content: movie 
      });
    }
    
    // Check if it's a series
    const series = await Series.findOne({ seriesId: contentId }).populate('seasons');
    if (series) {
      return res.json({ 
        success: true,
        type: 'series',
        content: series 
      });
    }
    
    // Check if it's an episode
    const episode = await Episode.findOne({ contentId }).populate({
      path: 'season',
      populate: { path: 'series' }
    });
    
    if (episode) {
      return res.json({ 
        success: true,
        type: 'episode',
        content: episode 
      });
    }
    
    return res.status(404).json({ 
      success: false,
      error: 'Content not found' 
    });
    
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch content' 
    });
  }
});

// Delete content
router.delete('/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    
    // Check if it's a movie
    const movie = await Content.findOneAndDelete({ contentId });
    if (movie) {
      return res.json({ 
        success: true,
        message: 'Movie deleted successfully' 
      });
    }
    
    // Check if it's a series
    const series = await Series.findOne({ seriesId: contentId });
    if (series) {
      // Delete all seasons and episodes
      await Season.deleteMany({ series: series._id });
      await Episode.deleteMany({ season: { $in: series.seasons } });
      await Series.findByIdAndDelete(series._id);
      
      return res.json({ 
        success: true,
        message: 'Series and all associated seasons/episodes deleted successfully' 
      });
    }
    
    // Check if it's an episode
    const episode = await Episode.findOneAndDelete({ contentId });
    if (episode) {
      // Remove episode from season
      await Season.findByIdAndUpdate(
        episode.season,
        { $pull: { episodes: episode._id } }
      );
      
      return res.json({ 
        success: true,
        message: 'Episode deleted successfully' 
      });
    }
    
    return res.status(404).json({ 
      success: false,
      error: 'Content not found' 
    });
    
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete content' 
    });
  }
});

// Get episodes for a specific season
router.get('/series/:seriesId/season/:seasonNumber', async (req, res) => {
  try {
    const { seriesId, seasonNumber } = req.params;
    
    const series = await Series.findOne({ seriesId });
    if (!series) {
      return res.status(404).json({ 
        success: false,
        error: 'Series not found' 
      });
    }
    
    const season = await Season.findOne({ 
      series: series._id, 
      seasonNumber: parseInt(seasonNumber) 
    }).populate('episodes');
    
    if (!season) {
      return res.status(404).json({ 
        success: false,
        error: 'Season not found' 
      });
    }
    
    res.json({ 
      success: true,
      season 
    });
    
  } catch (error) {
    console.error('Error fetching season:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch season' 
    });
  }
});

module.exports = router;