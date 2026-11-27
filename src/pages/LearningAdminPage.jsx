import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminRequest } from '../lib/learningAdminRequest';
import LearningLearners from './LearningLearners.jsx';
import './LearningAdminPage.css';


const emptyQuestion = () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0 });
export default function LearningAdminPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [subjectId, setSubjectId] = useState('civic-1');
  const [quiz, setQuiz] = useState([]);
  const [tab, setTab] = useState('learners');
  const [note, setNote] = useState({ sourceReference: '', proposedChange: '', rationale: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [certificateJobs, setCertificateJobs] = useState([]);
  const [templates, setTemplates] = useState({
    'civic-1': '', 'civic-2': '', 'civic-3': '', 'civic-4': '', 'civic-5': '', 'civic-all': '',
  });
  const [jobsError, setJobsError] = useState('');
  const loadEpoch = useRef(0);
  const actionBusy = useRef(false);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    const result = await adminRequest({ action: 'list' });
    if (epoch !== loadEpoch.current) return result;
    setData(result);
    const nextTemplates = { 'civic-all': result.edition?.course_template_path || '' };
    for (const item of result.subjects || []) nextTemplates[item.subject_id] = item.template_path || '';
    setTemplates(nextTemplates);
    try {
      const jobs = await adminRequest({ action: 'certificate_jobs' });
      if (epoch !== loadEpoch.current) return result;
      setCertificateJobs(jobs.certificates || []); setJobsError('');
    } catch (error) { if (epoch === loadEpoch.current) setJobsError(error.message); }
    const quizResult = await adminRequest({ action: 'read_quiz', subjectId });
    if (epoch !== loadEpoch.current) return result;
    setQuiz(quizResult.questions?.length ? quizResult.questions : Array.from({ length: 10 }, emptyQuestion));
    return result;
  }, [subjectId]);
  useEffect(() => {
    if (isAdmin) Promise.resolve().then(load).catch(error => setNotice(error.message));
    const invalidate = () => { loadEpoch.current++; };
    return invalidate;
  }, [isAdmin, load]);

  if (!isAdmin) return <div className="learning-admin"><h1>เฉพาะผู้ดูแลระบบ</h1></div>;
  const subject = data?.subjects.find(item => item.subject_id === subjectId);
  const notes = data?.notes.filter(item => item.subject_id === subjectId) || [];
  const doAction = async (body, message) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true); setNotice('');
    try {
      await adminRequest(body);
      await load();
      setNotice(message);
    } catch (error) { setNotice(error.message); }
    finally { actionBusy.current = false; setBusy(false); }
  };
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
    <div className={'learning-admin-layout' + (['learners', 'certificate'].includes(tab) ? ' learning-admin-layout-wide' : '')}>
      {tab !== 'learners' && tab !== 'certificate' && <aside className="learning-admin-subjects" aria-label="รายวิชา">
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
        {tab === 'certificate' && <section><h2>แบบเกียรติบัตรที่เซ็นแล้ว (5 บท + รวม)</h2>
          <p>ผ่าน 8/10 แต่ละบทรับเกียรติบัตรรายบท และเมื่อผ่าน 8/10 ครบทั้ง 5 บทรับเกียรติบัตรรวมเพิ่มอีก 1 ใบ</p>
          <p>ใช้ Google Slides ที่มีลายเซ็นครบ และมีช่อง <code>{'{{NAME}}'}</code>,
            <code>{'{{ISSUED_DATE}}'}</code></p>
          {(data?.subjects || []).map(item => <div key={item.subject_id} className="learning-admin-note">
            <label className="learning-admin-field">
              บทที่ {item.ordinal} · {item.title} {item.template_approved ? '✓ อนุมัติแล้ว' : '(รอตั้งค่า)'}
              <input value={templates[item.subject_id] || ''}
                placeholder="ลิงก์หรือ ID ของ Google Slides"
                onChange={event => setTemplates(prev => ({ ...prev, [item.subject_id]: event.target.value }))} />
            </label>
            <button disabled={busy || !(templates[item.subject_id] || '').trim()}
              onClick={() => doAction({ action: 'set_template', subjectId: item.subject_id,
                templateId: templates[item.subject_id], approved: true },
                `บันทึกและอนุมัติแบบเกียรติบัตรบทที่ ${item.ordinal} แล้ว`)}>
              บันทึกและอนุมัติบทที่ {item.ordinal}</button>
          </div>)}
          <div className="learning-admin-note">
            <label className="learning-admin-field">
              เกียรติบัตรรวม (จบครบทั้ง 5 บท) {data?.edition?.course_template_approved ? '✓ อนุมัติแล้ว' : '(รอตั้งค่า)'}
              <input value={templates['civic-all'] || ''}
                placeholder="ลิงก์หรือ ID ของ Google Slides ใบรวม"
                onChange={event => setTemplates(prev => ({ ...prev, 'civic-all': event.target.value }))} />
            </label>
            <button disabled={busy || !(templates['civic-all'] || '').trim()}
              onClick={() => doAction({ action: 'set_template', subjectId: 'civic-all',
                templateId: templates['civic-all'], approved: true }, 'บันทึกและอนุมัติแบบเกียรติบัตรรวมแล้ว')}>
              บันทึกและอนุมัติแบบเกียรติบัตรรวม</button>
          </div>
          <div className="learning-admin-note"><h3>สถานะการจัดทำ PDF · 100 ใบล่าสุด</h3>
            {jobsError && <p role="alert">โหลดสถานะไม่ได้: {jobsError}</p>}
            <button disabled={busy} onClick={() => doAction({ action: 'certificate_jobs' }, 'อัปเดตสถานะแล้ว')}>รีเฟรชสถานะ</button>
            {!jobsError && certificateJobs.length === 0 && <p>ยังไม่มีเกียรติบัตร</p>}
            {certificateJobs.map(item => <div key={item.id} className="learning-admin-note">
              <strong>{item.recipient_name}</strong>
              <p>{item.subject_id === 'civic-all' ? 'เกียรติบัตรรวมจบหลักสูตร' :
                (() => {
                  const found = data?.subjects.find(s => s.subject_id === item.subject_id);
                  return found ? `บทที่ ${found.ordinal}: ${found.title}` : item.subject_id || '';
                })()} · {({ pending: 'รอจัดทำ', processing: 'กำลังจัดทำ', ready: 'พร้อมดาวน์โหลด', failed: 'จัดทำไม่สำเร็จ' })[item.generationStatus]}</p>
              {item.generationStatus === 'failed' && <button disabled={busy} onClick={() => doAction({ action: 'retry_certificate_pdf', certificateId: item.id }, 'จัดคิวสร้าง PDF ของใบเดิมใหม่แล้ว')}>ลองสร้าง PDF ใหม่</button>}
            </div>)}
          </div>
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
          </div>
        </section>}
      </div>
    </div>
    <footer className="learning-admin-footer"><div>เผยแพร่ได้เมื่อเอกสาร 12 ไฟล์ วิดีโอ 60 รายการ
      คำถาม 50 ข้อ และการตรวจทั้ง 5 วิชาครบ</div>
      <button disabled={busy || !data?.subjects.every(item => item.content_reviewed && item.quiz_reviewed)}
        onClick={() => doAction({ action: 'publish' }, 'เผยแพร่หลักสูตรครบ 5 วิชาแล้ว')}>เผยแพร่หลักสูตร</button>
      <button disabled={busy || !data?.edition.published ||
        !data?.subjects.every(item => item.template_approved) ||
        !data?.edition.course_template_approved}
        onClick={() => doAction({ action: 'activate_certificates' },
          'เปิดออกเกียรติบัตรและจัดคิวผู้สอบผ่านแล้ว')}>เปิดออกเกียรติบัตร</button>
    </footer>
  </div>;
}
