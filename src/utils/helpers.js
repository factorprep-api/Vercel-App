// Video URL utilities - shared across components

/**
 * Extract YouTube video ID from various URL formats
 * @param {string} url - YouTube URL or embed link
 * @returns {string|null} - 11-character video ID or null
 */
export function getYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|v\/|vi=|vi\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Normalize video URLs for direct playback
 * @param {string} rawUrl - Raw video URL
 * @returns {string} - Normalized URL with protocol and .mp4 extension if needed
 */
export function normalizeVideoUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl);
  if (!url.startsWith('http')) url = 'https://' + url;
  if (url.includes('b-cdn.net') && !url.toLowerCase().endsWith('.mp4')) url += '.mp4';
  return url;
}
