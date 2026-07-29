const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Update getThumbnailUrl
code = code.replace(
    /function getThumbnailUrl\(url\) \{([\s\S]*?)return '\.\/logo\.png';\s*\}/,
    `function getThumbnailUrl(rawUrl) {
    if (!rawUrl) return './logo.png';
    const parts = rawUrl.split('||');
    const url = parts[0];
    const cover = parts.length > 1 ? parts[1] : null;
    
    // If a custom cover image is provided, try to transform it if it's a Google Drive link, otherwise return as is
    if (cover) {
        if (cover.includes('drive.google.com')) {
            const transformed = transformGoogleDriveUrl(cover);
            if (transformed) return transformed;
        }
        return cover;
    }
    
    const ytId = getYouTubeId(url);
    if (ytId) {
      return \`https://img.youtube.com/vi/\${ytId}/hqdefault.jpg\`;
    }
    if (url.includes('drive.google.com')) {
      return transformGoogleDriveUrl(url) || './logo.png';
    }
    return './logo.png';
  }`
);

// 2. Update getEmbedUrl
code = code.replace(
    /function getEmbedUrl\(url\) \{([\s\S]*?)return url;\s*\}/,
    `function getEmbedUrl(rawUrl) {
    if (!rawUrl) return '';
    const parts = rawUrl.split('||');
    const url = parts[0];
    
    const ytId = getYouTubeId(url);
    if (ytId) {
      return \`https://www.youtube.com/embed/\${ytId}?autoplay=1\`;
    }
    if (url.includes('facebook.com')) {
      return \`https://www.facebook.com/plugins/video.php?href=\${encodeURIComponent(url)}&show_text=0&autoplay=1\`;
    }
    if (url.includes('drive.google.com')) {
      const driveId = getGoogleDriveId(url);
      if (driveId) {
        return \`https://drive.google.com/file/d/\${driveId}/preview\`;
      }
    }
    return url;
  }`
);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Successfully updated index.html for Video Cover images');
