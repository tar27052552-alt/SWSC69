import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { lessonCatalog } from './lessonCatalog.js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storageKey: 'swsc-learner-auth', persistSession: true, detectSessionInUrl: true } });
const oldCertificatesUrl = 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/สืบค้นเกียรติบัตร';

async function request(body) {
  const { data, error } = await supabase.functions.invoke('learning-v2', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function PrivateImage({ subjectId, topicId, block }) {
  const [url, setUrl] = useState('');
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    let active = true;
    request({ action: 'material', subjectId, topicId, path: block.path })
      .then(data => { if (active) setUrl(data.url); }).catch(() => {});
    return () => { active = false; };
  }, [subjectId, topicId, block.path]);
  return url ? <figure className={'learn-page-image' + (zoomed ? ' zoomed' : '')}>
    <button type="button" onClick={() => setZoomed(value => !value)}
      aria-pressed={zoomed}>{zoomed ? 'ย่อหน้าเอกสาร' : 'ขยายหน้าเอกสาร'}</button>
    <div className="learn-page-image-scroll"><img src={url}
      alt={block.alt || 'ภาพประกอบบทเรียน'} loading="lazy" /></div>
    {block.caption && <figcaption>{block.caption}</figcaption>}</figure>
    : <p>กำลังโหลดภาพประกอบ…</p>;
}

