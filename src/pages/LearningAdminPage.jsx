import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { lessonCatalog } from '../learn/lessonCatalog.js';
import './LearningAdminPage.css';

async function adminRequest(body) {
  const { data, error } = await supabase.functions.invoke('learning-admin', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
const emptyTopics = subjectId => lessonCatalog.find(item => item.id === subjectId)?.topics.map(
  (title, index) => ({ id: subjectId + '-t' + (index + 1), title, blocks: [], resources: [] })) || [];
const emptyQuestion = () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0 });
function videoIdFrom(value) {
  const match = String(value).match(/(?:watch\?v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return match?.[1] || String(value).trim();
}

export default function LearningAdminPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [subjectId, setSubjectId] = useState('civic-1');
  const [draft, setDraft] = useState(null);
  const [quiz, setQuiz] = useState([]);
  const [tab, setTab] = useState('content');
  const [note, setNote] = useState({ sourceReference: '', proposedChange: '', rationale: '' });
  const [certificateNumber, setCertificateNumber] = useState('');
  const [certificateLookup, setCertificateLookup] = useState(null);
  const [correctedName, setCorrectedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const result = await adminRequest({ action: 'list' });
    setData(result);
    const subject = result.subjects.find(item => item.subject_id === subjectId);
    if (subject) setDraft({ title: subject.draft_title, summary: subject.draft_summary,
      topics: subject.draft_topics?.length ? subject.draft_topics : emptyTopics(subjectId),
      templateId: subject.template_path || '' });
    const quizResult = await adminRequest({ action: 'read_quiz', subjectId });
    setQuiz(quizResult.questions?.length ? quizResult.questions : Array.from({ length: 10 }, emptyQuestion));
    return result;
  }, [subjectId]);
  useEffect(() => {
    if (isAdmin) Promise.resolve().then(load).catch(error => setNotice(error.message));
  }, [isAdmin, load]);

  if (!isAdmin) return <div className="learning-admin"><h1>เฉพาะผู้ดูแลระบบ</h1></div>;
  const subject = data?.subjects.find(item => item.subject_id === subjectId);
  const notes = data?.notes.filter(item => item.subject_id === subjectId) || [];
  const updateTopic = (index, update) => setDraft(current => {
    const next = structuredClone(current);
    update(next.topics[index]);
    return next;
  });
  const doAction = async (body, message) => {
    setBusy(true); setNotice('');
    try {
      await adminRequest(body);
      await load();
      setNotice(message);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  async function findCertificate() {
    setBusy(true); setNotice(''); setCertificateLookup(null);
    try {
      const result = await adminRequest({ action: 'lookup_certificate', certificateNumber });
      setCertificateLookup(result.certificate);
      setCorrectedName(result.certificate.recipient_name);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function correctCertificate() {
    setBusy(true); setNotice('');
    try {
      const result = await adminRequest({ action: 'correct_certificate',
        certificateNumber, fullName: correctedName });
      setCertificateLookup(null);
      setNotice(`แก้ชื่อแล้ว กำลังสร้างและส่ง PDF ใหม่ ${result.regenerated} ใบ`);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function upload(file, kind) {
    const signed = await adminRequest({ action: 'sign_upload', subjectId,
      kind, mime: file.type });
    const { error } = await supabase.storage.from('learning-materials')
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
    if (error) throw error;
    return signed.path;
  }
  async function addImage(topicIndex, file) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await upload(file, 'image');
      updateTopic(topicIndex, topic => topic.blocks.push({ type: 'image', path, alt: file.name }));
      setNotice('อัปโหลดภาพแล้ว กดบันทึกฉบับร่างเพื่อเก็บในบทเรียน');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function addPdf(topicIndex, file) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await upload(file, 'document');
      updateTopic(topicIndex, topic => topic.resources.push({ type: 'document', title: file.name, path, toc: [] }));
      setNotice('อัปโหลด PDF แล้ว กดบันทึกฉบับร่างเพื่อเก็บในบทเรียน');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  return <div className="learning-admin">
    <header className="learning-admin-head"><div><span>จัดการหลักสูตร</span>
      <h1>พลเมือง DNA</h1>
      <p>แก้เนื้อหาฉบับร่าง ตรวจคำถาม และเผยแพร่เมื่อครบทั้ง 5 วิชา</p></div>
      <div className="learning-admin-state">
        <strong>{data?.edition.published ? 'เปิดเรียนแล้ว' : 'ยังไม่เปิดเรียน'}</strong>
        <small>{data?.edition.certificates_enabled ? 'ออกเกียรติบัตรได้' : 'รอแบบใบที่เซ็น'}</small>
      </div>
    </header>
    {notice && <div className="learning-admin-notice" role="status">{notice}</div>}
    <div className="learning-admin-layout">
      <aside className="learning-admin-subjects" aria-label="รายวิชา">
        {data?.subjects.map(item => <button key={item.subject_id}
          className={subjectId === item.subject_id ? 'active' : ''}
          onClick={() => setSubjectId(item.subject_id)}>
          <span>วิชาที่ {item.ordinal}</span><strong>{item.title}</strong>
          <small>เนื้อหา {item.content_reviewed ? '✓' : 'รอตรวจ'} · ข้อสอบ {item.quiz_reviewed ? '✓' : 'รอตรวจ'}</small>
        </button>)}
      </aside>
      <div className="learning-admin-main">
        <nav className="learning-admin-tabs" aria-label="ส่วนจัดการ">
          {[['content', 'เนื้อหา'], ['quiz', 'ข้อสอบ 10 ข้อ'], ['review', 'ข้อเสนอแก้ไข'], ['certificate', 'เกียรติบัตร']].map(
            ([id, label]) => <button key={id} className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        {draft && tab === 'content' && <section>
          <div className="learning-admin-toolbar"><div><h2>ฉบับร่างวิชาที่ {subject?.ordinal}</h2>
            <p>เผยแพร่รุ่น {subject?.published_revision || 0} · ฉบับร่างรุ่น {subject?.draft_revision || 0}</p></div>
            <button disabled={busy} onClick={() => doAction({ action: 'save_subject', subjectId,
              title: draft.title, summary: draft.summary, topics: draft.topics }, 'บันทึกฉบับร่างแล้ว')}>
              บันทึกฉบับร่าง</button></div>
          <label className="learning-admin-field">ชื่อวิชา<input value={draft.title}
            onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="learning-admin-field">คำอธิบาย<textarea value={draft.summary}
            onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
          {draft.topics.map((topic, topicIndex) => <article className="learning-admin-topic" key={topic.id}>
            <div className="learning-admin-topic-head"><span>หัวข้อ {topicIndex + 1}</span>
              <input aria-label={'ชื่อหัวข้อ ' + (topicIndex + 1)} value={topic.title}
                onChange={event => updateTopic(topicIndex, item => { item.title = event.target.value; })} /></div>
            <div className="learning-admin-blocks">{topic.blocks.map((block, blockIndex) =>
              <div className="learning-admin-block" key={blockIndex}>
                <div className="learning-admin-block-tools"><span>{block.type === 'heading' ? 'หัวข้อย่อย' :
                  block.type === 'paragraph' ? 'ข้อความ' : block.type === 'image' ? 'ภาพ' :
                  block.type === 'page' ? 'หน้าเอกสาร' : 'ตาราง'}</span>
                  <button disabled={blockIndex === 0} onClick={() => updateTopic(topicIndex, item => {
                    [item.blocks[blockIndex - 1], item.blocks[blockIndex]] =
                      [item.blocks[blockIndex], item.blocks[blockIndex - 1]];
                  })}>↑</button>
                  <button disabled={blockIndex === topic.blocks.length - 1} onClick={() => updateTopic(topicIndex, item => {
                    [item.blocks[blockIndex + 1], item.blocks[blockIndex]] =
                      [item.blocks[blockIndex], item.blocks[blockIndex + 1]];
                  })}>↓</button>
                  <button onClick={() => updateTopic(topicIndex, item => item.blocks.splice(blockIndex, 1))}>ลบ</button>
                </div>
                {(block.type === 'heading' || block.type === 'paragraph') && <textarea value={block.text}
                  rows={block.type === 'heading' ? 2 : 6}
                  onChange={event => updateTopic(topicIndex, item => {
                    item.blocks[blockIndex].text = event.target.value;
                  })} />}
                {block.type === 'image' && <label>คำอธิบายภาพ<input value={block.alt || ''}
                  onChange={event => updateTopic(topicIndex, item => {
                    item.blocks[blockIndex].alt = event.target.value;
                  })} /></label>}
                {block.type === 'page' && <label>ข้อความจากเอกสารต้นฉบับ<textarea value={block.text || ''}
                  rows={8} onChange={event => updateTopic(topicIndex, item => {
                    item.blocks[blockIndex].text = event.target.value;
                  })} /></label>}
                {block.type === 'table' && <textarea value={(block.rows || []).map(row => row.join(' | ')).join('\n')}
                  rows={5} aria-label="ตาราง คั่นคอลัมน์ด้วย |"
                  onChange={event => updateTopic(topicIndex, item => {
                    item.blocks[blockIndex].rows = event.target.value.split('\n').map(row =>
                      row.split('|').map(cell => cell.trim()));
                  })} />}
              </div>)}</div>
            <div className="learning-admin-add">
              <button onClick={() => updateTopic(topicIndex, item =>
                item.blocks.push({ type: 'heading', text: '' }))}>+ หัวข้อย่อย</button>
              <button onClick={() => updateTopic(topicIndex, item =>
                item.blocks.push({ type: 'paragraph', text: '' }))}>+ ข้อความ</button>
              <button onClick={() => updateTopic(topicIndex, item =>
                item.blocks.push({ type: 'table', rows: [['', '']] }))}>+ ตาราง</button>
              <label>+ ภาพ<input type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={event => addImage(topicIndex, event.target.files?.[0])} /></label>
            </div>
            <h3>สื่อในหัวข้อนี้</h3>
            {topic.resources.map((item, resourceIndex) => <div className="learning-admin-resource" key={resourceIndex}>
              <span>{item.type === 'video' ? '▶ วิดีโอ' : '▤ PDF'}</span>
              <input aria-label="ชื่อสื่อ" value={item.title}
                onChange={event => updateTopic(topicIndex, target => {
                  target.resources[resourceIndex].title = event.target.value;
                })} />
              {item.type === 'video' && <input aria-label="YouTube ID" value={item.videoId}
                onChange={event => updateTopic(topicIndex, target => {
                  target.resources[resourceIndex].videoId = videoIdFrom(event.target.value);
                })} />}
              <button onClick={() => updateTopic(topicIndex, target =>
                target.resources.splice(resourceIndex, 1))}>ลบ</button>
            </div>)}
            <div className="learning-admin-add">
              <button onClick={() => updateTopic(topicIndex, item =>
                item.resources.push({ type: 'video', title: '', videoId: '' }))}>+ วิดีโอ</button>
              <label>+ PDF<input type="file" accept="application/pdf" hidden
                onChange={event => addPdf(topicIndex, event.target.files?.[0])} /></label>
            </div>
          </article>)}
          <button disabled={busy || subject?.content_reviewed} onClick={() =>
            doAction({ action: 'review', subjectId, kind: 'content', approved: true },
              'อนุมัติเนื้อหาวิชานี้แล้ว')}>อนุมัติเนื้อหาวิชานี้</button>
        </section>}
        {tab === 'quiz' && <section><div className="learning-admin-toolbar"><div>
          <h2>คำถามจาก Google Forms เดิม</h2><p>ก่อนเรียนและหลังเรียนใช้ 10 ข้อเดียวกัน</p></div>
          <button disabled={busy} onClick={() => doAction({ action: 'replace_quiz', subjectId,
            questions: quiz }, 'บันทึกข้อสอบแล้ว โปรดตรวจเฉลยก่อนอนุมัติ')}>บันทึกข้อสอบ</button></div>
          {quiz.map((item, index) => <article className="learning-admin-question" key={index}>
            <label>ข้อ {index + 1}<textarea value={item.prompt} rows={3}
              onChange={event => setQuiz(current => current.map((question, i) =>
                i === index ? { ...question, prompt: event.target.value } : question))} /></label>
            {item.options.map((option, optionIndex) => <label key={optionIndex}>
              ตัวเลือก {['ก', 'ข', 'ค', 'ง'][optionIndex]}<input value={option}
                onChange={event => setQuiz(current => current.map((question, i) =>
                  i === index ? { ...question, options: question.options.map((value, j) =>
                    j === optionIndex ? event.target.value : value) } : question))} /></label>)}
            <label>เฉลย<select value={item.correctOption}
              onChange={event => setQuiz(current => current.map((question, i) =>
                i === index ? { ...question, correctOption: Number(event.target.value) } : question))}>
              {[0, 1, 2, 3].map(i => <option key={i} value={i}>{['ก', 'ข', 'ค', 'ง'][i]}</option>)}
            </select></label>
          </article>)}
          <button disabled={busy || subject?.quiz_reviewed || data?.quizCounts.find(item =>
            item.subjectId === subjectId)?.count !== 10} onClick={() =>
            doAction({ action: 'review', subjectId, kind: 'quiz', approved: true },
              'อนุมัติข้อสอบวิชานี้แล้ว')}>อนุมัติคำถามและเฉลย</button>
        </section>}
        {tab === 'review' && <section><h2>รายการเสนอแก้จากต้นฉบับ</h2>
          {notes.map(item => <article className="learning-admin-note" key={item.id}>
            <strong>{item.source_reference}</strong><p>{item.proposed_change}</p>
            <small>เหตุผล: {item.rationale} · {item.status}</small>
            {item.status === 'pending' && <div className="learning-admin-add">
              <button onClick={() => doAction({ action: 'set_note_status', subjectId,
                noteId: item.id, status: 'approved' }, 'อนุมัติข้อเสนอแล้ว')}>อนุมัติ</button>
              <button onClick={() => doAction({ action: 'set_note_status', subjectId,
                noteId: item.id, status: 'rejected' }, 'ไม่ใช้ข้อเสนอนี้')}>ไม่ใช้</button>
            </div>}</article>)}
          <div className="learning-admin-note"><h3>เพิ่มข้อเสนอ</h3>
            <input placeholder="เอกสารและหน้าที่พบ" value={note.sourceReference}
              onChange={event => setNote({ ...note, sourceReference: event.target.value })} />
            <textarea placeholder="เสนอแก้เป็น" value={note.proposedChange}
              onChange={event => setNote({ ...note, proposedChange: event.target.value })} />
            <textarea placeholder="เหตุผล" value={note.rationale}
              onChange={event => setNote({ ...note, rationale: event.target.value })} />
            <button disabled={busy} onClick={() => doAction({ action: 'add_note', subjectId,
              ...note }, 'เพิ่มข้อเสนอแล้ว')}>เพิ่มข้อเสนอ</button>
          </div>
        </section>}
        {tab === 'certificate' && draft && <section><h2>แบบเกียรติบัตรที่เซ็นแล้ว</h2>
          <p>ใช้ Google Slides ที่มีลายเซ็นครบ และมีช่อง <code>{'{{NAME}}'}</code>,
            <code>{'{{ISSUED_DATE}}'}</code>, <code>{'{{CERT_NUMBER}}'}</code></p>
          <label className="learning-admin-field">ลิงก์หรือ ID ของ Google Slides<input value={draft.templateId}
            onChange={event => setDraft({ ...draft, templateId: event.target.value })} /></label>
          <button disabled={busy} onClick={() => doAction({ action: 'set_template', subjectId,
            templateId: draft.templateId, approved: true }, 'บันทึกแบบใบที่เซ็นแล้ว')}>
            บันทึกและอนุมัติแบบใบวิชานี้</button>
          <div className="learning-admin-note"><h3>แก้ชื่อบนใบที่ออกแล้ว</h3>
            <label className="learning-admin-field">เลขเกียรติบัตร<input
              value={certificateNumber} onChange={event => {
                setCertificateNumber(event.target.value); setCertificateLookup(null);
              }} placeholder="SWSC-DNA-2569-000001" /></label>
            <button disabled={busy} onClick={findCertificate}>ค้นหาใบ</button>
            {certificateLookup && <div><p>วิชา {certificateLookup.subject_id} ·
              ชื่อปัจจุบัน {certificateLookup.recipient_name}</p>
              <label className="learning-admin-field">ชื่อที่แก้ไข<input value={correctedName}
                onChange={event => setCorrectedName(event.target.value)} /></label>
              <p>การแก้ชื่อจะสร้างและส่ง PDF ใหม่ให้ทุกวิชาที่ผู้เรียนคนนี้ได้รับใบแล้ว</p>
              <button disabled={busy || correctedName.trim() === certificateLookup.recipient_name}
                onClick={correctCertificate}>บันทึกชื่อและสร้างใบใหม่</button>
            </div>}
          </div>
        </section>}
      </div>
    </div>
    <footer className="learning-admin-footer"><div>เผยแพร่ได้เมื่อเอกสาร 12 ไฟล์ วิดีโอ 60 รายการ
      คำถาม 50 ข้อ และการตรวจทั้ง 5 วิชาครบ</div>
      <button disabled={busy || !data?.subjects.every(item => item.content_reviewed && item.quiz_reviewed)}
        onClick={() => doAction({ action: 'publish' }, 'เผยแพร่หลักสูตรครบ 5 วิชาแล้ว')}>เผยแพร่หลักสูตร</button>
      <button disabled={busy || !data?.edition.published ||
        !data?.subjects.every(item => item.template_approved)}
        onClick={() => doAction({ action: 'activate_certificates' },
          'เปิดออกเกียรติบัตรและจัดคิวผู้สอบผ่านแล้ว')}>เปิดออกเกียรติบัตร</button>
    </footer>
  </div>;
}
