const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Grant upload permissions to a user
router.post('/users/:userId/grant-upload', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { canUpload: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Upload permissions granted',
      user 
    });
  } catch (error) {
    console.error('Error granting upload permissions:', error);
    res.status(500).json({ success: false, error: 'Failed to grant permissions' });
  }
});

// Revoke upload permissions from a user
router.post('/users/:userId/revoke-upload', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { canUpload: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Upload permissions revoked',
      user 
    });
  } catch (error) {
    console.error('Error revoking upload permissions:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke permissions' });
  }
});

// Make user admin
router.post('/users/:userId/make-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { isAdmin: true, canUpload: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'User promoted to admin',
      user 
    });
  } catch (error) {
    console.error('Error making user admin:', error);
    res.status(500).json({ success: false, error: 'Failed to promote user' });
  }
});

// Remove admin privileges
router.post('/users/:userId/remove-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { isAdmin: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Admin privileges removed',
      user 
    });
  } catch (error) {
    console.error('Error removing admin privileges:', error);
    res.status(500).json({ success: false, error: 'Failed to remove admin privileges' });
  }
});

module.exports = router;