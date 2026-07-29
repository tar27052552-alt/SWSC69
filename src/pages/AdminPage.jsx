import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPARTMENTS, ROLES } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { 
  Search, Plus, Edit2, Trash2, X, Save, LogIn, Shield, 
  UserCheck, ShieldAlert, Camera, Users, Award, RefreshCw,
  CheckCircle2, Lock, UserX, AlertTriangle, KeyRound
} from 'lucide-react';
import { supabaseDelete, supabaseRpc, supabaseSelect, supabaseUpsert, supabaseUpdate } from '../lib/supabaseRest';

const ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', president: 'ประธานสภาฯ', dept_head: 'หัวหน้าฝ่าย', member: 'สมาชิก' };
const ROLE_BADGE  = { admin: 'badge-purple', president: 'badge-purple', dept_head: 'badge-blue', member: 'badge-green' };
const DEPT_COLORS = { 1:'#e8f5e9',2:'#fce4ec',3:'#e0f7fa',4:'#fff8e1',5:'#fce4ec',6:'#e0f7fa',7:'#ede7f6',8:'#f1f8e9',9:'#fff3e0',10:'#e0f2f1' };
const DEPT_TEXT   = { 1:'#2e7d32',2:'#880e4f',3:'#00838f',4:'#f57f17',5:'#880e4f',6:'#006064',7:'#4527a0',8:'#558b2f',9:'#e65100',10:'#004d40' };
const AVATAR_COLORS = ['#00bcd4','#e91e63','#43a047','#f9a825','#ec407a','#00acc1','#7e57c2','#7cb342','#fb8c00','#26a69a'];

const initForm = { name:'', nickname:'', studentId:'', phone:'', password:'', role: ROLES.MEMBER, deptId:'', position:'', profileImage:'', banned: false };

