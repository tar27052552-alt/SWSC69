const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace('border-radius: 50%;\n    .nav-search-icon:hover', 'border-radius: 50%;\n    }\n    .nav-search-icon:hover');

// Also do it for \r\n just in case
code = code.replace('border-radius: 50%;\r\n    .nav-search-icon:hover', 'border-radius: 50%;\r\n    }\r\n    .nav-search-icon:hover');

fs.writeFileSync('index.html', code, 'utf8');
console.log('Fixed missing brace');
