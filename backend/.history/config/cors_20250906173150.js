const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000', 
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://yourdomain.com',
  'https://www.yourdomain.com',
  'https://arcxzone.com',
  'https://www.arcxzone.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Allow subdomains of your main domain
    const originRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)?(yourdomain\.com|arcxzone\.com)$/;
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  maxAge: 86400
};

module.exports = corsOptions;