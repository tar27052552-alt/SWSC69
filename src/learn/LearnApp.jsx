import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { lessonCatalog } from './lessonCatalog.js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storageKey: 'swsc-learner-auth', persistSession: true, detectSessionInUrl: true } }
);

const mainUrl = import.meta.env.BASE_URL;
const oldCertificatesUrl = 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/สืบค้นเกียรติบัตร';

async function learningRequest(body) {
  const { data, error } = await supabase.functions.invoke('learning', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function LearnApp() {
  const [session, setSession] = useState(null);
  const subjects = lessonCatalog;
  const [publishedIds, setPublishedIds] = useState([]);
  const [progress, setProgress] = useState({});
  const [activeResource, setActiveResource] = useState(null);
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState('post');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(
    new URLSearchParams(location.search).get('view') === 'certificates' ? 'certificates' : 'courses'
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setCertificates([]);
        setProgress({});
        setView('courses');
      }
    });
    supabase.from('learning_subjects')
      .select('id')
      .eq('published', true).order('ordinal')
      .then(({ data, error }) => {
        if (!error) setPublishedIds((data || []).map(subject => subject.id));
      });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    learningRequest({ action: 'me' })
      .then(data => {
        setProfile(data.profile);
        setCertificates(data.certificates || []);
        setProgress(data.progress || {});
      })
      .catch(error => setNotice(error.message));
  }, [session]);

  async function sendSignIn(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const { error } = await supabase.auth.signInWithOtp({
      email: emailInput.trim(),
      options: { emailRedirectTo: location.origin + mainUrl + 'learn/' },
    });
    setBusy(false);
    setNotice(error ? error.message : 'ส่งลิงก์ยืนยันแล้ว กรุณาตรวจอีเมลของคุณ');
  }

  async function saveName(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await learningRequest({ action: 'save_name', fullName: nameInput });
      setProfile({ full_name: data.fullName });
      setNotice('บันทึกชื่อสำหรับเกียรติบัตรแล้ว');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openQuiz(subject, nextPhase) {
    setBusy(true);
    setNotice('');
    try {
      const data = await learningRequest({
        action: 'quiz', subjectId: subject.id, phase: nextPhase,
      });
      setSelected(subject);
      setPhase(nextPhase);
      setQuestions(data.questions);
      setAnswers({});
      setResult(null);
      setView('quiz');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const data = await learningRequest({
        action: 'submit', subjectId: selected.id, phase, answers,
      });
      setResult(data);
      const refreshed = await learningRequest({ action: 'me' });
      setCertificates(refreshed.certificates || []);
      setProgress(refreshed.progress || {});
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadCertificate(id) {
    try {
      const data = await learningRequest({ action: 'download', certificateId: id });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function resendCertificate(id) {
    setBusy(true);
    try {
      await learningRequest({ action: 'resend', certificateId: id });
      setNotice('เพิ่มเกียรติบัตรเข้าคิวส่งอีเมลแล้ว');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  const canQuiz = Boolean(session && profile);
  const isUnlocked = subject => subject.ordinal === 1 ||
    (progress[`civic-${subject.ordinal - 1}`]?.bestPostScore ?? -1) * 100 >=
      (progress[`civic-${subject.ordinal - 1}`]?.postTotal ?? 10) * 60;
  const currentSubject = subjects.find(subject => isUnlocked(subject) &&
    (progress[subject.id]?.bestPostScore ?? -1) * 100 <
      (progress[subject.id]?.postTotal ?? 10) * 60) || subjects[subjects.length - 1];
  const nextSubject = selected && subjects.find(subject => subject.ordinal === selected.ordinal + 1);
  function openLesson(subject) {
    setSelected(subject);
    setActiveResource(null);
    setResult(null);
    setView('lesson');
  }
  return (
    <div className="learn-app">
      <header className="learn-header">
        <a className="learn-brand" href={mainUrl}><span>SWSC</span><small>บทเรียนออนไลน์</small></a>
        <nav aria-label="เมนูบทเรียน">
          <button onClick={() => setView('courses')}>บทเรียน</button>
          <button onClick={() => setView('certificates')}>เกียรติบัตรของฉัน</button>
          {session && <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>}
        </nav>
      </header>

      <main className="learn-main">
        <section className="learn-hero">
          <div className="learn-eyebrow">หลักสูตรพลเมือง DNA</div>
          <h1>ถอดรหัสความเป็นพลเมืองคุณภาพ</h1>
          <p>เรียนทีละวิชาจนครบ 5 บท ทำก่อนเรียนแล้วดูสื่อ จากนั้นทำหลังเรียนให้ได้ 6/10 เพื่อไปบทถัดไป และ 8/10 เพื่อรับเกียรติบัตร</p>
        </section>

        {notice && <div className="learn-notice" role="status">{notice}</div>}

        {!session && (
          <section className="learn-panel learn-auth">
            <div>
              <h2>ยืนยันอีเมลเพื่อเริ่มเรียน</h2>
              <p>เราจะส่งลิงก์เข้าสู่ระบบให้ที่อีเมลนี้ และใช้ที่อยู่นี้ส่งเกียรติบัตรเมื่อสอบผ่าน</p>
            </div>
            <form onSubmit={sendSignIn}>
              <label htmlFor="learner-email">อีเมล</label>
              <input id="learner-email" type="email" required value={emailInput}
                onChange={event => setEmailInput(event.target.value)} placeholder="name@example.com" />
              <button disabled={busy}>ส่งลิงก์ยืนยัน</button>
            </form>
          </section>
        )}

        {session && !profile && (
          <section className="learn-panel learn-auth">
            <div>
              <h2>ชื่อสำหรับเกียรติบัตร</h2>
              <p>ตรวจสอบชื่อให้ถูกต้องก่อนบันทึก หลังออกใบแล้วผู้ดูแลเท่านั้นที่แก้ได้</p>
            </div>
            <form onSubmit={saveName}>
              <label htmlFor="learner-name">ชื่อและนามสกุล</label>
              <input id="learner-name" required minLength={2} maxLength={120}
                value={nameInput} onChange={event => setNameInput(event.target.value)} />
              <button disabled={busy}>บันทึกชื่อ</button>
            </form>
          </section>
        )}

        {view === 'courses' && (
          <section className="learn-section">
            <div className="learn-section-heading">
              <h2>เส้นทางเรียน 5 บท</h2>
              <span>{subjects.length} วิชา</span>
            </div>
            {canQuiz && publishedIds.includes(currentSubject.id) && (
              <button className="learn-continue" onClick={() => progress[currentSubject.id]?.preCompleted
                ? openLesson(currentSubject) : openQuiz(currentSubject, 'pre')}>
                เรียนต่อ: บทที่ {currentSubject.ordinal} →
              </button>
            )}
            <div className="learn-course-list">
              {subjects.map(subject => (
                <article className="learn-course" key={subject.id}>
                  <div className="learn-course-index">{subject.ordinal}</div>
                  <div className="learn-course-info">
                    <div className="learn-number">บทที่ {subject.ordinal} · {
                      !publishedIds.includes(subject.id) ? 'กำลังเตรียมเปิด' :
                      !isUnlocked(subject) ? '🔒 ยังไม่ปลดล็อก' :
                      (progress[subject.id]?.bestPostScore ?? -1) >= 8 ? 'ผ่านเกณฑ์เกียรติบัตร' :
                      (progress[subject.id]?.bestPostScore ?? -1) >= 6 ? 'ผ่านบทเรียน' :
                      progress[subject.id]?.preCompleted ? 'กำลังเรียน' : 'ยังไม่เริ่ม'
                    }</div>
                    <h3>{subject.title}</h3>
                    <p>{subject.summary}</p>
                    {(progress[subject.id]?.bestPostScore ?? -1) >= 0 &&
                      <small>คะแนนหลังเรียนสูงสุด {progress[subject.id].bestPostScore}/{progress[subject.id].postTotal}</small>}
                  </div>
                  <button type="button" disabled={busy || (publishedIds.includes(subject.id) && (!canQuiz || !isUnlocked(subject)))}
                    onClick={() => !publishedIds.includes(subject.id) || progress[subject.id]?.preCompleted
                      ? openLesson(subject) : openQuiz(subject, 'pre')}>
                    {!publishedIds.includes(subject.id) ? 'ดูสื่อบทเรียน →' :
                      progress[subject.id]?.preCompleted ? 'เปิดบทเรียน →' : 'เริ่มบทเรียน →'}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'lesson' && selected && (
          <section className="learn-section learn-lesson">
            <button className="learn-back" onClick={() => setView('courses')}>← กลับไปเส้นทางเรียน</button>
            <div className="learn-number">บทที่ {selected.ordinal} จาก 5</div>
            <h2>{selected.title}</h2>
            <p>{selected.summary}</p>
            {!publishedIds.includes(selected.id) &&
              <p className="learn-pending">เปิดให้ดูสื่อประกอบก่อน ข้อสอบและความคืบหน้ายังไม่เปิดใช้งาน</p>}
            <div className="learn-material"><strong>สิ่งที่จะได้เรียนรู้</strong>
              <ul>{selected.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
            </div>
            <details className="learn-material"><summary>จุดประสงค์การเรียนรู้</summary>
              <ul>{selected.objectives.map(objective => <li key={objective}>{objective}</li>)}</ul>
            </details>
            {['document', 'video'].map(type => (
              <div className="learn-material" key={type}>
                <h3>{type === 'document' ? 'เอกสารประกอบ' : 'วิดีโอบทเรียน'}</h3>
                <div className="learn-resource-list">
                  {selected.resources.filter(resource => resource.type === type).map(resource => (
                    <div key={resource.url}>
                      <button type="button" onClick={() => setActiveResource(
                        activeResource?.url === resource.url ? null : resource
                      )}>{resource.title}</button>
                      <a href={resource.url} target="_blank" rel="noreferrer">เปิดต้นฉบับ ↗</a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {activeResource && <div className="learn-viewer">
              <strong>{activeResource.title}</strong>
              <iframe title={activeResource.title} src={activeResource.embedUrl}
                loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              <a href={activeResource.url} target="_blank" rel="noreferrer">หากสื่อไม่แสดง เปิดต้นฉบับ ↗</a>
            </div>}
            <div className="learn-lesson-footer">
              <p>เรียนจบแล้ว ทำแบบทดสอบหลังเรียน 10 ข้อ · 6/10 ไปบทถัดไป · 8/10 รับเกียรติบัตร</p>
              <button disabled={!canQuiz || busy || !publishedIds.includes(selected.id)} onClick={() => openQuiz(selected, 'post')}>
                ทำแบบทดสอบหลังเรียน →
              </button>
            </div>
          </section>
        )}

        {view === 'quiz' && selected && (
          <section className="learn-panel learn-quiz">
            <button className="learn-back" onClick={() => setView(phase === 'post' ? 'lesson' : 'courses')}>← กลับไปบทเรียน</button>
            <h2>{phase === 'pre' ? 'ทดสอบก่อนเรียน' : 'ทดสอบหลังเรียน'}: {selected.title}</h2>
            <p>{phase === 'pre' ? 'ข้อสอบ 10 ข้อ คะแนนนี้ไม่มีผลต่อการปลดล็อกหรือเกียรติบัตร' : 'ถูก 6/10 เปิดบทถัดไป · ถูก 8/10 รับเกียรติบัตร · ทำซ้ำได้'}</p>
            {result ? (
              <div className="learn-result" role="status">
                <strong>ได้ {result.score}/{result.total} ข้อ ({result.percent}%)</strong>
                <p>{phase === 'pre' ? 'ทำก่อนเรียนครบแล้ว เริ่มดูบทเรียนได้' : result.passed ?
                  'ผ่านเกณฑ์เกียรติบัตรแล้ว กำลังจัดทำและส่งทางอีเมล' : result.unlockedNext ?
                  'ผ่านเกณฑ์ไปบทถัดไปแล้ว กลับมาสอบซ้ำเพื่อรับเกียรติบัตรได้' :
                  'ยังไม่ผ่านเกณฑ์ไปบทถัดไป ทบทวนแล้วทำซ้ำได้'}</p>
                <div className="learn-result-actions">
                  <button onClick={() => openLesson(selected)}>{phase === 'pre' ? 'เริ่มเรียน →' : 'ทบทวนบทเรียน'}</button>
                  {phase === 'post' && <button onClick={() => openQuiz(selected, 'post')}>ทำแบบทดสอบอีกครั้ง</button>}
                  {phase === 'post' && result.unlockedNext && nextSubject && publishedIds.includes(nextSubject.id) &&
                    <button onClick={() => openQuiz(nextSubject, 'pre')}>ไปบทที่ {nextSubject.ordinal} →</button>}
                </div>
              </div>
            ) : (
              <form onSubmit={submitQuiz}>
                {questions.map((question, index) => (
                  <fieldset key={question.id}>
                    <legend>{index + 1}. {question.prompt}</legend>
                    {question.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="learn-answer">
                        <input type="radio" name={question.id} required
                          checked={answers[question.id] === optionIndex}
                          onChange={() => setAnswers(previous => ({ ...previous, [question.id]: optionIndex }))} />
                        <span>{option}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button disabled={busy || Object.keys(answers).length !== questions.length}>ส่งคำตอบ</button>
              </form>
            )}
          </section>
        )}

        {view === 'certificates' && (
          <section className="learn-section">
            <div className="learn-section-heading"><h2>เกียรติบัตรของฉัน</h2></div>
            {!session && <div className="learn-panel">กรุณายืนยันอีเมลก่อนดูเกียรติบัตร</div>}
            {session && certificates.length === 0 && <div className="learn-panel">ยังไม่มีเกียรติบัตรจากบทเรียนออนไลน์</div>}
            <div className="learn-grid">
              {certificates.map(certificate => (
                <article className="learn-card" key={certificate.id}>
                  <div className="learn-number">{certificate.certificate_number}</div>
                  <h3>{subjects.find(subject => subject.id === certificate.subject_id)?.title || certificate.subject_id}</h3>
                  <p>ชื่อผู้รับ: {certificate.recipient_name}</p>
                  <p>วันที่ออก: {new Date(certificate.issued_at).toLocaleDateString('th-TH')}</p>
                  <p>สถานะอีเมล: {certificate.email_status === 'sent' ? 'ส่งแล้ว' : 'กำลังดำเนินการ'}</p>
                  <div className="learn-card-actions">
                    <button disabled={!certificate.downloadable} onClick={() => downloadCertificate(certificate.id)}>ดาวน์โหลด PDF</button>
                    <button disabled={busy} onClick={() => resendCertificate(certificate.id)}>ส่งอีเมลอีกครั้ง</button>
                  </div>
                </article>
              ))}
            </div>
            <p className="learn-old-cert">เกียรติบัตรจากเว็บเดิม: <a href={oldCertificatesUrl} target="_blank" rel="noreferrer">เปิดระบบค้นหาเดิม ↗</a></p>
          </section>
        )}
      </main>
    </div>
  );
}
