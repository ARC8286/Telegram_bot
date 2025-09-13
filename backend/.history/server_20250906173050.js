// server.js (or app.js)
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

// Enhanced CORS middleware with better error handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log all incoming requests for debugging
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${origin || 'none'}`);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', corsOptions.methods.join(','));
    res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(','));
    res.header('Access-Control-Max-Age', corsOptions.maxAge);
    
    if (corsOptions.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    return res.status(200).end();
  }
  
  next();
});

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle CORS errors
app.use((err, req, res, next) => {
  if (err.message === 'The CORS policy for this site does not allow access from the specified Origin.') {
    res.status(403).json({
      error: 'CORS Error',
      message: 'Access from your origin is not allowed by CORS policy',
      details: `Origin: ${req.headers.origin} is not whitelisted`
    });
  } else {
    next(err);
  }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/content', contentRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint with CORS explicitly enabled
app.get('/health', cors(corsOptions), (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    cors: 'Enabled'
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

// Enhanced error handling for CORS
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
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
  console.log('🌐 CORS Enabled for origins:', allowedOrigins);
});