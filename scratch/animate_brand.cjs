const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const originalCss = `.nav-brand-name {
      font-family: 'Oswald', sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--purple-700);
      letter-spacing: .5px;
    }
    .nav-brand-name span { color: var(--gold-500); }`;

const newCss = `.nav-brand-name {
      font-family: 'Oswald', sans-serif;
      font-size: 18px;
      font-weight: 600;
      background: linear-gradient(135deg, var(--purple-600), var(--gold-400), var(--purple-800), var(--gold-500), var(--purple-600));
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: textShine 4s linear infinite;
      letter-spacing: .5px;
    }
    /* Removed span color to allow gradient to flow through */`;

if (code.includes(originalCss)) {
    code = code.replace(originalCss, newCss);
    
    // Also revert HTML so it doesn't need the span for color
    code = code.replace('<span class="nav-brand-name">SWSC<span>.OFFICIAL</span></span>', '<span class="nav-brand-name">SWSC.OFFICIAL</span>');

    fs.writeFileSync('index.html', code, 'utf8');
    console.log('Added animated purple-yellow gradient');
} else {
    console.log('Original CSS not found. Trying flexible replace...');
    
    // Flexible replace
    code = code.replace(/color: var\(--purple-700\);\s*letter-spacing: \.5px;/, 
      `background: linear-gradient(135deg, var(--purple-600), var(--gold-400), var(--purple-800), var(--gold-500), var(--purple-600));
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: textShine 4s linear infinite;
      letter-spacing: .5px;`);
      
    code = code.replace(/\.nav-brand-name span \{ color: var\(--gold-500\); \}/, '');
    code = code.replace('<span class="nav-brand-name">SWSC<span>.OFFICIAL</span></span>', '<span class="nav-brand-name">SWSC.OFFICIAL</span>');
    fs.writeFileSync('index.html', code, 'utf8');
    console.log('Done with flexible replace');
}
