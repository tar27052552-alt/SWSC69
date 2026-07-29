const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Change navbar background
code = code.replace('background: #3a3a3a;', 'background: #ffffff;');
code = code.replace('background: #111111;', 'background: #ffffff;');

code = code.replace('border-bottom: 1px solid #222;', 'border-bottom: 1px solid #eaeaea;');
code = code.replace('border-bottom: 1px solid #333;', 'border-bottom: 1px solid #eaeaea;');

// Change brand name color
code = code.replace('color: #fff;', 'color: #333;'); // Be careful with this, it might replace others.
// Let's use more specific replacements.
