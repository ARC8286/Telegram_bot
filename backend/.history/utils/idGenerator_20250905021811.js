function generateContentId(type, title, year) {
    const prefix = type === 'movie' ? 'mo' : (type === 'webseries' ? 'ws' : 'an');
    const cleanTitle = title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().substring(0, 15);
    const timestamp = Date.now().toString().slice(-5);
    return `${prefix}_${cleanTitle}_${year}_${timestamp}`;
}

function generateSeriesId(type, title, year) {
    const prefix = type === 'webseries' ? 'ws' : 'an';
    const cleanTitle = title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().substring(0, 15);
    const timestamp = Date.now().toString().slice(-5);
    return `${prefix}_${cleanTitle}_${year}_${timestamp}`;
}

function generateEpisodeId(seriesId, seasonNumber, episodeNumber) {
    return `${seriesId}_s${seasonNumber.toString().padStart(2, '0')}e${episodeNumber.toString().padStart(2, '0')}`;
}

module.exports = {
    generateContentId,
    generateSeriesId,
    generateEpisodeId
};