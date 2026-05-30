import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPARTMENTS, ROLES } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Edit2, Trash2, X, Save, LogIn } from 'lucide-react';
import { supabaseDelete, supabaseRpc, supabaseSelect, supabaseUpsert, supabaseUpdate } from '../lib/supabaseRest';

const ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', president: 'ประธานสภาฯ', dept_head: 'หัวหน้าฝ่าย', member: 'สมาชิก' };
const ROLE_BADGE  = { admin: 'badge-purple', president: 'badge-purple', dept_head: 'badge-blue',     member: 'badge-green' };
const DEPT_COLORS = { 1:'#e8f5e9',2:'#fce4ec',3:'#e0f7fa',4:'#fff8e1',5:'#fce4ec',6:'#e0f7fa',7:'#ede7f6',8:'#f1f8e9',9:'#fff3e0',10:'#e0f2f1' };
const DEPT_TEXT   = { 1:'#2e7d32',2:'#880e4f',3:'#00838f',4:'#f57f17',5:'#880e4f',6:'#006064',7:'#4527a0',8:'#558b2f',9:'#e65100',10:'#004d40' };
const AVATAR_COLORS = ['#00bcd4','#e91e63','#43a047','#f9a825','#ec407a','#00acc1','#7e57c2','#7cb342','#fb8c00','#26a69a'];

const initForm = { name:'', nickname:'', studentId:'', phone:'', password:'', role: ROLES.MEMBER, deptId:'', position:'', profileImage:'' };

