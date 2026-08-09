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
    const result = await login(studentId, password);
    setLoading(false);
    if (result.success) navigate('/dashboard');
    else setError(result.error);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Subtle ambient lighting */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,232,240,0.6) 0%, rgba(255,255,255,0) 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Apple-style Minimal Slate Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 24,
          boxShadow: '0 20px 45px -12px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02)',
          padding: '36px 32px',
          transition: 'all 0.3s ease'
        }}>
          {/* Logo & Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <img
              src={logoUrl}
              alt="SWSC Logo"
              style={{
                width: 130,
                height: 'auto',
                maxHeight: 130,
                objectFit: 'contain',
                margin: '0 auto 12px',
                display: 'block'
              }}
            />

            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
              สภานักเรียน
            </h1>
            <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
              Student Council Portal SWSC69
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#334155', marginBottom: 6, display: 'block' }}>
                รหัสประจำตัวนักเรียน
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="กรอกรหัสนักเรียน (เช่น 12345)"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                required
                autoComplete="username"
                inputMode="numeric"
                id="login-student-id"
                style={{
                  height: 48,
                  fontSize: 16, // 16px prevents iOS Safari auto-zoom
                  borderRadius: 12,
                  paddingLeft: 14,
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  color: '#0f172a',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12.5, color: '#334155', marginBottom: 6, display: 'block' }}>
                รหัสผ่าน
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                id="login-password"
                style={{
                  height: 48,
                  fontSize: 16, // 16px prevents iOS Safari auto-zoom
                  borderRadius: 12,
                  paddingLeft: 14,
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  color: '#0f172a',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', color: '#dc2626', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                marginTop: 4,
                height: 48,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
              id="login-submit"
            >
              {loading ? '⏳ กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        {/* Footer Text */}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11.5, color: '#94a3b8', fontWeight: 500 }}>
          ระบบสารสนเทศสภานักเรียน คณะกรรมการนักเรียนโรงเรียนสรรพวิทยาคม
        </div>
      </div>
    </div>
  );
}
