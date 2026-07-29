const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');
code = code.replace('style="color: #a855f7;"', '');
fs.writeFileSync('index.html', code, 'utf8');
console.log('Removed hardcoded style');
