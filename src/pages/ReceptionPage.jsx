import { useState, useEffect } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const MOCK_GUESTS = [];

export default function ReceptionPage() {
  const [guests, setGuests] = useState(MOCK_GUESTS);
  const [usersList, setUsersList] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'วิทยากร', org: '', event: '', date: '', gift: false, meal: false });

  useEffect(() => {
    async function loadReceptionData() {
      try {
        // โหลดรายชื่อแขก
        const { data: gData, error: gErr } = await supabase
          .from('reception_guests')
          .select('*')
          .order('created_at', { ascending: false });
        if (!gErr && gData) {
          setGuests(gData);
        }

        // โหลดข้อมูลผู้ใช้งาน
        const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
        if (uData) {
          setUsersList(uData);
        }
      } catch (err) {
        console.error('Error loading reception data:', err);
      }
    }
    loadReceptionData();
  }, []);

  const handleSave = async () => {
    const newGuest = {
      name: form.name,
      role: form.role,
      org: form.org,
      event: form.event,
      date: form.date,
      gift: form.gift,
      meal: form.meal
    };

    try {
      const { data, error } = await supabase
        .from('reception_guests')
        .insert([newGuest])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        setGuests(prev => [data[0], ...prev]);

        // ส่งการแจ้งเตือน
        const embedTitle = `🤝 มีการลงทะเบียนแขก/วิทยากรใหม่`;
        const embedDesc = `ฝ่ายปฏิคมได้เพิ่มข้อมูลแขก/วิทยากรสำหรับกิจกรรมสภานักเรียน`;
        const fields = [
          { name: '👤 ชื่อ-นามสกุล', value: data[0].name || '-', inline: true },
          { name: '👔 บทบาท', value: data[0].role || '-', inline: true },
          { name: '🏢 หน่วยงาน/สังกัด', value: data[0].org || '-', inline: true },
          { name: '📋 กิจกรรม', value: data[0].event || '-', inline: true },
          { name: '📅 วันที่เข้าร่วม', value: new Date(data[0].date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
          { name: '🎁 ของที่ระลึก', value: data[0].gift ? 'ต้องเตรียมของที่ระลึก 🎁' : 'ไม่ต้องมีของที่ระลึก', inline: true },
          { name: '🍽️ มื้ออาหาร/เบรค', value: data[0].meal ? 'ต้องจัดเตรียมอาหาร/เครื่องดื่ม 🍽️' : 'ไม่ต้องจัดเตรียมอาหาร', inline: true }
        ];

        const targetUserIds = usersList
          .filter(u => u.role === 'admin' || u.dept_id === 10)
          .map(u => String(u.id));

        sendDiscordEmbedViaGAS(
          embedTitle,
          embedDesc,
          1357990, // สีฟ้าอมเขียว (reception color)
          fields,
          null,
          'reception',
          targetUserIds.length > 0 ? targetUserIds : null
        );
      }
    } catch (err) {
      console.error('Error inserting reception guest:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกรายชื่อแขก: ' + err.message);
    }
    setModal(false);
    setForm({ name: '', role: 'วิทยากร', org: '', event: '', date: '', gift: false, meal: false });
  };

  const deleteGuest = async (id) => {
    try {
      const { error } = await supabase
        .from('reception_guests')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setGuests(p => p.filter(x => x.id !== id));
    } catch (err) {
      console.error('Error deleting reception guest:', err);
      alert('เกิดข้อผิดพลาดในการลบรายชื่อแขก: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">🤝 ฝ่ายปฏิคม</div>
          <div className="page-subtitle">จัดการแขกและวิทยากรสำหรับกิจกรรมสภานักเรียน</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> เพิ่มแขก/วิทยากร</button>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        {[
          { label: 'แขก/วิทยากรทั้งหมด', value: guests.length, bg: '#e3f2fd', color: '#1565c0', icon: '👔' },
          { label: 'ต้องมีของที่ระลึก', value: guests.filter(g => g.gift).length, bg: '#fce4ec', color: '#880e4f', icon: '🎁' },
          { label: 'มื้ออาหาร/เบรค', value: guests.filter(g => g.meal).length, bg: '#fff8e1', color: '#f57f17', icon: '🍽️' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">รายชื่อแขกและวิทยากร</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ชื่อ</th>
                <th>บทบาท</th>
                <th>หน่วยงาน</th>
                <th>งาน</th>
                <th>วันที่</th>
                <th>ของที่ระลึก</th>
                <th>มื้ออาหาร</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g, i) => (
                <tr key={g.id}>
                  <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</td>
                  <td><span className="badge badge-blue" style={{ fontSize: 11 }}>{g.role}</span></td>
                  <td style={{ fontSize: 12, color: '#757575' }}>{g.org}</td>
                  <td style={{ fontSize: 13 }}>{g.event}</td>
                  <td style={{ fontSize: 12 }}>{new Date(g.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                  <td style={{ textAlign: 'center' }}>{g.gift ? '🎁 ✓' : <span style={{ color: '#bdbdbd' }}>–</span>}</td>
                  <td style={{ textAlign: 'center' }}>{g.meal ? '🍽️ ✓' : <span style={{ color: '#bdbdbd' }}>–</span>}</td>
                  <td>
                    <button onClick={() => deleteGuest(g.id)} className="btn btn-danger btn-sm"><X size={12} /></button>
                  </td>
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
              <span style={{ fontWeight: 700 }}>👔 เพิ่มแขก/วิทยากร</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อ-นามสกุล *</label>
                <input className="input-field" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อ นามสกุล / ตำแหน่ง" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">บทบาท</label>
                  <select className="select-field" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {['วิทยากร', 'ผู้ทรงคุณวุฒิ', 'ผู้อุปถัมภ์', 'ผู้บริหาร', 'แขกรับเชิญ'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">หน่วยงาน/สังกัด</label>
                  <input className="input-field" value={form.org} onChange={e => setForm(p => ({ ...p, org: e.target.value }))} placeholder="หน่วยงาน" />
                </div>
                <div>
                  <label className="form-label">งาน/กิจกรรม *</label>
                  <input className="input-field" value={form.event} onChange={e => setForm(p => ({ ...p, event: e.target.value }))} placeholder="ชื่องาน" />
                </div>
                <div>
                  <label className="form-label">วันที่ *</label>
                  <input className="input-field" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.gift} onChange={e => setForm(p => ({ ...p, gift: e.target.checked }))} style={{ width: 16, height: 16 }} /> 🎁 ต้องมีของที่ระลึก
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.meal} onChange={e => setForm(p => ({ ...p, meal: e.target.checked }))} style={{ width: 16, height: 16 }} /> 🍽️ ต้องจัดมื้ออาหาร
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name || !form.event || !form.date}><Save size={14} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
