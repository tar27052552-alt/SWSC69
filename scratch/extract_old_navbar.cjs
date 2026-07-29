const fs = require('fs');
const text = fs.readFileSync('scratch/grep_results.txt', 'utf8');

const jsonMatch = text.match(/^\{.*\}$/m);
if (jsonMatch) {
    const data = JSON.parse(jsonMatch[0]);
    if (data.content) {
        // Find navbar CSS inside data.content
        const lines = data.content.split('\n');
        let inNav = false;
        const navCssLines = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('/* ==================== NAVBAR ==================== */')) {
                inNav = true;
            }
            if (inNav) {
                navCssLines.push(lines[i]);
            }
            if (inNav && lines[i].includes('/* ==================== HERO ==================== */')) {
                break;
            }
        }
        fs.writeFileSync('d:/โปรเจคสภา/scratch/old_navbar_css.txt', navCssLines.join('\n'));
        console.log('Saved to old_navbar_css.txt');
    }
}
