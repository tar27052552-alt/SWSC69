import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lessonCatalog, lessonPrimaryStartPages } from '../src/learn/lessonCatalog.js';
import { lessonIntroBlocks } from '../src/learn/lessonNarratives.js';

const root = resolve('.learning-source');
await mkdir(root, { recursive: true });
const formIds = [
  '1DHlm2AIW3ap7hg25H1rzMOUuAhYcsxkkphoPuIDlN8M',
  '1eASUTPUFZfzzZHHeXbfiya8uZVPH5XpH3jpfBZ93uWk',
  '1bKlBwuQoWJVOK3X98Ld2OFlqZy-RdZqDw0mfwKY50zE',
  '1WE9vdyODNbkkuUen-qR98sYZS35b-RmN5eUrIBq3MRo',
  '1IwSK9JXJ8zFk3iIIg8N3fXTicScJ3-gONmK_zIKbsJI',
];
// Each entry follows the order of resources in lessonCatalog.js.
const resourceTopics = [
  [0, 2, 0, 3, 2, 3, 3, 1, 3, 3, 3, 1, 1, 3, 1],
  [0, 2, 2, 1, 0, 2, 2, 3, 2, 2, 3, 0, 3, 3, 2, 2, 1, 1],
  [0, 0, 0, 1, 1, 0, 1, 1, 2, 3],
  [0, 0, 1, 0, 2, 1, 0, 1, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3],
];
const manualIds = new Set([
  '15rB98-qHXNW4m3Ki0e-RpO8xRddwfD80',
  '1fMRGKiTGh8o2gXNwZgJPEZijchvCGBeA',
  '1UQvmBgJH8tXgBoQnjgZHlnQdLla_QNe_',
]);
const keyText = await readFile('learning-answer-key.local', 'utf8');
const keyLines = keyText.split(/\r?\n/);
const answerKeys = [];
for (let i = 0; i < keyLines.length; i++) {
  if (!/^วิชา [1-5] /u.test(keyLines[i])) continue;
  const letters = [...(keyLines[i + 1] || '').matchAll(/\b\d+\s+([กขคง])/gu)].map(match => match[1]);
  if (letters.length !== 10) throw new Error('Expected ten reviewed answers after ' + keyLines[i]);
  answerKeys.push(letters.map(letter => ['ก', 'ข', 'ค', 'ง'].indexOf(letter)));
}
if (answerKeys.length !== 5) throw new Error('Expected five answer keys');

for (const subject of lessonCatalog) {
  for (const resource of subject.resources.filter(item => item.type === 'document')) {
    const id = resource.url.split('/')[5];
    const file = resolve(root, id + '.pdf');
    try { await stat(file); continue; } catch { /* download the missing source */ }
    const response = await fetch('https://drive.google.com/uc?export=download&id=' + id);
    if (!response.ok) throw new Error('Drive download failed: ' + id);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Not a PDF: ' + id);
    await writeFile(file, bytes);
    console.log('Downloaded ' + id);
  }
}

let pageData;
try { pageData = JSON.parse(await readFile(resolve(root, 'pages.json'), 'utf8')); }
catch {
  console.log('PDFs are ready. Run scripts/extract-learning-pages.py, then rerun this script.');
  process.exit(0);
}

async function formQuestions(id, answerKey) {
  const response = await fetch('https://docs.google.com/forms/d/' + id + '/viewform');
  if (!response.ok) throw new Error('Cannot open form ' + id);
  const html = await response.text();
  const marker = 'FB_PUBLIC_LOAD_DATA_ = ';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Form data unavailable ' + id);
  const offset = start + marker.length;
  const data = JSON.parse(html.slice(offset, html.indexOf(';', offset)));
  const items = data[1][1].filter(item => item[3] === 2 && item[1] !== 'ตำแหน่ง');
  if (items.length !== 10) throw new Error('Expected ten questions in ' + id);
  return items.map((item, index) => {
    const options = item[4][0][1].map(option => option[0].trim());
    if (options.length !== 4) throw new Error('Expected four options in ' + id);
    return { prompt: item[1].replace(/^\s*\d+\.\s*/, '').trim(),
      options, correctOption: answerKey[index] };
  });
}

