// config/cors.js
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000', 
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://yourdomain.com',
  'https://www.yourdomain.com',
  'https://arcxzone.com',
  'https://www.arcxzone.com'
];

// Add Vite development server origins (common ports)
for (let port = 5173; port <= 5180; port++) {
  allowedOrigins.push(`http://localhost:${port}`);
  allowedOrigins.push(`http://127.0.0.1:${port}`);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Allow subdomains of your main domains
    const originRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)?(yourdomain\.com|arcxzone\.com)(:\d+)?$/;
    const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    
    if (allowedOrigins.indexOf(origin) !== -1 || originRegex.test(origin) || localhostRegex.test(origin)) {
      return callback(null, true);
    } else {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      console.log('CORS blocked origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      return callback(new Error(msg), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-access-token',
    'x-api-key'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

module.exports = corsOptions;