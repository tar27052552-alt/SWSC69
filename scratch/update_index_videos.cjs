const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Add formatDate function inside the JS block before renderVideos
const formatThaiDateFunc = `
  function formatThaiDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return \`\${date.getDate()} \${months[date.getMonth()]} \${date.getFullYear() + 543}\`;
  }
`;

if (!code.includes('function formatThaiDate')) {
    code = code.replace(/function renderVideos\(items\) \{/, formatThaiDateFunc + '\n  function renderVideos(items) {');
}

// 2. Update renderVideos HTML string
const oldHtml = `          <div class="video-info">
            <div class="video-title">\${item.title}</div>
            <div class="video-desc">\${item.description || ''}</div>
          </div>`;

const newHtml = `          <div class="video-info">
            <div class="video-date" style="font-size: 12px; color: var(--gold-500); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              📅 \${formatThaiDate(item.created_at)}
            </div>
            <div class="video-title">\${item.title}</div>
            <div class="video-desc">\${item.description || ''}</div>
          </div>`;

code = code.replace(oldHtml, newHtml);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Successfully updated index.html for video dates');
