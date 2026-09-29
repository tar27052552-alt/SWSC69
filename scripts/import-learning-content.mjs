import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/import-learning-content.mjs <content.json>');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally');
const data = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(data.subjects) || data.subjects.length !== 5) {
  throw new Error('Expected exactly five subjects');
}
const client = createClient(url, key, { auth: { persistSession: false } });
for (let index = 0; index < 5; index++) {
  const subject = data.subjects[index];
  if (subject.id !== `civic-${index + 1}` || !subject.title || !subject.summary ||
      !Array.isArray(subject.sections) || subject.sections.length === 0) {
    throw new Error(`Subject ${index + 1} has missing content`);
  }
  if (!Array.isArray(subject.quiz) || subject.quiz.length === 0) {
    throw new Error(`${subject.id} is missing quiz questions`);
  }
  for (const question of subject.quiz) {
    if (!question.prompt || !Array.isArray(question.options) ||
      question.options.length < 2 || !Number.isInteger(question.correctOption) ||
      question.correctOption < 0 || question.correctOption >= question.options.length) {
      throw new Error(`${subject.id} has an invalid question`);
    }
  }
}

for (const subject of data.subjects) {
  const { error } = await client.rpc('import_learning_subject', {
    p_subject_id: subject.id, p_title: subject.title, p_summary: subject.summary,
    p_sections: subject.sections, p_quiz: subject.quiz,
  });
  if (error) throw error;
  console.log(`Imported ${subject.id}: ${subject.quiz.length} questions for both phases`);
}
console.log('Import complete. Subjects remain unpublished until templates and delivery are checked.');
