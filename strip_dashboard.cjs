const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The file might now have broken syntax because of the partial replace.
// Let's find exactly what's between <div style={{ fontSize: 12, color: '#9e9e9e', textAlign: 'right' }}> ... </div></div> and {/* Check-in Banner */}

// I'll just use a regex to replace everything after the header up to {/* Check-in Banner */}
const regex = /(<div style=\{\{ fontSize: 12, color: '#9e9e9e', textAlign: 'right' \}\}>\s*\{today\.toLocaleDateString\('th-TH', \{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' \}\)\}\s*<\/div>\s*<\/div>).*?(\{\/\* Check-in Banner \*\/\})/s;

content = content.replace(regex, "$1\n\n      $2");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Stripped broken Duty Conflict Alerts from Dashboard.jsx');
