const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/const GAS_URL = 'https:\/\/script\.google\.com\/macros\/s\/.*\/exec';/, "const GAS_URL = 'https://script.google.com/macros/s/AKfycbzFTrQ6TZvj6PpUAkXJfAU5asvWveVfhUoLMl4LjRAzNSOm4AaImex2NeVHfeHC6gm9/exec';");
fs.writeFileSync('index.html', html, 'utf8');