const subjects = [];
for (let subjectIndex = 0; subjectIndex < 5; subjectIndex++) {
  const source = lessonCatalog[subjectIndex];
  if (resourceTopics[subjectIndex].length !== source.resources.length) {
    throw new Error('Resource mapping length mismatch: ' + source.id);
  }
  const topics = source.topics.map((title, index) => ({
    id: source.id + '-t' + (index + 1), title,
    blocks: lessonIntroBlocks(source.id, index),
    resources: [],
  }));
  const reviewNotes = [];
  let documentIndex = 0;
  for (let resourceIndex = 0; resourceIndex < source.resources.length; resourceIndex++) {
    const resource = source.resources[resourceIndex];
    const assignedTopic = resourceTopics[subjectIndex][resourceIndex];
    if (resource.type === 'video') {
      const videoId = new URL(resource.url).searchParams.get('v');
      if (!/^[\w-]{11}$/.test(videoId || '')) throw new Error('Invalid YouTube ID');
      topics[assignedTopic].resources.push({ type: 'video', title: resource.title, videoId });
      continue;
    }
    const fileId = resource.url.split('/')[5];
    const pdf = pageData[fileId];
    if (!pdf) throw new Error('Missing extracted PDF ' + fileId);
    if (pdf.pages.every(page => !page.text)) reviewNotes.push({
      sourceReference: resource.title + ' (PDF ทุกหน้า)',
      proposedChange: 'ตรวจข้อความในภาพต้นฉบับทีละหน้า และเพิ่มข้อความที่อ่านได้ในตัวแก้ไขบทเรียน',
      rationale: 'PDF นี้เป็นภาพสแกน ไม่มีชั้นข้อความให้ตรวจเทียบอัตโนมัติ',
    });
    if (manualIds.has(fileId)) reviewNotes.push({
      sourceReference: resource.title + ' (คู่มือฉบับเดิม)',
      proposedChange: 'ตรวจขั้นตอนและข้ออ้างอิงกับคู่มือฉบับที่โรงเรียนใช้ปัจจุบันก่อนอนุมัติ',
      rationale: 'เอกสารคู่มืออาจอ้างอิงระเบียบหรือขั้นตอนคนละปีการศึกษา',
    });
    const path = 'civic-dna-2026/' + source.id + '/' + fileId + '.pdf';
    const toc = manualIds.has(fileId) ? Array.from(
      { length: Math.ceil(pdf.pageCount / 20) },
      (_, index) => ({ title: 'หน้า ' + (index * 20 + 1) + '–' +
        Math.min((index + 1) * 20, pdf.pageCount), page: index * 20 + 1 })) : [];
    topics[assignedTopic].resources.push({ type: 'document', title: resource.title,
      path, toc, sourceId: fileId });
    if (!manualIds.has(fileId)) {
      for (const page of pdf.pages) {
        const pageTopic = documentIndex === 0
          ? Math.min(3, Math.floor((page.number - 1) * 4 / pdf.pageCount))
          : assignedTopic;
        topics[pageTopic].blocks.push({
          type: 'page', title: resource.title + ' — หน้า ' + page.number,
          pageNumber: page.number, text: page.text,
          imagePath: 'civic-dna-2026/' + source.id + '/' + fileId +
            '/page-' + String(page.number).padStart(3, '0') + '.jpg',
        });
      }
    }
    documentIndex++;
  }
  const primaryDocument = source.resources.find(item => item.type === 'document');
  const primaryId = primaryDocument.url.split('/')[5];
  const primaryPath = 'civic-dna-2026/' + source.id + '/' + primaryId + '.pdf';
  for (const topic of topics) {
    const startPage = lessonPrimaryStartPages[source.id][topics.indexOf(topic)];
    if (!topic.resources.some(item => item.path === primaryPath)) topic.resources.unshift({
      type: 'document', title: primaryDocument.title, path: primaryPath,
      startPage, toc: [], sourceId: primaryId,
    });
    else topic.resources.find(item => item.path === primaryPath).startPage = startPage;
  }
  const quiz = await formQuestions(formIds[subjectIndex], answerKeys[subjectIndex]);
  if (source.id === 'civic-3') {
    // The old option combined electing representatives with a referendum,
    // although the source describes a referendum as direct participation.
    quiz[9].options[1] = 'การใช้สิทธิเลือกตั้งผู้แทนระดับชาติหรือระดับท้องถิ่น';
  }
  subjects.push({ id: source.id, title: source.title, summary: source.summary,
    topics, quiz,
    reviewNotes,
    sourceForm: 'https://docs.google.com/forms/d/' + formIds[subjectIndex] + '/viewform' });
}
const totalDocuments = new Set(subjects.flatMap(subject => subject.topics.flatMap(topic =>
  topic.resources.filter(item => item.type === 'document').map(item => item.path)))).size;
const totalVideos = subjects.flatMap(subject => subject.topics.flatMap(topic =>
  topic.resources.filter(item => item.type === 'video'))).length;
if (totalDocuments !== 12 || totalVideos !== 60) throw new Error('Incomplete source resources');
await writeFile(resolve(root, 'course-draft.json'),
  JSON.stringify({ editionId: 'civic-dna-2026', subjects }, null, 2));
console.log('Draft ready: 5 subjects, 12 PDFs, 60 videos, 50 questions.');
console.log('Review .learning-source/course-draft.json before importing. It stays unpublished.');
