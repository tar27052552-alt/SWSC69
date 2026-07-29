const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const startStr = 'body.innerHTML = filtered.map(d => `';
const endStr = '`).join(\'\');';

const startIdx = code.indexOf(startStr);
if (startIdx !== -1) {
    const endIdx = code.indexOf(endStr, startIdx);
    if (endIdx !== -1) {
        const fullEndIdx = endIdx + endStr.length;
        
        const newCode = `      const grouped = filtered.reduce((acc, curr) => {
        const existing = acc.find(x => x.title === curr.title);
        if (existing) {
          existing.files.push(curr);
        } else {
          acc.push({ ...curr, files: [curr] });
        }
        return acc;
      }, []);

      body.innerHTML = grouped.map(g => \`
        <div class="doc-list-item" style="cursor: default; display: flex; flex-direction: column; gap: 12px;">
          <div class="doc-list-info">
            <div class="doc-list-title">\${g.title}</div>
            <div class="doc-list-meta">อัปโหลดเมื่อ: \${g.date}</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            \${g.files.map(f => {
              let typeLabel = f.type === 'default' ? 'DOCX' : f.type;
              let bg = typeLabel === 'PDF' ? '#ffebee' : '#e3f2fd';
              let color = typeLabel === 'PDF' ? '#d32f2f' : '#1976d2';
              return \\\`<a href="\\\${f.file_url}" target="_blank" style="text-decoration: none; padding: 6px 14px; border-radius: 8px; background: \\\${bg}; color: \\\${color}; font-size: 13px; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">⬇ \\\${typeLabel}</a>\\\`;
            }).join('')}
          </div>
        </div>
      \`).join('');`;

        code = code.substring(0, startIdx) + newCode + code.substring(fullEndIdx);
        fs.writeFileSync('index.html', code, 'utf8');
        console.log('Replaced successfully');
    } else {
        console.log('End string not found.');
    }
} else {
    console.log('Start string not found.');
}
