const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// The original html is: <span class="nav-brand-name">SWSC<span>.</span>OFFICIAL</span>
code = code.replace(
  '<span class="nav-brand-name">SWSC<span>.</span>OFFICIAL</span>',
  '<span class="nav-brand-name">SWSC<span>.OFFICIAL</span></span>'
);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Brand HTML updated');
