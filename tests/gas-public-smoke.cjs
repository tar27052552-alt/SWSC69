const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rows = {
  Secretary_Docs: [
    { id: 'meeting-1', title: 'วาระการประชุม ครั้งที่ 1', file_url: 'https://example.org/a.pdf', category: 'วาระการประชุม', private_note: 'do not expose' },
  ],
  Academic_Projects: [
    { id: 'project-1', title: 'โครงการหนึ่ง', description: 'รายละเอียด', status: 'เสร็จแล้ว', budget: 5000 },
  ],
  Academic_Docs: [
    { id: 'project-doc', title: 'เอกสารโครงการ', type: 'PDF', category: '[PROJ:project-1]', file_url: 'https://example.org/b.pdf', private_note: 'do not expose' },
    { id: 'cert-1', title: '32650', type: 'เกียรติบัตร|กิจกรรมหนึ่ง', file_url: 'https://example.org/c.pdf', private_note: 'do not expose' },
    { id: 'cert-2', title: '32651', type: 'เกียรติบัตร|กิจกรรมหนึ่ง', file_url: 'https://example.org/d.pdf', private_note: 'do not expose' },
  ],
};
const context = vm.createContext({
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput(text) { return { text, setMimeType() { return this; } }; },
  },
  console,
});
const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
vm.runInContext(source, context);
context.readFromSheet = (name) => rows[name];
const call = (data) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text);

const documents = call({ action: 'read_public_documents' });
assert.equal(documents.success, true);
assert.equal(documents.data.secretaryDocs.length, 1);
assert.equal(documents.data.academicDocs.length, 1);
assert.equal(documents.data.projects.length, 1);
assert.equal('private_note' in documents.data.secretaryDocs[0], false);
assert.equal('budget' in documents.data.projects[0], false);

const certificates = call({ action: 'search_public_certificates', studentId: '32650' });
assert.equal(certificates.success, true);
assert.equal(certificates.data.length, 1);
assert.equal(certificates.data[0].title, '32650');
assert.equal('private_note' in certificates.data[0], false);
assert.equal(call({ action: 'search_public_certificates', studentId: 'invalid' }).success, false);
assert.equal(call({ action: 'read_sheet', sheetName: 'Academic_Docs' }).success, false);
assert.equal(call({ action: 'write_sheet', sheetName: 'Academic_Docs' }).success, false);
console.log('Public document and certificate access checks passed');
