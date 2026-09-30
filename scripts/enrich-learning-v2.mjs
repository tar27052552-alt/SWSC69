import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lessonIntroBlocks } from '../src/learn/lessonNarratives.js';
import { lessonCatalog, lessonPrimaryStartPages } from '../src/learn/lessonCatalog.js';

const file = resolve('.learning-source/course-draft.json');
const draft = JSON.parse(await readFile(file, 'utf8'));
if (draft.editionId !== 'civic-dna-2026' || draft.subjects?.length !== 5) {
  throw new Error('Unexpected course draft');
}
for (const subject of draft.subjects) {
  if (subject.topics?.length !== 4) throw new Error(`Expected four topics: ${subject.id}`);
  const catalog = lessonCatalog.find(item => item.id === subject.id);
  if (!catalog) throw new Error(`Unknown subject: ${subject.id}`);
  const primaryDocument = catalog.resources.find(item => item.type === 'document');
  const primaryId = primaryDocument.url.split('/')[5];
  const primaryPath = `civic-dna-2026/${subject.id}/${primaryId}.pdf`;
  subject.topics.forEach((topic, index) => {
    topic.title = catalog.topics[index];
    const sourceBlocks = topic.blocks.filter(block =>
      block.editorialSource !== 'lesson-narrative-v1' &&
      !(block.type === 'paragraph' && block.text ===
        (catalog.objectives[index] || catalog.summary)));
    topic.blocks = [...lessonIntroBlocks(subject.id, index), ...sourceBlocks];
    const startPage = lessonPrimaryStartPages[subject.id][index];
    const existing = topic.resources.find(item => item.path === primaryPath);
    if (existing) existing.startPage = startPage;
    else topic.resources.unshift({ type: 'document', title: primaryDocument.title,
      path: primaryPath, startPage, toc: [], sourceId: primaryId });
  });
  subject.reviewNotes = [...(subject.reviewNotes || []).filter(note =>
    note.sourceReference !== 'ข้อความบทอ่านในเว็บ'), {
    sourceReference: 'ข้อความบทอ่านในเว็บ',
    proposedChange: 'เทียบข้อความทั้ง 4 หัวข้อกับ PDF และวิดีโอต้นฉบับ ตรวจคำที่เกี่ยวกับกฎหมายหรือขั้นตอนเลือกตั้งกับเอกสารปัจจุบันก่อนอนุมัติ',
    rationale: 'ข้อความเป็นฉบับเรียบเรียงเพื่อให้อ่านบนมือถือ ยังไม่ผ่านการตรวจรับจากผู้ดูแล',
  }];
}
await writeFile(file, JSON.stringify(draft, null, 2));
console.log('Added reading copy to 20 draft topics. Existing pages, resources, and quiz were preserved.');
