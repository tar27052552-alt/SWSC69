const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Change navbar background
code = code.replace('background: #111111;', 'background: #3a3a3a;');
code = code.replace('border-bottom: 1px solid #333;', 'border-bottom: 2px solid #5b3a6e;');

// Add borders to nav items
const navItemCssOriginal = `.nav-item {
      position: relative;
      height: 100%;
      display: flex;
      align-items: center;
    }`;
const navItemCssNew = `.nav-item {
      position: relative;
      height: 100%;
      display: flex;
      align-items: center;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }
    .nav-item:first-child {
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }`;
code = code.replace(navItemCssOriginal, navItemCssNew);

// Adjust nav-brand to space it out from the border
const navBrandOriginal = `.nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }`;
const navBrandNew = `.nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      padding-right: 20px;
    }`;
code = code.replace(navBrandOriginal, navBrandNew);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Navbar updated');
