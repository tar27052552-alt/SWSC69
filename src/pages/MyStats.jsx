import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Edit2, X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function MyStats() {
  const { user, updateUser } = useAuth();
  const dept = user?.dept;

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', nickname: '', phone: '', avatar: '', profileImage: '' });
  
  const [fines, setFines] = useState([]);
  const [attendanceCount, setAttendanceCount] = useState({ present: 0, total: 0 });
  const [cleanCount, setCleanCount] = useState({ done: 0, total: 0 });
  const [meetingCount, setMeetingCount] = useState({ attended: 0, total: 0 });
  const [flagCount, setFlagCount] = useState({ done: 0, total: 0 });
  const [myDuties, setMyDuties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatsData() {
      if (!user) return;
      try {
        setLoading(true);

        // 1. Fetch fines
        const { data: fineData } = await supabase
          .from('discipline_fines')
          .select('*')
          .eq('user_id', String(user.id))
          .order('created_at', { ascending: false });
        setFines(fineData || []);

        // 2. Fetch attendance
        const { data: attData } = await supabase
          .from('student_attendance')
          .select('*')
          .eq('user_id', String(user.id));
        if (attData) {
          const present = attData.filter(a => a.status === 'on_time').length;
          setAttendanceCount({ present, total: attData.length });
        }

        // 3. Fetch clean duty checks
        const { data: cleanData } = await supabase
          .from('clean_duty_checks')
          .select('*')
          .eq('nickname', user.nickname);
        if (cleanData) {
          const done = cleanData.filter(c => c.status === 'done').length;
          setCleanCount({ done, total: cleanData.length });
        }

        // 4. Fetch meetings
        const { data: meetingData } = await supabase
          .from('secretary_meetings')
          .select('*');
        if (meetingData) {
          const nameLower = user.name?.toLowerCase() || '';
          const nickLower = user.nickname?.toLowerCase() || '';
          const attended = meetingData.filter(m => {
            const arr = Array.isArray(m.attendees) ? m.attendees : [];
            return arr.some(attendee => {
              const attLower = String(attendee).toLowerCase();
              return attLower.includes(nameLower) || attLower.includes(nickLower) || nameLower.includes(attLower) || nickLower.includes(attLower);
            });
          }).length;
          setMeetingCount({ attended, total: meetingData.length });
        }

        // 5. Fetch schedules (greeting duty)
        const { data: schedData } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'greeting');
        const duties = [];
        if (schedData) {
          schedData.forEach(row => {
            const dayData = row.data || {};
            ['gate1', 'gate2', 'gate3'].forEach(gate => {
              if (dayData[gate]?.includes(user.nickname)) {
                duties.push({ day: row.day, gate, members: dayData[gate] });
              }
            });
          });
        }
        setMyDuties(duties);

        // 6. Fetch schedules (flag ceremony duty)
        const { data: flagData } = await supabase
          .from('schedules')
          .select('*')
          .in('type', ['national_flag', 'color_flag']);
        let myFlagAssigned = 0;
        if (flagData) {
          flagData.forEach(row => {
            const members = row.data?.members || [];
            if (members.includes(user.nickname)) {
              myFlagAssigned++;
            }
          });
        }
        setFlagCount({ done: myFlagAssigned * 4, total: myFlagAssigned * 4 });

      } catch (err) {
        console.error('Error loading stats data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStatsData();
  }, [user]);

  const openEditModal = () => {
    setEditForm({
      name: user?.name || '',
      nickname: user?.nickname || '',
      phone: user?.phone || '',
      avatar: user?.avatar || '',
      profileImage: user?.profileImage || ''
    });
    setEditModal(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 300; // Profile pictures are small, 300px is more than enough!
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          setEditForm(p => ({ ...p, profileImage: canvas.toDataURL('image/jpeg', 0.8) }));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      const newAvatarValue = editForm.profileImage || editForm.avatar || user.nickname?.substring(0, 1) || 'U';
      const { error } = await supabase
        .from('users')
        .update({
          name: editForm.name,
          nickname: editForm.nickname,
          phone: editForm.phone,
          avatar: newAvatarValue
        })
        .eq('id', user.id);

      if (error) throw error;

      updateUser({
        name: editForm.name,
        nickname: editForm.nickname,
        phone: editForm.phone,
        avatar: editForm.profileImage ? (editForm.nickname?.substring(0, 1) || 'U') : editForm.avatar,
        profileImage: editForm.profileImage || null
      });

      setEditModal(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('บันทึกข้อมูลไม่สำเร็จ: ' + err.message);
    }
  };

  const stats = [
    { label: 'เวรยืนไหว้ (เดือนนี้)', value: `${attendanceCount.present}/${attendanceCount.total || 0}`, unit: 'ครั้ง', ok: true },
    { label: 'เวรเชิญธง (เดือนนี้)', value: `${flagCount.done}/${flagCount.total || 0}`, unit: 'ครั้ง', ok: true },
    { label: 'เวรทำความสะอาด', value: `${cleanCount.done}/${cleanCount.total || 0}`, unit: 'ครั้ง', ok: true },
    { label: 'เข้าร่วมประชุม', value: `${meetingCount.attended}/${meetingCount.total || 0}`, unit: 'ครั้ง', ok: true },
    { label: 'ยอดโดนหักเงิน (รวม)', value: String(fines.reduce((s, f) => s + f.amount, 0)), unit: 'บาท', ok: fines.length === 0 },
  ];

  const fineHistory = fines.map(f => ({
    date: f.date,
    reason: f.violation,
    amount: f.amount,
    by: f.by
  }));

  return (
    <div>
      <div className="page-header">
        <div className="page-title">👤 ประวัติส่วนตัว</div>
        <div className="page-subtitle">ข้อมูลส่วนตัวและสถิติการทำงาน</div>
      </div>

      <div className="grid-layout" style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16 }}>
        {/* Profile card */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div style={{ padding:'24px 20px', textAlign:'center', borderBottom:'1px solid #f0f0f0', position: 'relative' }}>
              <button onClick={openEditModal} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#9e9e9e', cursor: 'pointer', padding: 4 }} title="แก้ไขประวัติส่วนตัว">
                <Edit2 size={16} />
              </button>
              <div className="avatar" style={{ width:64, height:64, fontSize:26, background: user?.avatarColor+'22', color: user?.avatarColor, margin:'0 auto 12px', border:`3px solid ${user?.avatarColor}44`, overflow: 'hidden' }}>
                {user?.profileImage ? <img src={user.profileImage} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.avatar}
              </div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{user?.name}</div>
              <div style={{ fontSize:12, color:'#9e9e9e' }}>"{user?.nickname}" · {user?.studentId}</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#00bcd4', margin:'8px 0' }}>{user?.position}</div>
              {dept && <span className="badge" style={{ background: dept.bg, color: dept.color, borderRadius:3 }}>{dept.name}</span>}
              {!dept && user?.role==='admin' && <span className="badge badge-purple">ผู้ดูแลระบบ</span>}
              {!dept && user?.role==='president' && <span className="badge" style={{ background: '#6366f1', color: 'white', borderRadius:3 }}>ประธานสภาฯ</span>}
            </div>
            <div style={{ padding:'12px 16px' }}>
              <div style={{ fontSize:12, color:'#9e9e9e', marginBottom:4 }}>เบอร์โทรศัพท์</div>
              <div style={{ fontSize:13 }}>{user?.phone || '-'}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">🔐 สิทธิ์การเข้าถึง</span></div>
            <div style={{ padding:'8px 0' }}>
              {[
                { label:'ดูตารางเวรทั้งหมด', ok:true },
                { label:'แก้ไขตารางเวร', ok: user?.role!=='member' },
                { label:'บันทึกการหักเงิน', ok: user?.deptId===2 || user?.role==='admin' },
                { label:'จัดการผู้ใช้งาน', ok: user?.role==='admin' },
              ].map(p => (
                <div key={p.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f9f9f9', fontSize:13 }}>
                  <span style={{ color:'#616161' }}>{p.label}</span>
                  <span>{p.ok ? '✅' : '❌'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Stats */}
          <div className="stats-row" style={{ gridTemplateColumns:'repeat(5, 1fr)' }}>
            {stats.map(s => (
              <div key={s.label} className="stat-box" style={{ flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                <div style={{ fontSize:11, color:'#9e9e9e', fontWeight:600 }}>{s.label}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <span className="stat-value" style={{ color: s.ok ? '#2e7d32' : '#c62828', fontSize:20 }}>{s.value}</span>
                  <span style={{ fontSize:11, color:'#9e9e9e' }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Fine history */}
          <div className="card">
            <div className="card-header"><span className="card-title">💸 ประวัติการหักเงิน</span></div>
            {fineHistory.length > 0 ? (
              <table className="simple-table">
                <thead>
                  <tr><th>วันที่</th><th>สาเหตุ</th><th>จำนวน</th><th>บันทึกโดย</th></tr>
                </thead>
                <tbody>
                  {fineHistory.map((f,i) => (
                    <tr key={i}>
                      <td style={{ fontSize:12 }}>{f.date}</td>
                      <td>{f.reason}</td>
                      <td><span className="badge badge-red">-{f.amount} บาท</span></td>
                      <td style={{ fontSize:12, color:'#9e9e9e' }}>{f.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign:'center', padding:'24px', color:'#9e9e9e', fontSize:13 }}>🎉 ยังไม่มีประวัติการหักเงิน</div>
            )}
          </div>

          {/* My duty schedule */}
          <div className="card">
            <div className="card-header"><span className="card-title">🙏 เวรยืนไหว้ของคุณ</span></div>
            {myDuties.length > 0 ? (
              <div>
                {myDuties.map((d,i) => {
                  const gateName = d.gate === 'gate1' ? 'ประตูไหมไทย' : d.gate === 'gate2' ? 'ประตูอำเภอ' : 'ประตูหน้า รร.';
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderBottom:'1px solid #f0f0f0' }}>
                      <span>🙏</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>วัน{d.day} · {gateName}</div>
                        <div style={{ fontSize:11, color:'#9e9e9e' }}>ร่วมกับ: {d.members.filter(m=>m!==user?.nickname).join(', ') || '-'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign:'center', padding:'24px', color:'#9e9e9e', fontSize:13 }}>ไม่มีเวรที่กำลังจะมาถึง</div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditModal(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>✏️ แก้ไขประวัติส่วนตัว</span>
              <button onClick={() => setEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f5f5f5', overflow: 'hidden', border: '1px solid #e0e0e0', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {editForm.profileImage ? (
                    <img src={editForm.profileImage} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 24, color: user?.avatarColor || '#9e9e9e' }}>{editForm.avatar || user?.avatar}</span>
                  )}
                </div>
                <label style={{ fontSize: 12, color: '#00bcd4', cursor: 'pointer', fontWeight: 600 }}>
                  📸 อัปโหลดรูปภาพใหม่
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
              </div>

              <div>
                <label className="form-label">ชื่อ-นามสกุล</label>
                <input className="input-field" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">ชื่อเล่น</label>
                  <input className="input-field" value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">อักษรย่อรูปประจำตัว</label>
                  <input className="input-field" maxLength="2" value={editForm.avatar} onChange={e => setEditForm(p => ({ ...p, avatar: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input className="input-field" type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setEditModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={!editForm.name}>
                <Save size={14} /> บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