function Block({ subjectId, topicId, block }) {
  if (block.type === 'heading') return <h3>{block.text}</h3>;
  if (block.type === 'paragraph') return <p className="learn-topic-paragraph">{block.text}</p>;
  if (block.type === 'image') return <PrivateImage subjectId={subjectId} topicId={topicId} block={block} />;
  if (block.type === 'page') return <section className="learn-source-page">
    <h3>{block.title || 'หน้า ' + block.pageNumber}</h3>
    {block.text && <p className="learn-topic-paragraph">{block.text}</p>}
    {block.imagePath && (block.text ? <details><summary>ดูหน้าต้นฉบับและภาพประกอบ</summary>
      <PrivateImage subjectId={subjectId} topicId={topicId}
        block={{ path: block.imagePath, alt: block.title }} /></details> :
      <PrivateImage subjectId={subjectId} topicId={topicId}
        block={{ path: block.imagePath, alt: block.title }} />)}
  </section>;
  if (block.type === 'table') return <div className="learn-table-scroll"><table><tbody>
    {(block.rows || []).map((row, index) => <tr key={index}>
      {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
  </tbody></table></div>;
  return null;
}

export default function LearnApp() {
  const [session, setSession] = useState(null);
  const [published, setPublished] = useState(false);
  const [catalog, setCatalog] = useState(lessonCatalog.map(subject => ({
    id: subject.id, ordinal: subject.ordinal, title: subject.title, summary: subject.summary,
    topics: subject.topics.map((title, index) => ({ id: subject.id + '-t' + (index + 1), title })),
  })));
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState({});
  const [certificates, setCertificates] = useState([]);
  const [certificatesEnabled, setCertificatesEnabled] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState(null);
  const [topicIndex, setTopicIndex] = useState(0);
  const [phase, setPhase] = useState('pre');
  const [questions, setQuestions] = useState([]);
  const [quizRevision, setQuizRevision] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [resource, setResource] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') === 'certificates'
    ? 'certificates' : 'courses');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() =>
    new URL(location.href).searchParams.get('error_description') || '');

  const loadMe = useCallback(async () => {
    const data = await request({ action: 'me' });
    setProfile(data.profile);
    setProgress(data.progress || {});
    setCertificates(data.certificates || []);
    setCertificatesEnabled(Boolean(data.certificatesEnabled));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) { setProfile(null); setProgress({}); setCertificates([]); setView('courses'); }
    });
    request({ action: 'catalog' }).then(data => {
      if (!active) return;
      setPublished(Boolean(data.published));
      if (data.published && data.subjects?.length === 5) setCatalog(data.subjects);
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session && published) Promise.resolve().then(loadMe).catch(error => setNotice(error.message));
  }, [session, published, loadMe]);

  async function googleSignIn() {
    setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + import.meta.env.BASE_URL + 'learn/' },
    });
    if (error) { setNotice(error.message); setBusy(false); }
  }
  async function saveName(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const data = await request({ action: 'save_name', fullName: nameInput });
      setProfile({ full_name: data.fullName });
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  const stateOf = subject => progress[subject.id] ||
    { preCompleted: false, bestPostScore: -1, completedTopicIds: [] };
  const unlocked = subject => subject.ordinal === 1 ||
    (progress['civic-' + (subject.ordinal - 1)]?.bestPostScore ?? -1) >= 6;

  async function openQuiz(subject, nextPhase) {
    setBusy(true); setNotice('');
    try {
      const data = await request({ action: 'quiz', subjectId: subject.id, phase: nextPhase });
      setSelected(subject); setPhase(nextPhase); setQuestions(data.questions);
      setQuizRevision(data.revision);
      setAnswers({}); setResult(null); setView('quiz');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function openTopic(subject, index) {
    setBusy(true); setNotice(''); setResource(null); setPdfUrl('');
    try {
      const data = await request({ action: 'topic', subjectId: subject.id,
        topicId: subject.topics[index].id });
      setSelected(subject); setTopic(data.topic); setTopicIndex(index); setView('topic');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  function openSubject(subject) {
    setSelected(subject);
    if (!published || !session || !profile || !unlocked(subject)) { setView('preview'); return; }
    const progressItem = stateOf(subject);
    if (!progressItem.preCompleted) { openQuiz(subject, 'pre'); return; }
    const next = subject.topics.findIndex(item => !progressItem.completedTopicIds.includes(item.id));
    openTopic(subject, next < 0 ? 0 : next);
  }
  async function completeTopic() {
    setBusy(true); setNotice('');
    try {
      await request({ action: 'complete_topic', subjectId: selected.id, topicId: topic.id });
      await loadMe();
      if (topicIndex + 1 < selected.topics.length) await openTopic(selected, topicIndex + 1);
      else setView('subject_done');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function openResource(item) {
    if (item.type === 'video') { setResource(item); setPdfUrl(''); return; }
    setBusy(true); setNotice('');
    try {
      const data = await request({ action: 'material', subjectId: selected.id,
        topicId: topic.id, path: item.path });
      setResource(item); setPdfUrl(data.url);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function reportVideo() {
    setBusy(true); setNotice('');
    try {
      await request({ action: 'report_media', subjectId: selected.id,
        topicId: topic.id, videoId: resource.videoId });
      setNotice('ส่งรายการวิดีโอให้ผู้ดูแลตรวจสอบแล้ว');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function submitQuiz(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      setResult(await request({ action: 'submit', subjectId: selected.id, phase,
        revision: quizRevision, answers }));
      await loadMe();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function downloadCertificate(id) {
    try {
      const data = await request({ action: 'download', certificateId: id });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) { setNotice(error.message); }
  }
  async function resendCertificate(id) {
    setBusy(true);
    try { await request({ action: 'resend', certificateId: id }); setNotice('เพิ่มเกียรติบัตรเข้าคิวส่งแล้ว'); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  const current = catalog.find(subject => unlocked(subject) && stateOf(subject).bestPostScore < 6)
    || catalog[catalog.length - 1];
  return <div className="learn-app">
    <header className="learn-header">
      <a className="learn-brand" href={import.meta.env.BASE_URL}><span>SWSC</span><small>พลเมือง DNA</small></a>
      <nav aria-label="เมนูบทเรียน">
        <button onClick={() => setView('courses')}>เส้นทางเรียน</button>
        <button onClick={() => setView('certificates')}>เกียรติบัตรของฉัน</button>
        {session && <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>}
      </nav>
    </header>
    <main className="learn-main">
      <section className="learn-hero"><div className="learn-eyebrow">หลักสูตรออนไลน์ · 5 วิชา</div>
        <h1>ถอดรหัสความเป็นพลเมืองคุณภาพ</h1>
        <p>เริ่มจากข้อสอบก่อนเรียน อ่านทีละหัวข้อ แล้วทำข้อสอบหลังเรียนให้ได้ 6/10 เพื่อไปต่อ หรือ 8/10 เพื่อรับเกียรติบัตร</p>
      </section>
      {notice && <div className="learn-notice" role="status">{notice}</div>}
      {!published && <div className="learn-panel">หลักสูตรกำลังตรวจเนื้อหาและข้อสอบทั้ง 5 วิชา คุณดูโครงบทได้ก่อนเปิดเรียน</div>}
      {!session && <section className="learn-panel learn-auth"><div>
        <h2>เข้าสู่ระบบด้วย Google</h2><p>{published
          ? 'ใช้อีเมล Google เพื่อบันทึกความคืบหน้าและรับเกียรติบัตร'
          : 'ลงชื่อเข้าใช้ไว้ก่อนได้ เมื่อผู้ดูแลตรวจบทเรียนครบจึงจะเริ่มเรียนได้'}</p>
      </div><button disabled={busy} onClick={googleSignIn}>เข้าสู่ระบบด้วย Google</button></section>}
      {session && !published && <div className="learn-panel">เข้าสู่ระบบแล้วด้วย {session.user.email} ·
        หลักสูตรจะเปิดหลังผู้ดูแลตรวจเนื้อหาและข้อสอบครบ</div>}
      {session && published && !profile && <section className="learn-panel learn-auth"><div>
        <h2>ชื่อจริงสำหรับเกียรติบัตร</h2><p>กรอกชื่อและนามสกุลให้ตรงกับที่ต้องการแสดงบนใบ</p>
      </div><form onSubmit={saveName}><label htmlFor="learner-name">ชื่อและนามสกุล</label>
        <input id="learner-name" value={nameInput} required minLength={2} maxLength={120}
          onChange={event => setNameInput(event.target.value)} />
        <button disabled={busy}>บันทึกชื่อ</button></form></section>}

      {view === 'courses' && <section className="learn-section">
        <div className="learn-section-heading"><h2>เส้นทางเรียน 5 วิชา</h2><span>เรียนตามลำดับ</span></div>
        {session && profile && published && current && <button className="learn-continue"
          onClick={() => openSubject(current)}>กลับมาเรียนต่อ: วิชาที่ {current.ordinal} →</button>}
        <div className="learn-course-list">{catalog.map(subject => {
          const item = stateOf(subject);
          const locked = !unlocked(subject);
          return <article className="learn-course" key={subject.id}>
            <div className="learn-course-index">{subject.ordinal}</div>
            <div className="learn-course-info"><div className="learn-number">วิชาที่ {subject.ordinal} · {
              !published ? 'รอเปิดเรียน' : locked ? 'ยังไม่ปลดล็อก' :
              item.bestPostScore >= 8 ? 'ผ่านเกณฑ์เกียรติบัตร' :
              item.bestPostScore >= 6 ? 'ผ่านวิชาแล้ว' :
              item.preCompleted ? 'เรียนแล้ว ' + item.completedTopicIds.length + '/4 หัวข้อ' : 'ยังไม่เริ่ม'
            }</div><h3>{subject.title}</h3><p>{subject.summary}</p>
              {item.bestPostScore >= 0 && <small>คะแนนสูงสุด {item.bestPostScore}/10</small>}
            </div><button disabled={busy || (published && session && profile && locked)}
              onClick={() => openSubject(subject)}>{!published || !session || !profile ? 'ดูโครงบท' :
                locked ? 'ล็อกอยู่' : 'เข้าเรียน →'}</button>
          </article>;
        })}</div>
      </section>}

      {view === 'preview' && selected && <section className="learn-section learn-lesson">
        <button className="learn-back" onClick={() => setView('courses')}>← กลับ</button>
        <div className="learn-number">วิชาที่ {selected.ordinal}</div><h2>{selected.title}</h2><p>{selected.summary}</p>
        <h3>หัวข้อในวิชานี้</h3><ol>{selected.topics.map(item => <li key={item.id}>{item.title}</li>)}</ol>
        <p>{!published ? 'หลักสูตรยังอยู่ระหว่างตรวจเนื้อหา' :
          !session ? 'เข้าสู่ระบบด้วย Google เพื่อเรียนเนื้อหา' :
          !profile ? 'กรอกชื่อจริงก่อนเริ่มเรียน' : 'ผ่านวิชาก่อนหน้าให้ได้อย่างน้อย 6/10'}</p>
      </section>}

      {view === 'topic' && selected && topic && <section className="learn-section learn-lesson learn-reading">
        <button className="learn-back" onClick={() => setView('courses')}>← เส้นทางเรียน</button>
        <div className="learn-number">วิชาที่ {selected.ordinal} · หัวข้อ {topicIndex + 1} จาก {selected.topics.length}</div>
        <h2>{topic.title}</h2><p>{selected.title}</p>
        <div className="learn-topic-layout"><aside className="learn-topic-toc" aria-label="สารบัญวิชา">
          <strong>สารบัญวิชา</strong>{selected.topics.map((item, index) => {
            const available = index === 0 || selected.topics.slice(0, index).every(previous =>
              stateOf(selected).completedTopicIds.includes(previous.id));
            return <button key={item.id} disabled={!available || busy}
              className={index === topicIndex ? 'active' : ''}
              onClick={() => openTopic(selected, index)}>{index + 1}. {item.title}</button>;
          })}</aside><div className="learn-topic-body">
            {(topic.blocks || []).map((block, index) => <Block key={topic.id + '-' + index}
              subjectId={selected.id} topicId={topic.id} block={block} />)}
            {(topic.resources || []).length > 0 && <div className="learn-material"><h3>สื่อประกอบหัวข้อนี้</h3>
              <div className="learn-resource-list">{topic.resources.map((item, index) =>
                <button key={item.type + index} onClick={() => openResource(item)}>
                  {item.type === 'video' ? '▶' : '▤'} {item.title}</button>)}</div></div>}
            {resource?.type === 'video' && <div className="learn-viewer"><strong>{resource.title}</strong>
              <iframe title={resource.title}
                src={'https://www.youtube-nocookie.com/embed/' + resource.videoId}
                loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              <button type="button" onClick={reportVideo} disabled={busy}>
                แจ้งผู้ดูแลว่าวิดีโอเปิดไม่ได้</button>
            </div>}
            {resource?.type === 'document' && pdfUrl && <div className="learn-viewer">
              <strong>{resource.title}</strong>
              {resource.toc?.length > 0 && <nav className="learn-pdf-toc" aria-label="สารบัญเอกสาร">
                {resource.toc.map((item, index) => <a key={index}
                  href={pdfUrl + '#page=' + item.page} target="learn-pdf-frame">{item.title}</a>)}
              </nav>}
              <iframe name="learn-pdf-frame" title={resource.title} src={pdfUrl} />
              <a href={pdfUrl} download>ดาวน์โหลด PDF</a>
            </div>}
            <div className="learn-lesson-footer"><p>อ่านและดูสื่อในหัวข้อนี้แล้ว กดเพื่อไปหัวข้อถัดไป</p>
              <button disabled={busy} onClick={completeTopic}>เรียนหัวข้อนี้จบแล้ว →</button></div>
          </div></div>
      </section>}

      {view === 'subject_done' && selected && <section className="learn-panel learn-quiz">
        <div className="learn-number">เรียนครบ 4 หัวข้อ</div><h2>{selected.title}</h2>
        <p>พร้อมทำแบบทดสอบหลังเรียน 10 ข้อแล้ว ทำซ้ำได้หากต้องการเพิ่มคะแนน</p>
        <button onClick={() => openQuiz(selected, 'post')}>ทำแบบทดสอบหลังเรียน →</button>
      </section>}
      {view === 'quiz' && selected && <section className="learn-panel learn-quiz">
        <button className="learn-back" onClick={() => setView('courses')}>← เส้นทางเรียน</button>
        <h2>{phase === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'} · {selected.title}</h2>
        <p>{phase === 'pre' ? '10 ข้อ · คะแนนนี้ไม่ใช้ตัดสินผล' :
          '6/10 เปิดวิชาถัดไป · 8/10 ได้สิทธิ์เกียรติบัตร · สอบซ้ำได้'}</p>
        {result ? <div className="learn-result" role="status"><strong>ได้ {result.score}/10 ข้อ</strong>
          <p>{phase === 'pre' ? 'ทำก่อนเรียนครบแล้ว เริ่มหัวข้อแรกได้' :
            result.passed ? result.certificatePending ?
              'ผ่านเกณฑ์แล้ว ระบบจะออกใบให้เมื่อแบบใบที่เซ็นพร้อม' :
              'ผ่านเกณฑ์เกียรติบัตรแล้ว' : result.unlockedNext ?
                'ไปวิชาถัดไปได้ และกลับมาสอบซ้ำเพื่อรับเกียรติบัตรได้' :
                'ทบทวนบทเรียนแล้วสอบซ้ำได้'}</p>
          <div className="learn-result-actions"><button onClick={() => openTopic(selected, 0)}>กลับไปบทเรียน</button>
            {phase === 'post' && <button onClick={() => openQuiz(selected, 'post')}>สอบซ้ำ</button>}
            {phase === 'post' && result.unlockedNext && catalog[selected.ordinal] &&
              <button onClick={() => openSubject(catalog[selected.ordinal])}>ไปวิชาที่ {selected.ordinal + 1}</button>}
          </div></div> : <form onSubmit={submitQuiz}>{questions.map((question, index) =>
          <fieldset key={question.id}><legend>{index + 1}. {question.prompt}</legend>
            {question.options.map((option, optionIndex) => <label key={optionIndex} className="learn-answer">
              <input type="radio" name={question.id} required checked={answers[question.id] === optionIndex}
                onChange={() => setAnswers(previous => ({ ...previous, [question.id]: optionIndex }))} />
              <span>{option}</span></label>)}</fieldset>)}
          <button disabled={busy || Object.keys(answers).length !== questions.length}>ส่งคำตอบ</button>
        </form>}
      </section>}

      {view === 'certificates' && <section className="learn-section">
        <div className="learn-section-heading"><h2>เกียรติบัตรของฉัน</h2></div>
        {!session && <div className="learn-panel">เข้าสู่ระบบด้วย Google เพื่อดูเกียรติบัตร</div>}
        {session && certificates.length === 0 && <div className="learn-panel">
          {certificatesEnabled ? 'ยังไม่มีเกียรติบัตรจากหลักสูตรนี้' :
            'หากสอบผ่าน 8/10 ระบบจะบันทึกสิทธิ์ไว้ และออกใบเมื่อแบบใบที่เซ็นพร้อม'}</div>}
        <div className="learn-grid">{certificates.map(certificate => <article className="learn-card" key={certificate.id}>
          <div className="learn-number">{certificate.certificate_number}</div>
          <h3>{catalog.find(item => item.id === certificate.subject_id)?.title}</h3>
          <p>ชื่อผู้รับ: {certificate.recipient_name}</p>
          <p>วันที่ออก: {new Date(certificate.issued_at).toLocaleDateString('th-TH')}</p>
          <p>สถานะอีเมล: {certificate.email_status === 'sent' ? 'ส่งแล้ว' : 'กำลังดำเนินการ'}</p>
          <div className="learn-card-actions"><button disabled={!certificate.downloadable}
            onClick={() => downloadCertificate(certificate.id)}>ดาวน์โหลด PDF</button>
            <button disabled={busy || !certificate.downloadable}
              onClick={() => resendCertificate(certificate.id)}>ส่งอีเมลอีกครั้ง</button></div>
        </article>)}</div>
        <p className="learn-old-cert">เกียรติบัตรจากเว็บเดิม: <a href={oldCertificatesUrl}
          target="_blank" rel="noreferrer">ระบบค้นหาเดิม ↗</a></p>
      </section>}
    </main>
  </div>;
}
