const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const regex = /      <!-- PAGE: CONTACT -->\s*<div class="page-section" id="contact">\s*<div class="block">\s*<div class="block-head"><span class="block-head-title">ช่องทางการติดต่อ<\/span><\/div>[\s\S]*?(?=      <!-- Event Detail Popup \(Global\) -->)/;

const match = code.match(regex);
if (match) {
    code = code.replace(regex, '');
    fs.writeFileSync('index.html', code, 'utf8');
    console.log('Successfully removed duplicate contact section');
} else {
    console.log('Duplicate contact section not found');
}
