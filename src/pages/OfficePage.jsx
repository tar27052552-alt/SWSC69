import { useState, useEffect } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const MOCK_USAGE_LOG = [];

export default function OfficePage() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || user?.deptId === 4;
  const [log, setLog] = useState(MOCK_USAGE_LOG);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: '', time: '', by: '', purpose: '', clean: false });

  useEffect(() => {
    async function loadUsageLog() {
      try {
        const { data, error } = await supabase
          .from('office_usage_log')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          setLog(data);
        }
      } catch (err) {
        console.error('Error loading usage logs:', err);
      }
    }
    loadUsageLog();
  }, []);

  const handleSave = async () => {
    const newLog = {
      date: form.date,
      time: form.time,
      by: form.by,
      purpose: form.purpose,
      clean: form.clean
    };

    try {
      const { data, error } = await supabase
        .from('office_usage_log')
        .insert([newLog])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        setLog(prev => [data[0], ...prev]);

        // Notify Discord (general)
        const embedTitle = `🏢 มีการลงทะเบียนเข้าใช้งานห้องสภานักเรียน`;
        const embedDesc = `ลงทะเบียนโดย: **${data[0].by}**`;
        const fields = [
          { name: "📆 วันที่เข้าใช้งาน", value: data[0].date, inline: true },
          { name: "⏰ เวลาเข้าใช้งาน", value: data[0].time, inline: true },
          { name: "🧹 การดูแลความสะอาด", value: data[0].clean ? "✅ ทำความสะอาดห้องเรียบร้อย" : "❌ ยังไม่ได้ทำความสะอาด", inline: true },
          { name: "📝 วัตถุประสงค์", value: data[0].purpose || "ใช้งานทั่วไป", inline: false }
        ];
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'office');
      }
    } catch (err) {
      console.error('Error inserting office usage log:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกประวัติใช้งาน: ' + err.message);
    }
    setModal(false);
    setForm({ date: '', time: '', by: '', purpose: '', clean: false });
  };

  const handleDeleteLog = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?')) return;
    try {
      const { error } = await supabase
        .from('office_usage_log')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setLog(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Error deleting log:', err);
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">🏢 สนง.คณะกรรมการนักเรียน</div>
        <div className="page-subtitle">บันทึกการใช้งานห้องสภานักเรียน</div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">📝 บันทึกการใช้ห้องสภา</span>
          {canManage && <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}><Plus size={13} /> บันทึกการใช้งาน</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>ผู้ใช้</th>
                <th>วัตถุประสงค์</th>
                <th>ทำความสะอาด</th>
                {canManage && <th>ลบ</th>}
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={l.id}>
                  <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>{l.date}</td>
                  <td style={{ fontSize: 12 }}>{l.time}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{l.by}</td>
                  <td style={{ fontSize: 13 }}>{l.purpose}</td>
                  <td>
                    <span className={`badge ${l.clean ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>
                      {l.clean ? '✓ เรียบร้อย' : '✗ ยังไม่ได้ทำ'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <button 
                        className="btn btn-danger btn-sm" 
                        onClick={() => handleDeleteLog(l.id)}
                        style={{ padding: '4px 8px' }}
                      >
                        <X size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>📝 บันทึกการใช้ห้อง</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">วันที่ *</label>
                  <input className="input-field" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ช่วงเวลา *</label>
                  <input className="input-field" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} placeholder="12:30-14:00" />
                </div>
              </div>
              <div>
                <label className="form-label">ผู้ใช้งาน *</label>
                <input className="input-field" value={form.by} onChange={e => setForm(p => ({ ...p, by: e.target.value }))} placeholder="ชื่อเล่น" />
              </div>
              <div>
                <label className="form-label">วัตถุประสงค์ *</label>
                <input className="input-field" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} placeholder="เช่น ประชุม, ทำงาน" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="clean-check" checked={form.clean} onChange={e => setForm(p => ({ ...p, clean: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="clean-check" style={{ fontSize: 13, cursor: 'pointer' }}>ทำความสะอาดห้องเรียบร้อยแล้ว</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.date || !form.by || !form.purpose}><Save size={14} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
