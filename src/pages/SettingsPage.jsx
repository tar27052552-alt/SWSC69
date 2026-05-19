import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Save } from 'lucide-react';
import { supabaseRpc } from '../lib/supabaseRest';

export default function SettingsPage() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      alert('รหัสผ่านใหม่ไม่ตรงกัน!');
      return;
    }

    try {
      // Verify current password using login_student RPC
      const verifyRes = await supabaseRpc('login_student', {
        p_student_id: user?.studentId,
        p_password: passwords.old
      });

      const found = Array.isArray(verifyRes) ? verifyRes[0] : null;
      if (!found) {
        alert('รหัสผ่านปัจจุบันไม่ถูกต้อง!');
        return;
      }

      // Set the new password
      await supabaseRpc('set_user_password', {
        p_user_id: user?.id,
        p_password: passwords.new
      });

      alert('เปลี่ยนรหัสผ่านสำเร็จ!');
      setPasswords({ old: '', new: '', confirm: '' });
    } catch (err) {
      console.error('Password change error:', err);
      alert('เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">⚙️ การตั้งค่าทั่วไป</div>
        <div className="page-subtitle">จัดการตั้งค่าบัญชีผู้ใช้และระบบ</div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={16} /> เปลี่ยนรหัสผ่าน
            </span>
          </div>
          <div className="card-body">
            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">รหัสผ่านปัจจุบัน</label>
                <input 
                  type="password" required className="input-field" 
                  value={passwords.old} 
                  onChange={e => setPasswords({...passwords, old: e.target.value})} 
                />
              </div>
              <div>
                <label className="form-label">รหัสผ่านใหม่</label>
                <input 
                  type="password" required className="input-field" 
                  value={passwords.new} 
                  onChange={e => setPasswords({...passwords, new: e.target.value})} 
                />
              </div>
              <div>
                <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                <input 
                  type="password" required className="input-field" 
                  value={passwords.confirm} 
                  onChange={e => setPasswords({...passwords, confirm: e.target.value})} 
                />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={14} /> บันทึกการเปลี่ยนแปลง
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
