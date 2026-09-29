/** Import the reviewed local draft to Supabase without publishing it.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local process.
 * Never put the service role key in VITE_* variables or in this repository.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally');
const root = resolve('.learning-source');
const draft = JSON.parse(await readFile(resolve(root, 'course-draft.json'), 'utf8'));
if (draft.editionId !== 'civic-dna-2026' || draft.subjects?.length !== 5) {
  throw new Error('Invalid course draft');
}
const client = createClient(url, key, { auth: { persistSession: false } });
const uploaded = new Set();
async function put(path, localFile, contentType) {
  if (uploaded.has(path)) return;
  const bucket = client.storage.from('learning-materials');
  const bytes = await readFile(localFile);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
    if (!error || Number(error.statusCode) === 409) {
      uploaded.add(path);
      if (!error) console.log('Uploaded ' + path);
      return;
    }
    if (attempt === 3 || !/40P01|deadlock|timeout|5\d\d/i.test(error.message)) {
      throw new Error('Upload ' + path + ': ' + error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 800 * 2 ** attempt));
  }
}

for (const subject of draft.subjects) {
  if (!/^civic-[1-5]$/.test(subject.id) || subject.topics?.length !== 4 ||
    subject.quiz?.length !== 10) throw new Error('Incomplete ' + subject.id);
  for (const topic of subject.topics) {
    for (const resource of topic.resources) {
      if (resource.type !== 'document') continue;
      const id = resource.sourceId;
      await put(resource.path, resolve(root, id + '.pdf'), 'application/pdf');
    }
    for (const block of topic.blocks) {
      if (block.type !== 'page') continue;
      const parts = block.imagePath.split('/');
      const id = parts[2];
      await put(block.imagePath, resolve(root, 'pages', id, parts[3]), 'image/jpeg');
    }
  }
  const { error: contentError } = await client.from('learning_subject_editions').update({
    draft_title: subject.title, draft_summary: subject.summary, draft_topics: subject.topics,
    content_reviewed: false, quiz_reviewed: false,
  }).eq('edition_id', draft.editionId).eq('subject_id', subject.id);
  if (contentError) throw contentError;
  const { error: revisionError } = await client.rpc('increment_learning_draft_revision', {
    p_subject_id: subject.id,
  });
  if (revisionError) throw revisionError;
  const { error: quizError } = await client.rpc('import_learning_v2_questions', {
    p_subject_id: subject.id, p_questions: subject.quiz,
  });
  if (quizError) throw quizError;
  const { data: existingNotes, error: noteError } = await client.from('learning_review_notes')
    .select('source_reference').eq('edition_id', draft.editionId).eq('subject_id', subject.id);
  if (noteError) throw noteError;
  const existingSources = new Set((existingNotes || []).map(item => item.source_reference));
  const newNotes = (subject.reviewNotes || []).filter(item => !existingSources.has(item.sourceReference));
  if (newNotes.length) {
    const { error } = await client.from('learning_review_notes').insert(newNotes.map(item => ({
      edition_id: draft.editionId, subject_id: subject.id,
      source_reference: item.sourceReference, proposed_change: item.proposedChange,
      rationale: item.rationale,
    })));
    if (error) throw error;
  }
  console.log('Drafted ' + subject.id + ' (unpublished)');
}
console.log('Imported draft assets and questions. An administrator must review and publish all five subjects.');
