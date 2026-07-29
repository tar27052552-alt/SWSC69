const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const neonStart = '/* Neon indicator Navbar */';
const neonEnd = '/* Section Header and Title Accents */';

const startIndex = code.indexOf(neonStart);
if (startIndex !== -1) {
    const endIndex = code.indexOf(neonEnd, startIndex);
    if (endIndex !== -1) {
        code = code.substring(0, startIndex) + code.substring(endIndex);
        fs.writeFileSync('index.html', code, 'utf8');
        console.log('Removed Neon Navbar override');
    }
}
