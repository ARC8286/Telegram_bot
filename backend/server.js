const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const contentRoutes = require('./routes/content');
const telegramRoutes = require('./routes/telegram');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

const corsOptions = require('./config/cors');
const connectDB = require('./config/database');

// Import bots
const UploadBot = require('./bots/uploadBot');
const UserBot = require('./bots/userBot');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/content', contentRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Initialize bots after DB connection is established
mongoose.connection.once('open', () => {
  console.log('✅ MongoDB connected successfully');
  
  // Initialize bots
  const uploadBot = new UploadBot();
  const userBot = new UserBot();
  
  uploadBot.start();
  userBot.start();
});

console.log('Environment variables check:');
console.log('TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('UPLOAD_BOT_TOKEN exists:', !!process.env.UPLOAD_BOT_TOKEN);
console.log('BOT_USERNAME:', process.env.BOT_USERNAME);
// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🤖 Main Bot: @' + process.env.BOT_USERNAME);
  console.log('📤 Upload Bot: @' + process.env.UPLOAD_BOT_USERNAME);
});