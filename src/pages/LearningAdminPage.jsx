import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { lessonCatalog } from '../learn/lessonCatalog.js';
import LearningLearners from './LearningLearners.jsx';
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
export default function LearningAdminPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [subjectId, setSubjectId] = useState('civic-1');
  const [draft, setDraft] = useState(null);
  const [quiz, setQuiz] = useState([]);
  const [tab, setTab] = useState('learners');
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
  async function createNameRequest() {
    await doAction({ action: 'create_name_request', certificateNumber,
      fullName: correctedName }, 'บันทึกคำขอแล้ว กรุณาตรวจและอนุมัติจากรายการด้านล่าง');
    setCertificateLookup(null);
  }
  async function upload(file, kind) {
    const signed = await adminRequest({ action: 'sign_upload', subjectId,
      kind, mime: file.type });
    const { error } = await supabase.storage.from('learning-materials')
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
    if (error) throw error;
    return signed.path;
  }
  return <div className="learning-admin">
    <header className="learning-admin-head"><div><span>จัดการหลักสูตร</span>
      <h1>พลเมือง DNA</h1>
      <p>ติดตามผู้เรียน จัดการข้อสอบ และเกียรติบัตร</p></div>
      <div className="learning-admin-state">
        <strong>{data?.edition.published ? 'เปิดเรียนแล้ว' : 'ยังไม่เปิดเรียน'}</strong>
        <small>{data?.edition.certificates_enabled ? 'ออกเกียรติบัตรได้' : 'รอแบบใบที่เซ็น'}</small>
      </div>
    </header>
    {notice && <div className="learning-admin-notice" role="status">{notice}</div>}
    <div className={'learning-admin-layout' + (tab === 'learners' ? ' learning-admin-layout-wide' : '')}>
      {tab !== 'learners' && <aside className="learning-admin-subjects" aria-label="รายวิชา">
        {data?.subjects.map(item => <button key={item.subject_id}
          className={subjectId === item.subject_id ? 'active' : ''}
          onClick={() => setSubjectId(item.subject_id)}>
          <span>วิชาที่ {item.ordinal}</span><strong>{item.title}</strong>
          <small>เนื้อหา {item.content_reviewed ? '✓' : 'รอตรวจ'} · ข้อสอบ {item.quiz_reviewed ? '✓' : 'รอตรวจ'}</small>
        </button>)}
      </aside>}
      <div className="learning-admin-main">
        <nav className="learning-admin-tabs" aria-label="ส่วนจัดการ">
          {[['learners', 'ติดตามผู้เรียน'], ['quiz', 'ข้อสอบ 10 ข้อ'], ['review', 'ข้อเสนอแก้ไข'], ['certificate', 'เกียรติบัตร']].map(
            ([id, label]) => <button key={id} className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        {tab === 'learners' && <LearningLearners />}
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
          <div className="learning-admin-note"><h3>คำขอเปลี่ยนชื่อบนเกียรติบัตร</h3>
            {(data?.nameRequests || []).length === 0 && <p>ไม่มีคำขอที่รอพิจารณา</p>}
            {(data?.nameRequests || []).map(item => <div key={item.id} className="learning-admin-note">
              <p>ชื่อบนใบเดิม: {item.currentName} → ชื่อใหม่: <strong>{item.requested_name}</strong></p>
              <p>ผู้เรียน {item.user_id} · เกียรติบัตร {item.certificateCount} ใบ</p>
              <p>ส่งคำขอ {new Date(item.created_at).toLocaleString('th-TH')}</p>
              <button disabled={busy} onClick={() => doAction({ action: 'decide_name_change',
                requestId: item.id, approve: true }, 'อนุมัติแล้ว ออกเลขใหม่และจัดคิวส่งใบทุกวิชา')}>
                อนุมัติและออกใบใหม่</button>
              <button disabled={busy} onClick={() => doAction({ action: 'decide_name_change',
                requestId: item.id, approve: false }, 'ปฏิเสธคำขอแล้ว ผู้เรียนส่งใหม่ได้')}>
                ปฏิเสธ</button>
            </div>)}
            <label className="learning-admin-field">เลขเกียรติบัตร<input
              value={certificateNumber} onChange={event => {
                setCertificateNumber(event.target.value); setCertificateLookup(null);
              }} placeholder="SWSC-DNA-2569-000001" /></label>
            <button disabled={busy} onClick={findCertificate}>ค้นหาใบ</button>
            {certificateLookup && <div><p>วิชา {certificateLookup.subject_id} ·
              ชื่อปัจจุบัน {certificateLookup.recipient_name}</p>
              {certificateLookup.status === 'revoked' ? <p>เลขใบนี้ถูกยกเลิกเมื่อ {
                new Date(certificateLookup.revoked_at).toLocaleString('th-TH')}
                {certificateLookup.auditUrl && <> · <a href={certificateLookup.auditUrl}
                  target="_blank" rel="noreferrer">เปิด PDF เก่าสำหรับตรวจสอบ</a></>}</p> : <>
              <label className="learning-admin-field">ชื่อที่แก้ไข<input value={correctedName}
                onChange={event => setCorrectedName(event.target.value)} /></label>
              <p>สร้างคำขอจากหลังบ้านให้ผู้เรียนคนนี้ โดยใช้สิทธิ์และขั้นตอนอนุมัติเดียวกัน</p>
              <button disabled={busy || correctedName.trim() === certificateLookup.recipient_name}
                onClick={createNameRequest}>สร้างคำขอเปลี่ยนชื่อ</button>
              </>}
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
