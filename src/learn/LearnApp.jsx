import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Flag, LoaderCircle, Maximize2, Play } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { lessonCatalog } from './lessonCatalog.js';
import { latestPosition, mediaKey, readLocalPosition, topicMedia, writeLocalPosition } from './mediaSequence.js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storageKey: 'swsc-learner-auth', persistSession: true, detectSessionInUrl: true } });

async function request(body) {
  const { data, error } = await supabase.functions.invoke('learning-v2', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function profileRequestMessage(error) {
  if (/หลักสูตรยังไม่เปิดใช้งาน|Unknown action/i.test(error.message)) {
    return 'ระบบข้อมูลบทเรียนที่เชื่อมอยู่ยังไม่รองรับการบันทึกโปรไฟล์ ต้องอัปเดต Supabase ก่อนจึงจะบันทึกได้';
  }
  return error.message;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [catalog, setCatalog] = useState(lessonCatalog.map(subject => ({
    id: subject.id, ordinal: subject.ordinal, title: subject.title, summary: subject.summary,
    topics: subject.topics.map((title, index) => ({ id: subject.id + '-t' + (index + 1), title })),
  })));
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [progress, setProgress] = useState({});
  const [certificates, setCertificates] = useState([]);
  const [certificatesEnabled, setCertificatesEnabled] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [certificateNameInput, setCertificateNameInput] = useState('');
  const [nameChangeRequest, setNameChangeRequest] = useState(null);
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState(null);
  const [topicIndex, setTopicIndex] = useState(0);
  const [phase, setPhase] = useState('pre');
  const [questions, setQuestions] = useState([]);
  const [quizRevision, setQuizRevision] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [resource, setResource] = useState(null);
  const [pdfResource, setPdfResource] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [mediaIndex, setMediaIndex] = useState(0);
  const [lastPosition, setLastPosition] = useState(null);
  const [resumeEnabled, setResumeEnabled] = useState(false);
  const mediaStart = useRef(null);
  const videoStage = useRef(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') === 'certificates'
    ? 'certificates' : 'courses');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() =>
    new URL(location.href).searchParams.get('error_description') || '');

  const loadMe = useCallback(async () => {
    const data = await request({ action: 'me' });
    setProfile(data.profile);
    setNameInput(data.profile?.full_name || '');
    setPhoneInput(data.profile?.phone || '');
    setCertificateNameInput(data.profile?.certificate_name || '');
    setNameChangeRequest(data.nameChangeRequest);
    setProgress(data.progress || {});
    setLastPosition(data.lastPosition || null);
    setCertificates(data.certificates || []);
    setCertificatesEnabled(Boolean(data.certificatesEnabled));
    setProfileLoaded(true);
    setProfileUnavailable(false);
    if (!data.profile?.full_name || !data.profile?.phone) setView('profile');
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) { setProfile(null); setProfileLoaded(false); setProfileUnavailable(false);
        setProgress({}); setCertificates([]); setLastPosition(null); setView('courses'); }
    });
    request({ action: 'catalog' }).then(data => {
      if (!active) return;
      setPublished(Boolean(data.published));
      setResumeEnabled(data.resumeEnabled === true);
      if (data.published && data.subjects?.length === 5) setCatalog(data.subjects);
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session) Promise.resolve().then(loadMe).catch(error => {
      setProfileLoaded(true);
      setProfileUnavailable(true);
      setView('profile');
      setNotice(profileRequestMessage(error));
    });
  }, [session, loadMe]);
  useEffect(() => {
    if (view === 'topic' && resource) mediaStart.current?.scrollIntoView({ block: 'start' });
  }, [view, resource]);

  async function googleSignIn() {
    setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + import.meta.env.BASE_URL + 'learn/' },
    });
    if (error) { setNotice(error.message); setBusy(false); }
  }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const wasIncomplete = !profile?.full_name || !profile?.phone;
      await request({ action: 'save_profile', fullName: nameInput, phone: phoneInput });
      await loadMe();
      if (wasIncomplete) setView('courses');
      setNotice('บันทึกข้อมูลส่วนตัวแล้ว');
    } catch (error) { setNotice(profileRequestMessage(error)); }
    finally { setBusy(false); }
  }
  async function requestNameChange(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await request({ action: 'request_name_change', fullName: certificateNameInput });
      await loadMe(); setNotice('ส่งคำขอเปลี่ยนชื่อบนเกียรติบัตรแล้ว');
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
  async function saveMediaPosition(subject, activeTopic, item) {
    const position = { subjectId: subject.id, topicId: activeTopic.id,
      resourceKey: mediaKey(item), updatedAt: new Date().toISOString() };
    writeLocalPosition(session?.user.id, position);
    setLastPosition(position);
    if (resumeEnabled) {
      try {
        const saved = await request({ action: 'save_position', ...position });
        const synced = { ...position, updatedAt: saved.updatedAt };
        writeLocalPosition(session?.user.id, synced);
        setLastPosition(synced);
      } catch {
        setNotice('จำตำแหน่งในเครื่องแล้ว แต่ยังบันทึกข้ามอุปกรณ์ไม่ได้ กรุณาลองอีกครั้งเมื่อเชื่อมต่อได้');
      }
    }
  }
  async function showMedia(subject, activeTopic, item, index) {
    if (item.type === 'document') {
      const material = await request({ action: 'material', subjectId: subject.id,
        topicId: activeTopic.id, path: item.path });
      setPdfResource(item); setPdfUrl(material.url);
    } else { setPdfResource(null); setPdfUrl(''); setVideoLoading(true); }
    setResource(item); setMediaIndex(index);
    await saveMediaPosition(subject, activeTopic, item);
  }
  async function openTopic(subject, index, restore = true) {
    setBusy(true); setNotice(''); setResource(null); setPdfResource(null); setPdfUrl('');
    try {
      const data = await request({ action: 'topic', subjectId: subject.id,
        topicId: subject.topics[index].id });
      setSelected(subject); setTopic(data.topic); setTopicIndex(index); setView('topic');
      const media = topicMedia(data.topic);
      const local = readLocalPosition(session?.user.id);
      const saved = restore ? latestPosition(data.position,
        local?.topicId === data.topic.id ? local : null,
        lastPosition?.topicId === data.topic.id ? lastPosition : null) : null;
      const savedIndex = saved ? media.findIndex(item => mediaKey(item) === saved.resourceKey) : -1;
      const nextIndex = savedIndex >= 0 ? savedIndex : 0;
      setMediaIndex(nextIndex);
      if (media[nextIndex]) await showMedia(subject, data.topic, media[nextIndex], nextIndex);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  function openSubject(subject) {
    setSelected(subject);
    if (session && profileLoaded && (!profile?.full_name || !profile?.phone)) {
      setView('profile'); return;
    }
    if (!published || !session || !profile?.phone || !unlocked(subject)) { setView('preview'); return; }
    const progressItem = stateOf(subject);
    if (!progressItem.preCompleted) { openQuiz(subject, 'pre'); return; }
    const saved = latestPosition(lastPosition, readLocalPosition(session?.user.id));
    const savedIndex = saved?.subjectId === subject.id
      ? subject.topics.findIndex(item => item.id === saved.topicId) : -1;
    if (savedIndex >= 0 && subject.topics.slice(0, savedIndex).every(item =>
      progressItem.completedTopicIds.includes(item.id))) { openTopic(subject, savedIndex); return; }
    const next = subject.topics.findIndex(item => !progressItem.completedTopicIds.includes(item.id));
    openTopic(subject, next < 0 ? 0 : next);
  }
  async function completeTopic() {
    setBusy(true); setNotice('');
    try {
      await request({ action: 'complete_topic', subjectId: selected.id, topicId: topic.id });
      await loadMe();
      if (topicIndex + 1 < selected.topics.length) await openTopic(selected, topicIndex + 1, false);
      else setView('subject_done');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function moveMedia(index) {
    const item = topicMedia(topic)[index];
    if (!item || busy) return;
    setBusy(true); setNotice('');
    try {
      await showMedia(selected, topic, item, index);
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
  async function expandVideo() {
    try { await videoStage.current?.requestFullscreen(); }
    catch { setNotice('เปิดเต็มจอไม่ได้ กรุณาใช้ปุ่มเต็มจอภายในวิดีโอ'); }
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

  const savedPosition = latestPosition(lastPosition, readLocalPosition(session?.user.id));
  const current = catalog.find(subject => subject.id === savedPosition?.subjectId && unlocked(subject))
    || catalog.find(subject => unlocked(subject) && stateOf(subject).bestPostScore < 6)
    || catalog[catalog.length - 1];
  const media = topicMedia(topic);
  const videos = media.filter(item => item.type === 'video');
  const videoIndex = resource?.type === 'video' ? videos.findIndex(item => mediaKey(item) === mediaKey(resource)) : -1;
  const needsProfile = Boolean(session && profileLoaded && !profileUnavailable &&
    (!profile?.full_name || !profile?.phone));
  return <div className="learn-app">
    <header className="learn-header">
      <a className="learn-brand" href={import.meta.env.BASE_URL} aria-label="กลับหน้าเว็บหลัก SWSC.OFFICIAL">
        <img src={`${import.meta.env.BASE_URL}all-logos.webp`} alt="ตราโรงเรียนและสภานักเรียน" />
        <span>SWSC.OFFICIAL</span>
      </a>
      <button type="button" className="learn-menu-toggle" aria-expanded={menuOpen}
        aria-controls="learn-navigation" onClick={() => setMenuOpen(value => !value)}>
        <span className="learn-menu-icon" aria-hidden="true"><i /><i /><i /></span>
        เมนู
      </button>
      <nav id="learn-navigation" className={menuOpen ? 'is-open' : ''} aria-label="เมนูบทเรียน">
        <button className={!['certificates', 'profile'].includes(view) ? 'active' : ''}
          aria-current={!['certificates', 'profile'].includes(view) ? 'page' : undefined}
          onClick={() => { setView(needsProfile ? 'profile' : 'courses'); setMenuOpen(false); }}>เส้นทางเรียน</button>
        <button className={view === 'certificates' ? 'active' : ''} aria-current={view === 'certificates' ? 'page' : undefined}
          onClick={() => { setView(needsProfile ? 'profile' : 'certificates'); setMenuOpen(false); }}>เกียรติบัตรของฉัน</button>
        {session && <button className={view === 'profile' ? 'active' : ''}
          aria-current={view === 'profile' ? 'page' : undefined}
          onClick={() => { setView('profile'); setMenuOpen(false); }}>ข้อมูลส่วนตัว</button>}
        {session && <button className="learn-signout" onClick={() => { setMenuOpen(false); supabase.auth.signOut(); }}>ออกจากระบบ</button>}
      </nav>
    </header>
    <main className="learn-main">
      <section className={`learn-hero ${view === 'courses' ? '' : 'learn-hero-compact'}`}><div className="learn-hero-content">
        <div className="learn-eyebrow"><span className="learn-eyebrow-dot" /> SWSC LEARNING · 5 วิชา</div>
        <h1>ถอดรหัสความเป็น<br /><em>พลเมืองคุณภาพ</em></h1>
        <p>เรียนทีละวิชาในเว็บเดียว ทบทวนได้ตามจังหวะของคุณ และรับเกียรติบัตรเมื่อสอบผ่านเกณฑ์</p>
        <div className="learn-hero-rule"><span>6/10 <small>ปลดล็อกวิชาถัดไป</small></span>
          <span>8/10 <small>รับเกียรติบัตร</small></span></div>
      </div><div className="learn-hero-seal" aria-hidden="true"><span>SWSC</span><strong>DNA</strong>
        <small>พลเมืองคุณภาพ</small></div>
      </section>
      {notice && view !== 'profile' && <div className="learn-notice" role="status">{notice}</div>}
      {!published && <div className="learn-panel">หลักสูตรกำลังตรวจเนื้อหาและข้อสอบทั้ง 5 วิชา คุณดูโครงบทได้ก่อนเปิดเรียน</div>}
      {!session && <section className="learn-panel learn-auth"><div>
        <h2>เข้าสู่ระบบด้วย Google</h2><p>{published
          ? 'ใช้อีเมล Google เพื่อบันทึกความคืบหน้าและรับเกียรติบัตร'
          : 'ลงชื่อเข้าใช้ไว้ก่อนได้ เมื่อผู้ดูแลตรวจบทเรียนครบจึงจะเริ่มเรียนได้'}</p>
      </div><button disabled={busy} onClick={googleSignIn}>เข้าสู่ระบบด้วย Google</button></section>}
      {session && !published && <div className="learn-panel">เข้าสู่ระบบแล้วด้วย {session.user.email} ·
        หลักสูตรจะเปิดหลังผู้ดูแลตรวจเนื้อหาและข้อสอบครบ</div>}
      {view === 'profile' && session && <section className="learn-section learn-profile-section">
        <div className="learn-section-heading"><div><div className="learn-section-kicker">บัญชีผู้เรียน</div>
          <h2>ข้อมูลส่วนตัว</h2></div></div>
        {notice && <div className="learn-notice" role="status">{notice}</div>}
        {needsProfile && <div className="learn-profile-required" role="status">
          <span aria-hidden="true">✦</span><div><strong>กรอกข้อมูลก่อนเริ่มเรียน</strong>
            <p>ระบุชื่อและเบอร์มือถือให้ครบ แล้วระบบจะพากลับไปเส้นทางเรียน</p></div></div>}
        <div className="learn-profile-layout"><div className="learn-panel learn-profile-card">
        <div className="learn-profile-card-head"><span className="learn-profile-icon" aria-hidden="true">✦</span>
          <div><h3>ข้อมูลสำหรับการเรียน</h3><p>แก้ชื่อและเบอร์มือถือได้ทุกเมื่อ</p></div></div>
        <div className="learn-readonly-field"><span>อีเมล Google</span><strong>{session.user.email}</strong>
          <small>ใช้สำหรับเข้าสู่ระบบและรับเกียรติบัตร · เปลี่ยนไม่ได้</small></div>
        <form onSubmit={saveProfile} className="learn-profile-form">
          <label htmlFor="profile-name">ชื่อและนามสกุล</label>
          <input id="profile-name" value={nameInput} required minLength={2} maxLength={120}
            autoFocus={!profile?.full_name}
            onChange={event => setNameInput(event.target.value)} />
          <label htmlFor="profile-phone">เบอร์มือถือไทย 10 หลัก</label>
          <input id="profile-phone" value={phoneInput} required inputMode="numeric" pattern="0[689][0-9]{8}"
            maxLength={10} autoFocus={Boolean(profile?.full_name && !profile?.phone)}
            onChange={event => setPhoneInput(event.target.value)} />
          <button disabled={busy}>บันทึกข้อมูลส่วนตัว</button>
        </form></div>
        <aside className="learn-profile-aside"><div className="learn-panel learn-certificate-note">
          <span className="learn-note-icon" aria-hidden="true">✦</span>
          <h3>ชื่อบนเกียรติบัตร</h3>
          <p>{profile?.certificate_name || 'ระบบจะใช้ชื่อที่คุณกรอกเมื่อออกเกียรติบัตรใบแรก'}</p>
          <small>{profile?.certificate_name ? 'ชื่อนี้ถูกตรึงไว้ การแก้ชื่อในข้อมูลส่วนตัวจะไม่เปลี่ยนใบที่ออกแล้ว' :
            'ตรวจชื่อให้ถูกต้องก่อนสอบผ่านเกณฑ์รับใบแรก'}</small>
          {profile?.certificate_name && <button onClick={() => setView('certificates')}>ดูเกียรติบัตรและคำขอเปลี่ยนชื่อ →</button>}
        </div></aside></div>
      </section>}

      {view === 'courses' && <section className="learn-section">
        <div className="learn-section-heading"><div><div className="learn-section-kicker">COURSE JOURNEY</div>
          <h2>เส้นทางเรียน 5 วิชา</h2></div><span>เรียนตามลำดับ</span></div>
        {session && profile?.phone && published && current && <button className="learn-continue"
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
            </div><button disabled={busy || (published && session && profile?.phone && locked)}
              onClick={() => openSubject(subject)}>{!published || !session || !profile?.phone ? 'ดูโครงบท' :
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
          !profile?.phone ? 'กรอกชื่อและเบอร์มือถือก่อนเริ่มเรียน' : 'ผ่านวิชาก่อนหน้าให้ได้อย่างน้อย 6/10'}</p>
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
            <div ref={mediaStart} className="learn-media-heading" aria-live="polite">
              <div className="learn-media-heading-label"><span className="learn-media-kind" aria-hidden="true">
                {resource?.type === 'video' ? <Play size={18} /> : <BookOpen size={18} />}</span>
                <span>{resource?.type === 'video'
              ? `วิดีโอ ${videoIndex + 1} จาก ${videos.length}`
              : `สไลด์ ${mediaIndex + 1} จาก ${media.filter(item => item.type === 'document').length || 1}`}</span></div>
              <small>สื่อ {mediaIndex + 1} / {media.length || 1}</small>
              <div className="learn-media-track" role="progressbar" aria-label="ตำแหน่งสื่อในหัวข้อ"
                aria-valuemin={1} aria-valuemax={media.length || 1} aria-valuenow={mediaIndex + 1}>
                <div style={{ width: `${((mediaIndex + 1) / (media.length || 1)) * 100}%` }} /></div></div>
            <div className="learn-media-stage" key={resource ? mediaKey(resource) : topic.id}>
            {!resource && media.length > 0 && <div className="learn-media-loading" role="status">
              {busy ? 'กำลังเปิดสื่อ…' : <button type="button" onClick={() => moveMedia(mediaIndex)}>ลองเปิดสื่ออีกครั้ง</button>}
            </div>}
            {resource?.type !== 'video' && <p className="learn-reading-note">อ่านสไลด์ต้นฉบับ แล้วกดต่อไปเพื่อดูวิดีโอในหัวข้อนี้</p>}
            {resource?.type !== 'video' && (topic.blocks || []).filter(block => block.type !== 'page').map((block, index) => <Block key={topic.id + '-' + index}
              subjectId={selected.id} topicId={topic.id} block={block} />)}
            {media.length === 0 && (topic.blocks || []).filter(block => block.type === 'page').map((block, index) =>
              <Block key={topic.id + '-page-' + index} subjectId={selected.id} topicId={topic.id} block={block} />)}
            {pdfUrl && pdfResource && <div className="learn-viewer learn-pdf-viewer">
              <div className="learn-pdf-head"><strong>{pdfResource.title}</strong>
                <div><a href={pdfUrl + '#page=' + (pdfResource.startPage || 1)} target="_blank" rel="noopener noreferrer">ขยายเต็มจอ ↗</a>
                  <a href={pdfUrl + '&download=' + encodeURIComponent(pdfResource.title + '.pdf')}>ดาวน์โหลด PDF ↓</a></div></div>
              {pdfResource.toc?.length > 0 && <nav className="learn-pdf-toc" aria-label="สารบัญเอกสาร">
                {pdfResource.toc.map((item, index) => <a key={index}
                  href={pdfUrl + '#page=' + item.page} target="learn-pdf-frame">{item.title}</a>)}
              </nav>}
              <iframe key={pdfUrl + pdfResource.startPage} name="learn-pdf-frame" title={pdfResource.title}
                src={pdfUrl + '#page=' + (pdfResource.startPage || 1)} />
              <p>หากเครื่องของคุณไม่แสดง PDF ในกรอบ ให้กด “ขยายเต็มจอ”</p>
            </div>}
            {resource?.type === 'video' && <div className="learn-viewer learn-video-viewer">
              <div className="learn-video-caption"><span className="learn-video-caption-kicker">พลเมือง DNA · วิดีโอประกอบบทเรียน</span>
                <h3>{resource.title}</h3></div>
              <div className="learn-video-screen" ref={videoStage}>
                {videoLoading && <div className="learn-video-loading" role="status"><LoaderCircle size={26} />
                  <span>กำลังเปิดวิดีโอ…</span></div>}
                <iframe key={resource.videoId} title={resource.title}
                  src={'https://www.youtube-nocookie.com/embed/' + resource.videoId +
                    '?playsinline=1&rel=0&origin=' + encodeURIComponent(location.origin)}
                  onLoad={() => setVideoLoading(false)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
              <div className="learn-video-tools"><span>กดเล่นในกรอบ หรือใช้ปุ่มเต็มจอในวิดีโอ</span>
                {typeof document.documentElement.requestFullscreen === 'function' &&
                  <button type="button" className="learn-video-fullscreen" onClick={expandVideo}>
                    <Maximize2 size={16} aria-hidden="true" /> ขยายเต็มจอ</button>}
                <button type="button" className="learn-video-report" onClick={reportVideo} disabled={busy}>
                  <Flag size={15} aria-hidden="true" /> แจ้งวิดีโอมีปัญหา</button></div>
            </div>}
            </div>
            {media[mediaIndex + 1] && <p className="learn-media-up-next"><span>ถัดไป</span> {media[mediaIndex + 1].title}</p>}
            <div className="learn-media-navigation">
              <button type="button" className="learn-media-previous" disabled={busy || mediaIndex === 0}
                onClick={() => moveMedia(mediaIndex - 1)}><ArrowLeft size={18} aria-hidden="true" /> ก่อนหน้า</button>
              {mediaIndex + 1 < media.length
                ? <button type="button" disabled={busy} onClick={() => moveMedia(mediaIndex + 1)}>
                  {resource?.type === 'document' && media[mediaIndex + 1]?.type === 'video' ? 'ไปดูวิดีโอ' : 'ต่อไป'}
                  <ArrowRight size={18} aria-hidden="true" /></button>
                : <button type="button" disabled={busy} onClick={completeTopic}>
                  <Check size={18} aria-hidden="true" /> จบหัวข้อนี้และไปต่อ</button>}
            </div>
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
        <div className="learn-section-heading"><div><div className="learn-section-kicker">MY CERTIFICATES</div>
          <h2>เกียรติบัตรของฉัน</h2></div></div>
        {!session && <div className="learn-panel">เข้าสู่ระบบด้วย Google เพื่อดูเกียรติบัตร</div>}
        {session && certificates.length === 0 && <div className="learn-panel">
          {certificatesEnabled ? 'ยังไม่มีเกียรติบัตรจากหลักสูตรนี้' :
            'หากสอบผ่าน 8/10 ระบบจะบันทึกสิทธิ์ไว้ และออกใบเมื่อแบบใบที่เซ็นพร้อม'}</div>}
        <div className="learn-grid">{certificates.map(certificate => <article className="learn-card" key={certificate.id}>
          <div className="learn-number">{certificate.certificate_number}</div>
          <h3>{catalog.find(item => item.id === certificate.subject_id)?.title}</h3>
          <p>ชื่อผู้รับ: {certificate.recipient_name}</p>
          <p>วันที่ออก: {new Date(certificate.issued_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
          <p>สถานะอีเมล: {certificate.email_status === 'sent' ? 'ส่งแล้ว' :
            certificate.email_status === 'failed' ? 'ส่งไม่สำเร็จ กรุณากดส่งอีเมลอีกครั้ง' : 'กำลังดำเนินการ'}</p>
          <div className="learn-card-actions"><button disabled={!certificate.downloadable}
            onClick={() => downloadCertificate(certificate.id)}>ดาวน์โหลด PDF</button>
            <button disabled={busy || !certificate.downloadable}
              onClick={() => resendCertificate(certificate.id)}>ส่งอีเมลอีกครั้ง</button></div>
        </article>)}</div>
        {session && profile?.certificate_name && <div className="learn-panel learn-name-change">
          <div className="learn-name-change-heading"><span className="learn-note-icon" aria-hidden="true">✦</span>
            <h3>ขอเปลี่ยนชื่อบนเกียรติบัตร</h3></div>
          <p>ชื่อที่ใช้อยู่: {profile.certificate_name} · เมื่ออนุมัติ ระบบจะยกเลิกเลขใบเดิมและออกใบใหม่ทุกวิชา</p>
          {profile.reissue_used_at ? <p>ใช้สิทธิ์เปลี่ยนชื่อแล้ว</p> :
            nameChangeRequest?.status === 'pending' ? <p>คำขอชื่อ “{nameChangeRequest.requested_name}” รอผู้ดูแลพิจารณา</p> :
              <form className="learn-profile-form" onSubmit={requestNameChange}>
                {nameChangeRequest?.status === 'rejected' && <p>คำขอก่อนหน้าถูกปฏิเสธ{ nameChangeRequest.admin_note ? `: ${nameChangeRequest.admin_note}` : ''} คุณส่งใหม่ได้</p>}
                <label htmlFor="certificate-new-name">ชื่อใหม่บนเกียรติบัตร</label>
                <input id="certificate-new-name" required minLength={2} maxLength={120}
                  value={certificateNameInput} onChange={event => setCertificateNameInput(event.target.value)} />
                <button disabled={busy || certificateNameInput.trim() === profile.certificate_name}>ส่งคำขอ</button>
              </form>}
        </div>}
      </section>}
    </main>
  </div>;
}
