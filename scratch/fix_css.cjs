const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// The botched replace left:
//       padding: 0 40px;
//       transition: box-shadow .3s var(--ease);
//     }
//       letter-spacing: .5px;
//     }
//     
//     .nav-all-logos {

const badBlock = `      padding: 0 40px;
      transition: box-shadow .3s var(--ease);
    }
      letter-spacing: .5px;
    }
    
    .nav-all-logos {`;

const goodBlock = `      padding: 0 40px;
      transition: box-shadow .3s var(--ease);
    }
    nav.scrolled { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .nav-logo { width: 38px; height: 38px; object-fit: contain; }
    .nav-brand-name {
      font-family: 'Oswald', sans-serif;
      font-size: 18px;
      font-weight: 600;
      background: linear-gradient(135deg, var(--purple-600), var(--gold-400), var(--purple-700), var(--gold-500), var(--purple-600));
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: textShine 4s linear infinite;
      letter-spacing: .5px;
    }
    
    .nav-all-logos {`;

code = code.replace(badBlock, goodBlock);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Fixed botched replace and added gradient');
