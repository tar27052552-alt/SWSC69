const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const deadCSS = [
    // These were reported as dead by analyze.cjs and we know they aren't used
    /\.nav-logo\s*\{[^}]+\}/g,
    /\.nav-search\s*\{[^}]+\}/g,
    /\.nav-search-icon\s*\{[^}]+\}/g,
    /\.nav-search-icon:hover\s*\{[^}]+\}/g,
    /\.nav-cta\s*\{[^}]+\}/g,
    /\.nav-cta:hover\s*\{[^}]+\}/g,
    /\.btn-download-pdf\s*\{[^}]+\}/g,
    /\.btn-zoom\s*\{[^}]+\}/g,
    /\.doc-desc\s*\{[^}]+\}/g,
];

let initialLength = code.length;
deadCSS.forEach(regex => {
    code = code.replace(regex, '');
});

// Also remove some empty lines created by this
code = code.replace(/\n\s*\n\s*\n/g, '\n\n');

if (code.length < initialLength) {
    fs.writeFileSync('index.html', code, 'utf8');
    console.log(`Cleaned up dead CSS. Saved ${initialLength - code.length} bytes.`);
} else {
    console.log('No dead CSS found or matched.');
}
