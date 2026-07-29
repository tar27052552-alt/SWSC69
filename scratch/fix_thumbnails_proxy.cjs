const fs = require('fs');

// 1. Fix index.html
let indexCode = fs.readFileSync('index.html', 'utf8');
indexCode = indexCode.replace(/\r\n/g, '\n');

const oldIndexFunc = `function transformGoogleDriveUrl(url) {
    if (!url) return "";
    if (typeof url !== "string") return url;
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("https://lh3.googleusercontent.com/")) {
      return url;
    }
    if (!url.includes("drive.google.com")) {
      return url;
    }
    
    // Fallback: Using thumbnail API which is more reliable for Drive images than lh3 in 2024
    let match = url.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://drive.google.com/uc?export=view&id=\${match[1]}\`;
    }
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://drive.google.com/uc?export=view&id=\${match[1]}\`;
    }
    return url;
  }`;

const newIndexFunc = `function transformGoogleDriveUrl(url) {
    if (!url) return "";
    if (typeof url !== "string") return url;
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("https://wsrv.nl/")) {
      return url;
    }
    if (!url.includes("drive.google.com")) {
      return url;
    }
    
    // Using wsrv.nl proxy to bypass Safari/Chrome cross-site cookie blocking for Google Drive
    let match = url.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://wsrv.nl/?url=\${encodeURIComponent('https://drive.google.com/uc?export=view&id=' + match[1])}\`;
    }
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://wsrv.nl/?url=\${encodeURIComponent('https://drive.google.com/uc?export=view&id=' + match[1])}\`;
    }
    return url;
  }`;

if (indexCode.includes(oldIndexFunc)) {
  indexCode = indexCode.replace(oldIndexFunc, newIndexFunc);
  fs.writeFileSync('index.html', indexCode, 'utf8');
  console.log('Fixed index.html!');
} else {
  console.log('Could not find oldIndexFunc in index.html');
}

// 2. Fix ManageVideosPage.jsx
let jsxCode = fs.readFileSync('src/pages/ManageVideosPage.jsx', 'utf8');
jsxCode = jsxCode.replace(/\r\n/g, '\n');

const oldJsxFunc = `  const getThumbnailUrl = (url) => {
    const ytId = getYouTubeId(url);
    if (ytId) {
      return \`https://img.youtube.com/vi/\${ytId}/hqdefault.jpg\`;
    }
    return ''; // Return empty so it falls back to a placeholder
  };`;

const newJsxFunc = `  const getThumbnailUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const parts = rawUrl.split('||');
    const url = parts[0];
    const cover = parts.length > 1 ? parts[1] : null;
    
    if (cover) {
        let match = cover.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
        if (!match) match = cover.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return \`https://wsrv.nl/?url=\${encodeURIComponent('https://drive.google.com/uc?export=view&id=' + match[1])}\`;
        }
        return cover;
    }

    const ytId = getYouTubeId(url);
    if (ytId) {
      return \`https://img.youtube.com/vi/\${ytId}/hqdefault.jpg\`;
    }
    return '';
  };`;

if (jsxCode.includes(oldJsxFunc)) {
  jsxCode = jsxCode.replace(oldJsxFunc, newJsxFunc);
  fs.writeFileSync('src/pages/ManageVideosPage.jsx', jsxCode, 'utf8');
  console.log('Fixed ManageVideosPage.jsx!');
} else {
  console.log('Could not find oldJsxFunc in ManageVideosPage.jsx');
}
