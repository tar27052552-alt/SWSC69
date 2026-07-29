const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace('.nav-search-icon {', '.nav-search-icon {\n      background: #f4f4f5;');
code = code.replace('.nav-search-icon:hover { color: #fff; background: #333; }', '.nav-search-icon:hover { color: #222; background: #e4e4e7; }');

// Also need to make sure the background of `nav` is actually #ffffff!
// It might not have replaced #3a3a3a if the `replace_file_content` hallucinated.
// Let's check `nav {`
if (code.includes('background: #3a3a3a;')) {
    code = code.replace('background: #3a3a3a;', 'background: #ffffff;');
}
if (code.includes('border-bottom: 1px solid #222;')) {
    code = code.replace('border-bottom: 1px solid #222;', 'border-bottom: 1px solid #eaeaea;');
}

fs.writeFileSync('index.html', code, 'utf8');
console.log('Fixed nav-search-icon and nav background');
