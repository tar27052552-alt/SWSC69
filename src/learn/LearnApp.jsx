import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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
  const [subjects, setSubjects] = useState([]);
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
      }
    });
    supabase.from('learning_subjects')
      .select('id,ordinal,title,summary,sections,source_url')
      .eq('published', true).order('ordinal')
      .then(({ data, error }) => {
        if (error) setNotice('ยังไม่สามารถโหลดบทเรียนได้');
        else setSubjects(data || []);
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
      if (data.certificateId) {
        const refreshed = await learningRequest({ action: 'me' });
        setCertificates(refreshed.certificates || []);
      }
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
          <p>เรียนรู้ได้ตามลำดับที่สะดวก ทำแบบทดสอบหลังเรียนให้ได้อย่างน้อย 80% เพื่อรับเกียรติบัตรรายวิชา</p>
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
              <h2>วิชาทั้งหมด</h2>
              <span>{subjects.length} วิชา</span>
            </div>
            {subjects.length === 0 && <div className="learn-panel">กำลังเตรียมบทเรียนและแบบทดสอบ กรุณากลับมาอีกครั้ง</div>}
            <div className="learn-grid">
              {subjects.map(subject => (
                <article className="learn-card" key={subject.id}>
                  <div className="learn-number">วิชาที่ {subject.ordinal}</div>
                  <h3>{subject.title}</h3>
                  <p>{subject.summary || 'เรียนรู้เนื้อหาและสื่อประกอบก่อนทำแบบทดสอบ'}</p>
                  {(subject.sections || []).map((section, index) => (
                    <div className="learn-material" key={index}>
                      <strong>{section.title}</strong>
                      {section.text && <p>{section.text}</p>}
                      {section.url && <a href={section.url} target="_blank" rel="noreferrer">เปิดสื่อประกอบ ↗</a>}
                    </div>
                  ))}
                  <div className="learn-card-actions">
                    <button type="button" disabled={!canQuiz || busy} onClick={() => openQuiz(subject, 'pre')}>ทดสอบก่อนเรียน</button>
                    <button type="button" disabled={!canQuiz || busy} onClick={() => openQuiz(subject, 'post')}>ทดสอบหลังเรียน</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'quiz' && selected && (
          <section className="learn-panel learn-quiz">
            <button className="learn-back" onClick={() => setView('courses')}>← กลับไปบทเรียน</button>
            <h2>{phase === 'pre' ? 'ทดสอบก่อนเรียน' : 'ทดสอบหลังเรียน'}: {selected.title}</h2>
            <p>{phase === 'pre' ? 'คะแนนนี้ไม่มีผลต่อเกียรติบัตร' : 'ผ่านเมื่อได้อย่างน้อย 80% หากยังไม่ผ่านสามารถทำใหม่ได้'}</p>
            {result ? (
              <div className="learn-result" role="status">
                <strong>ได้ {result.score}/{result.total} ข้อ ({result.percent}%)</strong>
                <p>{result.passed ? 'ผ่านเกณฑ์แล้ว กำลังจัดทำและส่งเกียรติบัตรทางอีเมล' :
                  phase === 'pre' ? 'พร้อมเริ่มเรียนได้เลย' : 'ยังไม่ผ่านเกณฑ์ ลองทบทวนแล้วทำใหม่ได้'}</p>
                <button onClick={() => openQuiz(selected, phase)}>ทำแบบทดสอบอีกครั้ง</button>
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
