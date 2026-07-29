const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');

console.log('--- Duplicate IDs Check ---');
lines.forEach((line, i) => {
    if (line.includes('id="contact"')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
});

console.log('\n--- Script Size ---');
const scriptStarts = [];
const scriptEnds = [];
lines.forEach((line, i) => {
    if (line.includes('<script>')) scriptStarts.push(i);
    if (line.includes('</script>')) scriptEnds.push(i);
});
scriptStarts.forEach((start, idx) => {
    const end = scriptEnds[idx];
    if (end) {
        console.log(`Script block ${idx + 1}: ${end - start} lines`);
    }
});

console.log('\n--- Broken Internal Links ---');
const definedIds = new Set();
const idAttrRegex = /id=["']([^"']+)["']/g;
let match;
while ((match = idAttrRegex.exec(html)) !== null) {
    definedIds.add(match[1]);
}
const hashLinks = new Set();
const hrefRegex = /href=["']#\/([^"']+)["']/g;
while ((match = hrefRegex.exec(html)) !== null) {
    hashLinks.add(match[1]); // The hash router might not use HTML IDs, but let's check
}
console.log('Hash routes found:', [...hashLinks].join(', '));

const idLinks = new Set();
const idHrefRegex = /href=["']#([^"'/]+)["']/g; // Just #id
while ((match = idHrefRegex.exec(html)) !== null) {
    if (!definedIds.has(match[1])) {
        idLinks.add(match[1]);
    }
}
console.log('Broken #id links:', [...idLinks].join(', '));