export default function AdminPage() {
  const { isAdmin, loginAsUser, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [modal, setModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [delUser, setDelUser] = useState(null);
  const [form, setForm] = useState(initForm);

  if (!isAdmin) return (
    <div style={{ textAlign:'center', padding:'80px 0', color:'#9e9e9e' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🚫</div>
      <div style={{ fontWeight:700, fontSize:16 }}>ไม่มีสิทธิ์เข้าถึง</div>
    </div>
 
  );

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const phone = (u.phone || u.email || '').toString();
    const ms = u.name.includes(search) || u.nickname.includes(search) || phone.includes(q);
    const mr = filterRole === 'all' || u.role === filterRole;
    return ms && mr;
  });

  const loadUsers = async () => {
    try {
      setDbError('');
      // หลีกเลี่ยงดึงคอลัมน์ avatar (ซึ่งเก็บรูปโปรไฟล์ Base64 ขนาดใหญ่) ในการโหลดครั้งแรกเพื่อให้หน้าจอแสดงผลได้รวดเร็วทันที!
      const rows = await supabaseSelect('users', '?select=id,name,nickname,student_id,phone,dept_id,role,position,avatar_color&order=created_at.asc');
      const mapped = (rows || []).map(r => {
        return {
          id: r.id,
          name: r.name,
          nickname: r.nickname,
          studentId: r.student_id,
          phone: r.phone || '',
          deptId: r.dept_id,
          role: r.role,
          position: r.position,
          avatar: r.nickname?.substring(0, 1) || r.name?.charAt(0) || 'U',
          profileImage: null, // จะโหลดภาพโปรไฟล์ทีหลังเฉพาะเมื่อกดแก้ไขแบบ On-Demand
          avatarColor: r.avatar_color || AVATAR_COLORS[0],
        };
      });
      setUsers(mapped);
    } catch (e) {
      setDbError(e?.message || 'โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ');
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => { setEditUser(null); setForm(initForm); setModal(true); };
  const openEdit = async u => {
    setEditUser(u);
    setForm({ name:u.name, nickname:u.nickname, studentId:u.studentId, phone:u.phone||'', password:'', role:u.role, deptId:u.deptId||'', position:u.position, profileImage: '' });
    setModal(true);
    
    try {
      // ดึงรูปโปรไฟล์จริง Base64 มาแสดงในโหมดแก้ไขแบบ On-Demand 
      const rows = await supabaseSelect('users', `?select=avatar&id=eq.${u.id}`);
      if (rows && rows[0] && rows[0].avatar && rows[0].avatar.length > 50) {
        setForm(p => ({ ...p, profileImage: rows[0].avatar }));
      }
    } catch (err) {
      console.error('Error fetching user avatar:', err);
    }
  };

  const handleLoginAs = async (u) => {
    if (window.confirm(`ต้องการเข้าสู่ระบบในฐานะ "${u.name} (${u.nickname})" ใช่หรือไม่?`)) {
      try {
        setDbError('');
        const res = await loginAsUser(u.id);
        if (res.success) {
          alert(`เข้าสู่ระบบสำเร็จในฐานะ: ${u.name}`);
          navigate('/dashboard');
        } else {
          setDbError(res.error || 'เกิดข้อผิดพลาดในการสลับบัญชี');
        }
      } catch (err) {
        setDbError(err?.message || 'เกิดข้อผิดพลาดในการสลับบัญชี');
      }
    }
  };

  const handleSave = async () => {
    const deptId = form.deptId ? parseInt(form.deptId) : null;
    try {
      setDbError('');
      const hasImage = form.profileImage && (form.profileImage.startsWith('data:image/') || form.profileImage.length > 50);
      const row = {
        id: editUser ? editUser.id : (window.crypto?.randomUUID ? window.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); })),
        name: form.name,
        nickname: form.nickname,
        student_id: form.studentId,
        phone: form.phone || null,
        dept_id: deptId,
        role: form.role,
        position: form.position,
        avatar: hasImage ? form.profileImage : (editUser?.profileImage ? editUser.profileImage : (form.nickname?.substring(0, 1) || form.name?.charAt(0) || 'U')),
        avatar_color: editUser?.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        ...(editUser ? {} : { password_hash: '' }),
      };

      if (editUser) {
        await supabaseUpdate('users', row, `?id=eq.${editUser.id}`);
      } else {
        await supabaseUpsert('users', [row]);
      }

      // Set/Change password only when provided (required for new users).
      if (!editUser || form.password) {
        if (!form.password) throw new Error('กรุณากรอกรหัสผ่าน');
        const targetUserId = editUser ? editUser.id : row.id;
        if (!targetUserId) throw new Error('บันทึกผู้ใช้ไม่สำเร็จ');
        await supabaseRpc('set_user_password', { p_user_id: targetUserId, p_password: form.password });
      }

      setModal(false);
      await loadUsers();
    } catch (e) {
      setDbError(e?.message || 'บันทึกไม่สำเร็จ');
    }
  };

  const stats = [
    { label:'สมาชิกทั้งหมด', value: users.length,                              icon:'👥', bg:'#e3f2fd', color:'#1565c0' },
    { label:'ผู้ดูแลระบบ',   value: users.filter(u=>u.role==='admin').length,    icon:'⚙️', bg:'#ede7f6', color:'#4527a0' },
    { label:'หัวหน้าฝ่าย',  value: users.filter(u=>u.role==='dept_head').length, icon:'👔', bg:'#e0f7fa', color:'#006064' },
    { label:'สมาชิกทั่วไป', value: users.filter(u=>u.role==='member').length,    icon:'👤', bg:'#e8f5e9', color:'#2e7d32' },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">⚙️ จัดการผู้ใช้งาน</div>
        <div className="page-subtitle">เพิ่ม แก้ไข ลบ และกำหนดสิทธิ์สมาชิกสภานักเรียน</div>
      </div>
      {dbError && (
        <div style={{ background:'#ffebee', border:'1px solid #ffcdd2', color:'#b71c1c', padding:'10px 12px', borderRadius:8, marginBottom:12, fontSize:13 }}>
          ⚠️ {dbError}
        </div>
      )}

      {/* Stats */}
      <div className="stats-row">
        {stats.map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#bdbdbd' }} />
            <input className="input-field" placeholder="ค้นหาชื่อ, ชื่อเล่น, เบอร์โทร..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:30 }} id="admin-search" />
          </div>
          <select className="select-field" value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{ width:160 }} id="admin-role-filter">
            <option value="all">ทุก Role</option>
            <option value="admin">ผู้ดูแลระบบ</option>
            <option value="president">ประธานสภาฯ</option>
            <option value="dept_head">หัวหน้าฝ่าย</option>
            <option value="member">สมาชิก</option>
          </select>
          <button className="btn btn-primary" onClick={openAdd} id="admin-add-user">
            <Plus size={14} /> เพิ่มสมาชิก
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ overflowX:'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th><th>สมาชิก</th><th>รหัสนักเรียน</th><th>ฝ่าย</th><th>ตำแหน่ง</th><th>Role</th><th>เบอร์โทร</th><th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const dept = u.deptId ? DEPARTMENTS.find(d=>d.id===u.deptId) : null;
                const dc = DEPT_COLORS[u.deptId]; const dt = DEPT_TEXT[u.deptId];
                return (
                  <tr key={u.id}>
                    <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="avatar" style={{ background: u.avatarColor+'22', color: u.avatarColor, fontSize:13, overflow: 'hidden' }}>
                          {u.profileImage ? <img src={u.profileImage} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : u.avatar}
                        </div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                          <div style={{ fontSize:11, color:'#9e9e9e' }}>"{u.nickname}"</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:12 }}>{u.studentId}</td>
                    <td>
                      {dept ? <span className="badge" style={{ background:dc, color:dt, borderRadius:3 }}>{dept.short}</span>
                             : <span style={{ color:'#bdbdbd', fontSize:12 }}>–</span>}
                    </td>
                    <td style={{ fontSize:13 }}>{u.position}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td style={{ fontSize:12, color:'#757575' }}>{u.phone || u.email || '–'}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        {user?.id !== u.id && (
                          <button onClick={()=>handleLoginAs(u)} className="btn btn-primary btn-sm" title="เข้าสู่ระบบในฐานะ"><LogIn size={13} /></button>
                        )}
                        <button onClick={()=>openEdit(u)} className="btn btn-gray btn-sm" title="แก้ไข"><Edit2 size={13} /></button>
                        <button onClick={()=>setDelUser(u)} className="btn btn-danger btn-sm" disabled={u.role==='admin'} title="ลบ"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #f0f0f0', fontSize:12, color:'#9e9e9e' }}>
          แสดง {filtered.length} จาก {users.length} คน
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>{editUser ? '✏️ แก้ไขข้อมูลสมาชิก' : '➕ เพิ่มสมาชิกใหม่'}</span>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#757575' }}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ width: 70, height: 70, borderRadius: '50%', background: '#f5f5f5', overflow: 'hidden', border: '1px solid #e0e0e0', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {form.profileImage ? (
                    <img src={form.profileImage} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 22, color: '#bdbdbd' }}>{form.nickname?.substring(0, 1) || form.name?.substring(0, 1) || 'U'}</span>
                  )}
                </div>
                <label style={{ fontSize: 12, color: '#00bcd4', cursor: 'pointer', fontWeight: 600 }}>
                  📸 อัปโหลดรูปโปรไฟล์
                  <input type="file" accept="image/*" onChange={e => {
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
                          setForm(p => ({ ...p, profileImage: canvas.toDataURL('image/jpeg', 0.8) }));
                        };
                        img.src = ev.target.result;
                      };
                      reader.readAsDataURL(file);
                    }
                  }} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { label:'ชื่อ-นามสกุล', key:'name', placeholder:'นาย/นางสาว ชื่อ นามสกุล', full:true },
                  { label:'ชื่อเล่น', key:'nickname', placeholder:'ชื่อเล่น' },
                  { label:'รหัสนักเรียน', key:'studentId', placeholder:'12345' },
                  { label:'เบอร์โทรศัพท์', key:'phone', type:'tel', placeholder:'เช่น 0812345678', full:true },
                  { label:'รหัสผ่าน', key:'password', type:'password', placeholder:editUser?'(เว้นว่างเพื่อไม่เปลี่ยน)':'รหัสผ่าน' },
                  { label:'ตำแหน่ง', key:'position', placeholder:'เช่น หัวหน้าฝ่ายการเงิน' },
                ].map(f => (
                  <div key={f.key} style={{ gridColumn: f.full ? 'span 2' : 'span 1' }}>
                    <label className="form-label">{f.label}</label>
                    <input className="input-field" type={f.type||'text'} placeholder={f.placeholder} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} />
                  </div>
                ))}
                <div>
                  <label className="form-label">Role</label>
                  <select className="select-field" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                    <option value="member">สมาชิก</option>
                    <option value="dept_head">หัวหน้าฝ่าย</option>
                    <option value="president">ประธานสภาฯ</option>
                    <option value="admin">ผู้ดูแลระบบ</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">ฝ่าย</label>
                  <select className="select-field" value={form.deptId} onChange={e=>setForm(p=>({...p,deptId:e.target.value}))}>
                    <option value="">– ไม่ระบุ –</option>
                    {DEPARTMENTS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} id="admin-save-user">
                <Save size={14}/> {editUser ? 'บันทึก' : 'เพิ่มสมาชิก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delUser && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDelUser(null)}>
          <div className="modal-box" style={{ maxWidth:360 }}>
            <div className="modal-header"><span style={{ fontWeight:700 }}>ยืนยันการลบ</span></div>
            <div className="modal-body" style={{ textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🗑️</div>
              <p style={{ fontSize:14 }}>ต้องการลบ <strong>{delUser.name}</strong> ออกจากระบบ?<br /><span style={{ color:'#9e9e9e', fontSize:12 }}>ไม่สามารถยกเลิกได้</span></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setDelUser(null)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={async ()=>{ try{ setDbError(''); await supabaseDelete('users', `?id=eq.${encodeURIComponent(delUser.id)}`); await loadUsers(); setDelUser(null); } catch(e){ setDbError(e?.message || 'ลบไม่สำเร็จ'); } }}>
                <Trash2 size={14}/> ลบออก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
