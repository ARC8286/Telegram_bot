const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if user can upload
const requireUploadAccess = (req, res, next) => {
  if (!req.user || (!req.user.canUpload && !req.user.isAdmin)) {
    return res.status(403).json({ error: 'Upload access required' });
  }
  next();
};

// Check if user is the owner or admin
const requireOwnershipOrAdmin = async (req, res, next) => {
  try {
    const contentId = req.params.contentId || req.params.id;
    
    // Check if it's a movie
    const movie = await Content.findOne({ contentId });
    if (movie) {
      if (req.user.isAdmin || movie.uploadedBy.toString() === req.user.id) {
        return next();
      }
      return res.status(403).json({ error: 'Not authorized to modify this content' });
    }
    
    // Check if it's a series
    const series = await Series.findOne({ seriesId: contentId });
    if (series) {
      if (req.user.isAdmin || series.uploadedBy.toString() === req.user.id) {
        return next();
      }
      return res.status(403).json({ error: 'Not authorized to modify this content' });
    }
    
    res.status(404).json({ error: 'Content not found' });
  } catch (error) {
    console.error('Error in ownership check:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUploadAccess,
  requireOwnershipOrAdmin
};