const fs = require('fs');
let code = fs.readFileSync('src/pages/ManageVideosPage.jsx', 'utf8');

// Find all indices of 'const handleCoverUpload'
let indices = [];
let idx = code.indexOf('const handleCoverUpload');
while (idx !== -1) {
  indices.push(idx);
  idx = code.indexOf('const handleCoverUpload', idx + 1);
}

if (indices.length > 1) {
  // Keep only the last one, remove the others
  // Actually, we can just completely strip out all handleCoverUpload functions and re-add exactly one!
  
  // The function is async (e) => { ... }
  // We can just regex replace it out, but it's multiline.
  // A safer way: git checkout, then run JUST ONE fix script!
}
