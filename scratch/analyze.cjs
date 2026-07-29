const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// 1. Find all defined CSS classes
const cssClasses = new Set();
const classRegex = /\.([a-zA-Z0-9_-]+)[ \n\r\t\{:\.,>]/g;
let match;

// Get just the style section
const styleSectionMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
if (styleSectionMatch) {
    let cssText = styleSectionMatch[1];
    while ((match = classRegex.exec(cssText)) !== null) {
        // Ignore pseudo-classes, decimals, etc.
        if (match[1] && isNaN(match[1][0])) {
             cssClasses.add(match[1]);
        }
    }
}

// 2. Find all used CSS classes in HTML elements
const usedClasses = new Set();
const htmlClassAttrRegex = /class=["']([^"']+)["']/g;
while ((match = htmlClassAttrRegex.exec(html)) !== null) {
    const classes = match[1].split(/\s+/);
    for (const c of classes) {
        if (c.trim()) usedClasses.add(c.trim());
    }
}

// Check JavaScript classList.add, remove, toggle, contains
const jsClassRegex = /classList\.(?:add|remove|toggle|contains)\(['"]([^"']+)['"]\)/g;
while ((match = jsClassRegex.exec(html)) !== null) {
    usedClasses.add(match[1]);
}

const unusedClasses = [...cssClasses].filter(c => !usedClasses.has(c));
console.log('--- Unused CSS Classes (Possible Dead Code) ---');
console.log('Count:', unusedClasses.length);
if (unusedClasses.length > 0) {
    console.log('Examples (up to 20):', unusedClasses.slice(0, 20).join(', '));
}

// 3. Duplicate ID check
console.log('\n--- Duplicate HTML IDs ---');
const ids = new Set();
const duplicateIds = new Set();
const idAttrRegex = /id=["']([^"']+)["']/g;
while ((match = idAttrRegex.exec(html)) !== null) {
    const id = match[1];
    if (ids.has(id)) {
        duplicateIds.add(id);
    }
    ids.add(id);
}
console.log('Duplicate IDs found:', duplicateIds.size > 0 ? [...duplicateIds].join(', ') : 'None');

// 4. JS Functions Analysis (basic)
console.log('\n--- JS Functions Defined ---');
const jsFunctions = new Set();
const funcDefRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
while ((match = funcDefRegex.exec(html)) !== null) {
    jsFunctions.add(match[1]);
}
console.log('Total functions defined:', jsFunctions.size);

const jsFunctionCalls = new Set();
const funcCallRegex = /([a-zA-Z0-9_$]+)\s*\(/g;
while ((match = funcCallRegex.exec(html)) !== null) {
    const name = match[1];
    if (name !== 'function' && name !== 'catch' && name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch') {
        jsFunctionCalls.add(name);
    }
}

// Also check onclick, onsubmit, etc in HTML
const htmlEventRegex = /on[a-z]+=["']([a-zA-Z0-9_$]+)\s*\(/g;
while ((match = htmlEventRegex.exec(html)) !== null) {
    jsFunctionCalls.add(match[1]);
}

const unusedFunctions = [...jsFunctions].filter(f => !jsFunctionCalls.has(f) && !html.includes(f));
console.log('Unused JS Functions:', unusedFunctions.length > 0 ? unusedFunctions.join(', ') : 'None (or called dynamically)');

