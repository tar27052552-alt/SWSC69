import { useState, useEffect } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const MOCK_EVENTS = [];

export default function RecreationPage() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || user?.deptId === 6;
  const [events, setEvents] = useState(MOCK_EVENTS);
  const [usersList, setUsersList] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', host: '', games: '' });

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from('recreation_events')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          setEvents(data);
        }

        // โหลดรายชื่อผู้ใช้
        const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
        if (uData) {
          setUsersList(uData);
        }
      } catch (err) {
        console.error('Error loading recreation events:', err);
      }
    }
    loadEvents();
  }, []);

  const handleSave = async () => {
    const parsedGames = form.games.split(',').map(g => g.trim()).filter(Boolean);
    const newEvent = {
      title: form.title,
      date: form.date,
      host: form.host,
      games: parsedGames,
      status: 'planning'
    };

    try {
      const { data, error } = await supabase
        .from('recreation_events')
        .insert([newEvent])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        setEvents(prev => [data[0], ...prev]);

        // ส่งการแจ้งเตือน
        const embedTitle = `🎮 มีการวางแผนกิจกรรมสันทนาการใหม่`;
        const embedDesc = `ฝ่ายนันทนาการและเครือข่ายชุมชนได้เพิ่มแผนการจัดสันทนาการของสภานักเรียน`;
        const fields = [
          { name: '📋 กิจกรรม', value: data[0].title || '-', inline: true },
          { name: '📅 วันที่จัด', value: new Date(data[0].date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
          { name: '👤 ผู้นำกิจกรรม', value: data[0].host || '-', inline: true },
          { name: '🎯 เกมที่เลือกใช้', value: data[0].games && data[0].games.length > 0 ? data[0].games.join(', ') : 'ไม่มี', inline: false }
        ];

        const targetUserIds = usersList
          .filter(u => u.role === 'admin' || u.dept_id === 6)
          .map(u => String(u.id));

        sendDiscordEmbedViaGAS(
          embedTitle,
          embedDesc,
          439924, // สีฟ้านันทนาการ (recreation color)
          fields,
          null,
          'recreation',
          targetUserIds.length > 0 ? targetUserIds : null
        );
      }
    } catch (err) {
      console.error('Error inserting recreation event:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกกิจกรรม: ' + err.message);
    }
    setModal(false);
    setForm({ title: '', date: '', host: '', games: '' });
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">🎮 ฝ่ายนันทนาการ</div>
          <div className="page-subtitle">วางแผนกิจกรรมสันทนาการของสภานักเรียน</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> วางแผนสันทนาการ</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: 'white', borderRadius: '20px', border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎲</div>
            ยังไม่มีแผนการจัดสันทนาการที่บันทึกไว้
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                background: ev.status === 'upcoming' ? 'var(--primary-light)' : '#f1f5f9',
                color: ev.status === 'upcoming' ? 'var(--primary-dark)' : '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'
              }}>
                {ev.status === 'upcoming' ? '🎯' : '📋'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>{ev.title}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span>📅 {new Date(ev.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                      <span>👤 ผู้นำ: <span style={{ fontWeight: 600, color: '#334155' }}>{ev.host}</span></span>
                    </div>
                  </div>
                  <span className={`badge ${ev.status === 'upcoming' ? 'badge-blue' : 'badge-gray'}`}>
                    {ev.status === 'upcoming' ? 'กำลังจะมาถึง' : 'วางแผนอยู่'}
                  </span>
                </div>
                {ev.games && ev.games.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {ev.games.map(g => <span key={g} className="badge badge-purple">🎯 {g}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>🎮 วางแผนสันทนาการ</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อกิจกรรม *</label>
                <input className="input-field" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="สันทนาการประชุม ครั้งที่..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">วันที่ *</label>
                  <input className="input-field" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ผู้นำ</label>
                  <input className="input-field" value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="ชื่อเล่น" />
                </div>
              </div>
              <div>
                <label className="form-label">เกมที่เลือก (คั่นด้วยจุลภาค)</label>
                <input className="input-field" value={form.games} onChange={e => setForm(p => ({ ...p, games: e.target.value }))} placeholder="ลมพัด, ท่าทายทาย" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.title || !form.date}><Save size={14} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
