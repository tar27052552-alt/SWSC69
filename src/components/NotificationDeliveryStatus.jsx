import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { retryCouncilNotification } from '../lib/discordWebhook';
import { notificationQueueEnabled } from '../lib/notificationFeatures';

export default function NotificationDeliveryStatus({ userId }) {
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!notificationQueueEnabled) {
      const listener = event => { if (event.detail?.message) setMessage(event.detail.message); };
      window.addEventListener('council-notification-status', listener);
      return () => window.removeEventListener('council-notification-status', listener);
    }
    let active = true;
    async function load() {
      const { data, error } = await supabase.from('council_notification_outbox').select('*')
        .neq('status', 'sent').order('created_at', { ascending: false }).limit(20);
      if (active) { setNow(Date.now()); if (!error) setJobs(data || []); }
    }
    const listener = event => { if (event.detail?.message) setMessage(event.detail.message); void load(); };
    window.addEventListener('council-notification-status', listener); void load();
    const timer = setInterval(load, 30_000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('council-notification-status', listener); };
  }, [userId]);
  async function retry(job) {
    if (busy) return;
    setBusy(job.id);
    try { await retryCouncilNotification(job); }
    catch (error) { setMessage('ส่งซ้ำไม่สำเร็จ: ' + error.message); }
    finally { setBusy(null); }
  }
  if (!message && !jobs.length) return null;
  return <section className="card" style={{ marginBottom: 16 }} aria-label="ผลส่งแจ้งเตือน">
    <div className="card-body">
      {message && <p role="status">{message} <button className="btn btn-outline btn-sm" onClick={() => setMessage('')}>ปิดข้อความ</button></p>}
      {jobs.length > 0 && <details><summary>รายการแจ้งเตือนที่ยังส่งไม่สำเร็จ/ยังไม่ยืนยัน ({jobs.length}{jobs.length === 20 ? '+' : ''})</summary>
        {jobs.map(job => <div key={job.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 0' }}>
          <span>{job.payload?.title} · {job.status === 'failed' ? 'ส่งไม่สำเร็จ' : 'ยังไม่ยืนยันผล'}{job.last_error && `: ${job.last_error}`}</span>
          <button className="btn btn-outline btn-sm" disabled={Boolean(busy) || (job.status === 'sending' && now - Date.parse(job.attempt_started_at) < 60_000)} onClick={() => retry(job)}>ส่งแจ้งเตือนอีกครั้ง</button>
        </div>)}
      </details>}
    </div>
  </section>;
}
