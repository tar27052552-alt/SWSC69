const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const linkOriginal = `padding: 0 6px;`;
const linkNew = `padding: 0 20px;`;
code = code.replace(linkOriginal, linkNew);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Navbar link padding updated');
