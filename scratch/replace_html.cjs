const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const gridBtnOld = `<a href="javascript:void(0)" class="doc-card" style="padding: 15px;" onclick="openDocCategory('เอกสารโครงการ', 'academic')">
                <div class="doc-icon" style="font-size:24px; margin-bottom:8px;">📄</div>
                <div class="doc-title" style="font-size:14px;">เอกสารโครงการ</div>
              </a>`;
const gridBtnNew = `<a href="javascript:void(0)" class="doc-card" style="padding: 15px;" onclick="openDocCategory('เอกสารโครงการ', 'academic')">
                <div class="doc-icon" style="font-size:24px; margin-bottom:8px;">📄</div>
                <div class="doc-title" style="font-size:14px;">เอกสารโครงการ</div>
              </a>
              <a href="javascript:void(0)" class="doc-card" style="padding: 15px;" onclick="openDocCategory('ต้นแบบเอกสาร', 'academic')">
                <div class="doc-icon" style="font-size:24px; margin-bottom:8px;">🗂️</div>
                <div class="doc-title" style="font-size:14px;">ต้นแบบเอกสาร</div>
              </a>`;

code = code.replace(gridBtnOld, gridBtnNew);

const filterOld = `const filtered = data.filter(d => d.category === category).reverse();`;
const filterNew = `const filtered = data.filter(d => {
        if (category === 'เอกสารโครงการ') {
          return (d.category || '').startsWith('[PROJ:');
        }
        return d.category === category || (d.category || '').endsWith(category);
      }).reverse();`;

code = code.replace(filterOld, filterNew);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Replaced successfully');
