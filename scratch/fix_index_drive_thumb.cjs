const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(/\r\n/g, '\n');

const oldFunc = `function transformGoogleDriveUrl(url) {
    if (!url) return "";
    if (typeof url !== "string") return url;
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("https://lh3.googleusercontent.com/")) {
      return url;
    }
    if (!url.includes("drive.google.com")) {
      return url;
    }
    let match = url.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://lh3.googleusercontent.com/d/\${match[1]}\`;
    }
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://lh3.googleusercontent.com/d/\${match[1]}\`;
    }
    return url;
  }`;

const newFunc = `function transformGoogleDriveUrl(url) {
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
      return \`https://drive.google.com/thumbnail?id=\${match[1]}&sz=w800\`;
    }
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return \`https://drive.google.com/thumbnail?id=\${match[1]}&sz=w800\`;
    }
    return url;
  }`;

if (code.includes(oldFunc)) {
  code = code.replace(oldFunc, newFunc);
  fs.writeFileSync('index.html', code, 'utf8');
  console.log('Fixed transformGoogleDriveUrl for thumbnails!');
} else {
  console.log('Could not find the exact function string.');
}
