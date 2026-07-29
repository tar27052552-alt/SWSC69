const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

if (!code.includes("openDocCategory('ต้นแบบเอกสาร'")) {
    const targetStr = `onclick="openDocCategory('เอกสารโครงการ', 'academic')">`;
    const idx = code.indexOf(targetStr);
    if (idx !== -1) {
        // find the closing </a> for this card
        const closeIdx = code.indexOf('</a>', idx);
        if (closeIdx !== -1) {
            const insertPoint = closeIdx + 4; // after </a>
            const newButton = `
              <a href="javascript:void(0)" class="doc-card" style="padding: 15px;" onclick="openDocCategory('ต้นแบบเอกสาร', 'academic')">
                <div class="doc-icon" style="font-size:24px; margin-bottom:8px;">🗂️</div>
                <div class="doc-title" style="font-size:14px;">ต้นแบบเอกสาร</div>
              </a>`;
            code = code.substring(0, insertPoint) + newButton + code.substring(insertPoint);
            fs.writeFileSync('index.html', code, 'utf8');
            console.log('Button added!');
        } else {
            console.log('</a> not found');
        }
    } else {
        console.log('targetStr not found');
    }
} else {
    console.log('Button already exists');
}
