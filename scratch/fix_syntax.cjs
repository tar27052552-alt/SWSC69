const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const badLine = "return \\`<a href=\"${f.file_url}\" target=\"_blank\" style=\"text-decoration: none; padding: 6px 14px; border-radius: 8px; background: ${bg}; color: ${color}; font-size: 13px; font-weight: 600; transition: all 0.2s;\" onmouseover=\"this.style.opacity='0.8'\" onmouseout=\"this.style.opacity='1'\">⬇ ${typeLabel}</a>\\`;";
const goodLine = "return `<a href=\"${f.file_url}\" target=\"_blank\" style=\"text-decoration: none; padding: 6px 14px; border-radius: 8px; background: ${bg}; color: ${color}; font-size: 13px; font-weight: 600; transition: all 0.2s;\" onmouseover=\"this.style.opacity='0.8'\" onmouseout=\"this.style.opacity='1'\">⬇ ${typeLabel}</a>`;";

if (code.includes(badLine)) {
    code = code.replace(badLine, goodLine);
    fs.writeFileSync('index.html', code, 'utf8');
    console.log('Fixed syntax error!');
} else {
    console.log('Bad line not found!');
}
