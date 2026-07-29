const fs = require('fs');
const code = fs.readFileSync('index.html', 'utf8');
const start = code.indexOf('id="videoViewer"');
console.log(code.substring(Math.max(0, start - 100), start + 400));
