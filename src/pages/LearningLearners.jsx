import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

async function adminRequest(body) {
  const { data, error } = await supabase.functions.invoke('learning-admin', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const dateText = value => value ? new Date(value).toLocaleString('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
}) : '—';

function scoreText(progress) {
  if (progress.bestPostScore >= 0) return `${progress.bestPostScore}/10`;
  return progress.preCompleted ? 'กำลังเรียน' : 'ยังไม่เริ่ม';
}

export default function LearningLearners() {
  const [summary, setSummary] = useState(null);
  const [roster, setRoster] = useState({ rows: [], total: 0 });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    adminRequest({ action: 'learner_overview' }).then(result => {
      if (active) setSummary(result.summary);
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [refreshKey]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    adminRequest({ action: 'learner_roster', search: query, filterSubject: subject, status, page })
      .then(result => { if (active) setRoster(result.roster || { rows: [], total: 0 }); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, subject, status, page, refreshKey]);

  async function openLearner(userId) {
    if (selected?.userId === userId) { setSelected(null); return; }
    setDetailLoading(true);
    setError('');
    try {
      const result = await adminRequest({ action: 'learner_detail', userId });
      setSelected(result.learner);
    } catch (cause) { setError(cause.message); }
    finally { setDetailLoading(false); }
  }

  const pageCount = Math.max(1, Math.ceil(roster.total / 20));
  return <section className="learning-learners" aria-label="ติดตามผู้เรียน">
    <div className="learning-learners-heading"><div><h2>ติดตามผู้เรียน</h2>
      <p>ข้อมูลของหลักสูตรพลเมือง DNA · เวลาที่แสดงเป็นเวลาไทย</p></div>
      <button type="button" onClick={() => setRefreshKey(value => value + 1)}>รีเฟรชข้อมูล</button></div>
    {error && <p className="learning-learners-error" role="alert">{error}</p>}
    <div className="learning-learners-stats">
      {[['ผู้เรียนทั้งหมด', summary?.learners], ['เริ่มเรียนแล้ว', summary?.started],
        ['ผ่านครบ 5 วิชา', summary?.completed], ['ถึงเกณฑ์รับใบอย่างน้อย 1 วิชา', summary?.eligible]]
        .map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}
    </div>
    <div className="learning-learners-subjects">
      {(summary?.subjects || []).map(item => <div key={item.id}><strong>วิชาที่ {item.ordinal} · {item.title}</strong>
        <span>เริ่ม {item.started} · ผ่าน 6/10 {item.passed} · ถึง 8/10 {item.eligible}</span></div>)}
    </div>
    <div className="learning-learners-filters">
      <label>ค้นหาชื่อ อีเมล หรือเบอร์โทร
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="พิมพ์คำค้นหา" /></label>
      <label>รายวิชา<select value={subject} onChange={event => { setSubject(event.target.value); setPage(1); }}>
        <option value="">ทุกวิชา</option>
        {(summary?.subjects || []).map(item => <option key={item.id} value={item.id}>
          วิชาที่ {item.ordinal} · {item.title}</option>)}
      </select></label>
      <label>สถานะ<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">ทั้งหมด</option><option value="not_started">ยังไม่เริ่ม</option>
        <option value="learning">กำลังเรียน / ยังไม่ผ่าน</option>
        <option value="passed">ผ่านอย่างน้อย 6/10</option>
        <option value="eligible">ถึงเกณฑ์ 8/10</option>
      </select></label>
    </div>
    <p className="learning-learners-count">{loading ? 'กำลังโหลด…' : `พบ ${roster.total} คน`}</p>
    <div className="learning-learners-list">
      {!loading && roster.rows.length === 0 && <p className="learning-learners-empty">ไม่พบผู้เรียนตามตัวกรองนี้</p>}
      {roster.rows.map(item => <article key={item.user_id} className="learning-learner-row">
        <div className="learning-learner-name"><strong>{item.full_name}</strong><span>{item.email}</span>
          <small>กิจกรรมล่าสุดที่บันทึก {dateText(item.last_activity)}</small></div>
        <div className="learning-learner-progress"><span>ผ่าน {item.passed_subjects}/5 วิชา</span>
          <small>ถึงเกณฑ์ใบ {item.eligible_subjects} วิชา</small></div>
        <button type="button" disabled={detailLoading} onClick={() => openLearner(item.user_id)}>
          {selected?.userId === item.user_id ? 'ปิดรายละเอียด' : 'ดูรายละเอียด'}</button>
        {selected?.userId === item.user_id && <div className="learning-learner-detail">
          <div className="learning-learner-contact"><span>เบอร์โทร {selected.phone || '—'}</span>
            <span>เริ่มใช้หลักสูตร {dateText(selected.enrolledAt)}</span></div>
          <div className="learning-learner-subject-grid">{item.progress.map(progress => <div key={progress.subjectId}>
            <strong>วิชาที่ {progress.ordinal} · {progress.title}</strong>
            <span>ก่อนเรียน {progress.preCompleted ? 'ทำแล้ว' : 'ยังไม่ทำ'} · หัวข้อ {progress.completedTopics}/4</span>
            <span>หลังเรียน {scoreText(progress)} · สอบ {progress.postAttempts} ครั้ง</span>
          </div>)}</div>
          <details><summary>ประวัติคะแนนและหัวข้อที่จบ</summary>
            <div className="learning-learner-history"><div><h4>การสอบ</h4>
              {selected.attempts.length ? selected.attempts.map((attempt, index) =>
                <p key={index}>{attempt.subjectId} · {attempt.phase === 'pre' ? 'ก่อนเรียน' : 'หลังเรียน'} ·
                  {' '}{attempt.score}/{attempt.total} · {dateText(attempt.submittedAt)}</p>) : <p>ยังไม่มีคะแนน</p>}
            </div><div><h4>หัวข้อที่จบ</h4>
              {selected.completions.length ? selected.completions.map((completion, index) =>
                <p key={index}>{completion.topicId} · {dateText(completion.completedAt)}</p>) : <p>ยังไม่มีหัวข้อที่จบ</p>}
            </div></div>
          </details>
        </div>}
      </article>)}
    </div>
    <div className="learning-learners-pages"><button disabled={page <= 1 || loading}
      onClick={() => setPage(value => value - 1)}>← ก่อนหน้า</button>
      <span>หน้า {page} / {pageCount}</span>
      <button disabled={page >= pageCount || loading} onClick={() => setPage(value => value + 1)}>ถัดไป →</button></div>
  </section>;
}