export default function AdminPage() {
  const { isAdmin, loginAsUser, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [modal, setModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [delUser, setDelUser] = useState(null);
  const [form, setForm] = useState(initForm);

  const loadUsers = async () => {
    setLoading(true);
    try {
      setDbError('');
      const rows = await supabaseSelect('users', '?select=id,name,nickname,student_id,phone,dept_id,role,position,avatar_color,banned&order=created_at.asc');
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
          profileImage: null,
          avatarColor: r.avatar_color || AVATAR_COLORS[0],
          banned: r.banned || false,
        };
      });
      setUsers(mapped);
    } catch (e) {
      setDbError(e?.message || 'โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = search.toLowerCase();
      const phone = (u.phone || '').toString();
      const studentId = (u.studentId || '').toString();
      const ms = (u.name || '').toLowerCase().includes(q) || 
                 (u.nickname || '').toLowerCase().includes(q) || 
                 phone.includes(q) || 
                 studentId.includes(q);
      
      if (filterRole === 'banned') return ms && u.banned;
      const mr = filterRole === 'all' || u.role === filterRole;
      return ms && mr;
    });
  }, [users, search, filterRole]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = users.length;
    const adminCount = users.filter(u => u.role === ROLES.ADMIN).length;
    const leadershipCount = users.filter(u => u.role === ROLES.PRESIDENT || u.role === ROLES.DEPT_HEAD).length;
    const bannedCount = users.filter(u => u.banned).length;

    return { total, adminCount, leadershipCount, bannedCount };
  }, [users]);

  if (!isAdmin) return (
    <div style={{ textAlign:'center', padding:'80px 20px', color:'var(--text-muted)' }}>
      <ShieldAlert size={56} style={{ color: 'var(--danger)', marginBottom: 16 }} />
      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>ส่วนนี้อนุญาตเฉพาะบัญชีผู้ดูแลระบบ (Admin) เท่านั้น</div>
    </div>
  );

  const openAdd = () => { setEditUser(null); setForm(initForm); setModal(true); };
  
  const openEdit = async u => {
    setEditUser(u);
    setForm({ name:u.name, nickname:u.nickname, studentId:u.studentId, phone:u.phone||'', password:'', role:u.role, deptId:u.deptId||'', position:u.position, profileImage: '', banned: u.banned || false });
    setModal(true);
    
    try {
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

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      alert('กรุณากรอกชื่อ-นามสกุล');
      return;
    }

    setSubmitting(true);
    const deptId = form.deptId ? parseInt(form.deptId) : null;
    try {
      setDbError('');
      const hasImage = form.profileImage && (form.profileImage.startsWith('data:image/') || form.profileImage.length > 50);
      const row = {
        id: editUser ? editUser.id : (window.crypto?.randomUUID ? window.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); })),
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        student_id: form.studentId.trim(),
        phone: form.phone ? form.phone.trim() : null,
        dept_id: deptId,
        role: form.role,
        position: form.position ? form.position.trim() : '',
        avatar: hasImage ? form.profileImage : (editUser?.profileImage ? editUser.profileImage : (form.nickname?.substring(0, 1) || form.name?.charAt(0) || 'U')),
        avatar_color: editUser?.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        banned: form.banned || false,
        ...(editUser ? {} : { password_hash: '' }),
      };

      if (editUser) {
        await supabaseUpdate('users', row, `?id=eq.${editUser.id}`);
      } else {
        await supabaseUpsert('users', [row]);
      }

      if (!editUser || form.password) {
        if (!form.password) throw new Error('กรุณากรอกรหัสผ่าน');
        const targetUserId = editUser ? editUser.id : row.id;
        if (!targetUserId) throw new Error('บันทึกผู้ใช้ไม่สำเร็จ');
        await supabaseRpc('set_user_password', { p_user_id: targetUserId, p_password: form.password });
      }

      setModal(false);
      await loadUsers();
      alert(editUser ? 'แก้ไขข้อมูลผู้ใช้สำเร็จ!' : 'เพิ่มสมาชิกใหม่สำเร็จ!');
    } catch (e) {
      setDbError(e?.message || 'บันทึกไม่สำเร็จ');
      alert('เกิดข้อผิดพลาด: ' + (e?.message || 'บันทึกไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u) => {
    if (!confirm(`ยืนยันต้องการลบผู้ใช้ "${u.name} (${u.nickname})" ออกจากระบบหรือไม่?`)) return;
    try {
      await supabaseDelete('users', `?id=eq.${u.id}`);
      alert('ลบผู้ใช้สำเร็จ!');
      loadUsers();
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── PAGE HEADER ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: 'var(--shadow-primary)'
            }}>
              <Shield size={22} />
            </div>
            <span>ระบบจัดการผู้ใช้งาน & สิทธิ์สมาชิก</span>
          </div>
          <div className="page-subtitle">
            บริหารจัดการข้อมูลสมาชิก กำหนดบทบาทสิทธิ์ (Role) สลับเข้าใช้งาน และจัดการสถานะผู้ใช้งาน
          </div>
        </div>

        <button
          onClick={openAdd}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={18} />
          <span>เพิ่มสมาชิกใหม่</span>
        </button>
      </div>

      {dbError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '14px 18px', borderRadius: 'var(--radius-lg)', marginBottom: 20, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      {/* ── STATS CARDS ── */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#e0e7ff', color: 'var(--primary)' }}>
            <Users size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">สมาชิกทั้งหมด</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <Shield size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.adminCount}</div>
            <div className="stat-label">ผู้ดูแลระบบ (Admin)</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <Award size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.leadershipCount}</div>
            <div className="stat-label">ประธาน & หัวหน้าฝ่าย</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#fef2f2', color: '#ef4444' }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.bannedCount}</div>
            <div className="stat-label">บัญชีถูกระงับ</div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CARD ── */}
      <div className="card">
        {/* Controls Header */}
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: '18px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="card-title" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} color="var(--primary)" /> รายชื่อผู้ใช้งานในระบบ
              </span>
              <span className="badge badge-purple">{filteredUsers.length} คน</span>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: 280 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="text"
                className="input-field"
                placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัสนักเรียน..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 36, fontSize: 13, height: 38 }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-light)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Role Filter Tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              onClick={() => setFilterRole('all')}
              className={`badge ${filterRole === 'all' ? 'badge-purple' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ทั้งหมด ({users.length})
            </button>
            <button
              onClick={() => setFilterRole(ROLES.ADMIN)}
              className={`badge ${filterRole === ROLES.ADMIN ? 'badge-purple' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ผู้ดูแลระบบ ({stats.adminCount})
            </button>
            <button
              onClick={() => setFilterRole(ROLES.PRESIDENT)}
              className={`badge ${filterRole === ROLES.PRESIDENT ? 'badge-blue' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ประธานสภาฯ ({users.filter(u => u.role === ROLES.PRESIDENT).length})
            </button>
            <button
              onClick={() => setFilterRole(ROLES.DEPT_HEAD)}
              className={`badge ${filterRole === ROLES.DEPT_HEAD ? 'badge-blue' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              หัวหน้าฝ่าย ({users.filter(u => u.role === ROLES.DEPT_HEAD).length})
            </button>
            <button
              onClick={() => setFilterRole(ROLES.MEMBER)}
              className={`badge ${filterRole === ROLES.MEMBER ? 'badge-green' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              สมาชิก ({users.filter(u => u.role === ROLES.MEMBER).length})
            </button>
            <button
              onClick={() => setFilterRole('banned')}
              className={`badge ${filterRole === 'banned' ? 'badge-red' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              บัญชีถูกระงับ ({stats.bannedCount})
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูลผู้ใช้งาน...</div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <UserX size={44} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>ไม่พบข้อมูลสมาชิก</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>ลองค้นหาด้วยคำค้นอื่น หรือสลับแถบตัวกรองสิทธิ์</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>ผู้ใช้งาน / ชื่อ-นามสกุล</th>
                    <th>รหัสนักเรียน / เบอร์โทร</th>
                    <th>ฝ่าย / ตำแหน่ง</th>
                    <th>สิทธิ์ในระบบ (Role)</th>
                    <th>สถานะ</th>
                    <th style={{ textAlign: 'right' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const dept = DEPARTMENTS.find(d => d.id === u.deptId);
                    const deptBg = DEPT_COLORS[u.deptId] || '#f1f5f9';
                    const deptTxt = DEPT_TEXT[u.deptId] || '#475569';
                    const isSelf = user?.id === u.id;

                    return (
                      <tr key={u.id} style={{ opacity: u.banned ? 0.65 : 1 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: '50%',
                              background: u.avatarColor || 'var(--primary)',
                              color: '#fff', fontWeight: 800, fontSize: 15,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, boxShadow: 'var(--shadow-sm)'
                            }}>
                              {u.avatar}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {u.name}
                                {u.nickname && <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>({u.nickname})</span>}
                                {isSelf && <span className="badge badge-purple" style={{ fontSize: 10.5, padding: '1px 6px' }}>คุณ</span>}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-light)' }}>
                                ID: {u.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                            {u.studentId || '-'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {u.phone || '-'}
                          </div>
                        </td>

                        <td>
                          {dept ? (
                            <span style={{
                              background: deptBg, color: deptTxt,
                              padding: '3px 10px', borderRadius: 99,
                              fontSize: 11.5, fontWeight: 700, display: 'inline-block'
                            }}>
                              {dept.name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-light)' }}>-</span>
                          )}
                          {u.position && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>
                              {u.position}
                            </div>
                          )}
                        </td>

                        <td>
                          <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>

                        <td>
                          {u.banned ? (
                            <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Lock size={11} /> ถูกระงับ
                            </span>
                          ) : (
                            <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={11} /> ปกติ
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => handleLoginAs(u)}
                              className="btn btn-gray btn-sm"
                              style={{ fontSize: 11.5, padding: '4px 8px' }}
                              title="สลับเข้าใช้งานในฐานะผู้ใช้นี้"
                            >
                              <LogIn size={13} /> สลับสิทธิ์
                            </button>
                            <button
                              onClick={() => openEdit(u)}
                              className="btn btn-warning btn-sm"
                              style={{ fontSize: 11.5, padding: '4px 8px' }}
                            >
                              <Edit2 size={12} /> แก้ไข
                            </button>
                            <button
                              onClick={() => handleDelete(u)}
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: 11.5, padding: '4px 8px' }}
                              disabled={isSelf}
                            >
                              <Trash2 size={12} /> ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD / EDIT USER MODAL ── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {editUser ? <Edit2 size={18} /> : <Plus size={18} />}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                    {editUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มสมาชิกใหม่'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    กรอกข้อมูลสมาชิกและกำหนดบทบาทในระบบ
                  </div>
                </div>
              </div>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="form-label">ชื่อ-นามสกุล <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="เช่น นายนพดล สุขใจ"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">ชื่อเล่น</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="เช่น นพ"
                    value={form.nickname}
                    onChange={e => setForm({ ...form, nickname: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="form-label">รหัสนักเรียน</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="เช่น 12345"
                    value={form.studentId}
                    onChange={e => setForm({ ...form, studentId: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">เบอร์โทรศัพท์</label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="เช่น 0812345678"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="form-label">สิทธิ์ในระบบ (Role) <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select
                    className="select-field"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value={ROLES.MEMBER}>สมาชิก (Member)</option>
                    <option value={ROLES.DEPT_HEAD}>หัวหน้าฝ่าย (Dept Head)</option>
                    <option value={ROLES.PRESIDENT}>ประธานสภาฯ (President)</option>
                    <option value={ROLES.ADMIN}>ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">ฝ่ายที่สังกัด</label>
                  <select
                    className="select-field"
                    value={form.deptId}
                    onChange={e => setForm({ ...form, deptId: e.target.value })}
                  >
                    <option value="">-- ไม่สังกัดฝ่าย --</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">ตำแหน่งเฉพาะ (ถ้ามี)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น กรรมการฝ่ายประชาสัมพันธ์, เลขานุการ"
                  value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <KeyRound size={15} /> รหัสผ่าน {editUser ? '(กรอกเฉพาะเมื่อต้องการเปลี่ยนรหัสผ่าน)' : <span style={{ color: 'var(--danger)' }}>*</span>}
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder={editUser ? "ป้อนรหัสผ่านใหม่..." : "กำหนดรหัสผ่านเข้าใช้งาน..."}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required={!editUser}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <input
                  type="checkbox"
                  id="userBannedCheck"
                  checked={form.banned}
                  onChange={e => setForm({ ...form, banned: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="userBannedCheck" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer' }}>
                  ระงับการใช้งานบัญชีนี้ (Banned Account)
                </label>
              </div>

              <div className="modal-footer" style={{ padding: 0, background: 'transparent', border: 'none', marginTop: 10 }}>
                <button type="button" onClick={() => setModal(false)} className="btn btn-gray" disabled={submitting}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <Save size={16} /> {submitting ? 'กำลังบันทึก...' : (editUser ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิกใหม่')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
