const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  'color: #333333;\n      letter-spacing: .5px;', 
  'color: var(--purple-700);\n      letter-spacing: .5px;'
);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Brand name color updated to purple');
