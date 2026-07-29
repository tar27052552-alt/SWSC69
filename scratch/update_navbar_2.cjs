const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace('background: #3a3a3a;', 'background: #3a3a3a;');
code = code.replace('border-bottom: 2px solid #5b3a6e;', 'border-bottom: 1px solid #222;');

fs.writeFileSync('index.html', code, 'utf8');
console.log('Navbar border-bottom reverted');
