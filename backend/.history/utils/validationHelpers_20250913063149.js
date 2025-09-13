/**
 * Utility functions for validation and formatting
 */

/**
 * Format file size from bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate year input
 * @param {string|number} year - Year to validate
 * @returns {boolean} True if valid year
 */
function validateYear(year) {
    const currentYear = new Date().getFullYear();
    const yearNum = parseInt(year);
    
    return !isNaN(yearNum) && 
           yearNum >= 1900 && 
           yearNum <= currentYear + 5; // Allow up to 5 years in future
}

/**
 * Validate and parse genres input
 * @param {string} genresString - Comma-separated genres string
 * @returns {Array|null} Array of genres or null if invalid
 */
function validateGenres(genresString) {
    if (!genresString || typeof genresString !== 'string') {
        return null;
    }
    
    // Split by comma and trim each genre
    const genres = genresString.split(',')
        .map(genre => genre.trim())
        .filter(genre => genre.length > 0);
    
    // Check if we have at least one valid genre
    if (genres.length === 0) {
        return null;
    }
    
    return genres;
}

/**
 * Validate content ID format
 * @param {string} contentId - Content ID to validate
 * @returns {boolean} True if valid content ID format
 */
function validateContentId(contentId) {
    // Basic validation - content IDs should be alphanumeric with possible underscores
    const contentIdRegex = /^[a-zA-Z0-9_-]+$/;
    return contentIdRegex.test(contentId) && contentId.length >= 3 && contentId.length <= 50;
}

/**
 * Validate series ID format
 * @param {string} seriesId - Series ID to validate
 * @returns {boolean} True if valid series ID format
 */
function validateSeriesId(seriesId) {
    // Series IDs typically follow pattern: type-title-year or similar
    const seriesIdRegex = /^[a-zA-Z0-9_-]+$/;
    return seriesIdRegex.test(seriesId) && seriesId.length >= 5 && seriesId.length <= 60;
}

/**
 * Validate episode number
 * @param {string|number} episodeNumber - Episode number to validate
 * @returns {boolean} True if valid episode number
 */
function validateEpisodeNumber(episodeNumber) {
    const num = parseInt(episodeNumber);
    return !isNaN(num) && num >= 1 && num <= 1000; // Reasonable upper limit
}

/**
 * Validate season number
 * @param {string|number} seasonNumber - Season number to validate
 * @returns {boolean} True if valid season number
 */
function validateSeasonNumber(seasonNumber) {
    const num = parseInt(seasonNumber);
    return !isNaN(num) && num >= 1 && num <= 50; // Reasonable upper limit
}

/**
 * Validate title (basic validation)
 * @param {string} title - Title to validate
 * @returns {boolean} True if valid title
 */
function validateTitle(title) {
    return typeof title === 'string' && 
           title.trim().length >= 1 && 
           title.trim().length <= 200;
}

/**
 * Validate description (basic validation)
 * @param {string} description - Description to validate
 * @returns {boolean} True if valid description
 */
function validateDescription(description) {
    return typeof description === 'string' && 
           description.length <= 1000; // Reasonable length limit
}

/**
 * Sanitize user input to prevent injection attacks
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    // Remove or escape potentially dangerous characters
    return input
        .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
        .replace(/[&]/g, '&amp;') // Escape ampersand
        .replace(/["]/g, '&quot;') // Escape double quotes
        .replace(/[']/g, '&#x27;') // Escape single quotes
        .replace(/[\/]/g, '&#x2F;') // Escape forward slash
        .trim();
}

/**
 * Check if a string is a valid Telegram channel ID
 * @param {string} channelId - Channel ID to validate
 * @returns {boolean} True if valid Telegram channel ID format
 */
function isValidChannelId(channelId) {
    // Telegram channel IDs typically start with -100 followed by numbers
    const channelIdRegex = /^-100\d+$/;
    return channelIdRegex.test(channelId);
}

/**
 * Validate file type based on MIME type or file extension
 * @param {string} fileName - File name to validate
 * @param {string} mimeType - MIME type (optional)
 * @returns {boolean} True if valid file type
 */
function validateFileType(fileName, mimeType = '') {
    const allowedVideoTypes = [
        'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv',
        'video/x-matroska', 'video/webm', 'video/3gpp'
    ];
    
    const allowedDocumentTypes = [
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
    ];
    
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const allowedExtensions = ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', '3gp', 'zip', 'rar', '7z'];
    
    // Check by MIME type if available
    if (mimeType) {
        return allowedVideoTypes.includes(mimeType) || allowedDocumentTypes.includes(mimeType);
    }
    
    // Fall back to file extension check
    return allowedExtensions.includes(fileExtension);
}

/**
 * Generate a random temporary ID for operations
 * @returns {string} Random ID
 */
function generateTempId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    formatFileSize,
    validateYear,
    validateGenres,
    validateContentId,
    validateSeriesId,
    validateEpisodeNumber,
    validateSeasonNumber,
    validateTitle,
    validateDescription,
    sanitizeInput,
    isValidChannelId,
    validateFileType,
    generateTempId,
    delay
};