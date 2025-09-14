# Telegram Bot Backend

This is a backend service for managing movies, web series, and anime content via Telegram bots. It supports uploading, editing, and delivering content to users through Telegram channels.

## Features

- Upload movies and series (with seasons and episodes) via Telegram bot
- Manage content (add, edit, delete) with admin permissions
- Deep link support for sharing content
- User roles and permissions
- REST API for content management
- MongoDB for data storage

## Project Structure

```
backend/
├── bots/           # Telegram bot logic
├── config/         # Configuration files
├── middleware/     # Express middlewares
├── models/         # Mongoose models
├── routes/         # API routes
├── services/       # Business logic/services
├── utils/          # Utility functions
├── .env            # Environment variables
├── .gitignore      # Git ignore rules
├── package.json    # Project dependencies
├── server.js       # Express server entrypoint
```

## Setup

1. **Clone the repository**
2. **Install dependencies**
   ```sh
   npm install
   ```
3. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in your values.

4. **Start the server**
   ```sh
   npm start
   ```

## Usage

- Use `/uploadmovie`, `/uploadseries`, `/addseason`, `/addepisode` commands in the Telegram bot to manage content.
- Access REST API endpoints for content management.

## License

MIT
