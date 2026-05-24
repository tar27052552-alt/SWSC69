import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoUrl from '../assets/logo.png';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    await new Promise(r => setTimeout(r, 400));
    const result = await login(studentId, password);
    setLoading(false);
    if (result.success) navigate('/dashboard');
    else setError(result.error);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#e0f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={logoUrl} alt="SWSC Logo" style={{ width: 180, height: 180, objectFit: 'contain', margin: '-40px auto -35px', display: 'block' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#00838f' }}>สภานักเรียน</h1>
          <p style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>Student Council Internal Portal</p>
        </div>

        {/* Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">เข้าสู่ระบบ</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">รหัสประจำตัวนักเรียน</label>
                <input type="text" className="input-field" placeholder="เช่น 12345" value={studentId} onChange={e => setStudentId(e.target.value)} required id="login-student-id" />
              </div>
              <div>
                <label className="form-label">รหัสผ่าน</label>
                <input type="password" className="input-field" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required id="login-password" />
              </div>
              {error && (
                <div style={{ background: '#fce4ec', border: '1px solid #f48fb1', borderRadius: 4, padding: '8px 12px', color: '#880e4f', fontSize: 13 }}>
                  ⚠ {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} id="login-submit">
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
