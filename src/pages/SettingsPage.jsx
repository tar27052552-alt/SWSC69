import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Save, Bell, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { supabaseRpc } from '../lib/supabaseRest';

export default function SettingsPage() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });

  const [pushSupported, setPushSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [pushError, setPushError] = useState('');

  const readOneSignalState = (OneSignal) => {
    setPushSupported(true);
    if (OneSignal.Notifications) {
      const perm = OneSignal.Notifications.permissionNative || (OneSignal.Notifications.permission ? 'granted' : 'default');
      setNotificationPermission(perm);
    }
    if (OneSignal.User?.PushSubscription) {
      setIsSubscribed(OneSignal.User.PushSubscription.optedIn || false);
      setSubscriptionId(OneSignal.User.PushSubscription.id || '');
    }
  };

  useEffect(() => {
    // Check native permission first as a baseline
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const initOneSignal = async (OneSignal) => {
      try {
        readOneSignalState(OneSignal);
        try {
          OneSignal.Notifications.addEventListener('permissionChange', () => readOneSignalState(OneSignal));
          OneSignal.User?.PushSubscription?.addEventListener('change', () => readOneSignalState(OneSignal));
        } catch (e) { /* listener already added or not supported */ }
      } catch (err) {
        console.error("OneSignal read state error:", err);
        setPushError(err.toString());
      }
    };

    // If OneSignal is already initialized, read state directly
    if (window.OneSignal && typeof window.OneSignal.Notifications !== 'undefined') {
      initOneSignal(window.OneSignal);
    } else {
      // Otherwise queue it
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(initOneSignal);
    }
  }, []);

  const handleEnablePush = async () => {
    setPushError('');
    try {
      // Try OneSignal first
      if (window.OneSignal && typeof window.OneSignal.Notifications !== 'undefined') {
        await window.OneSignal.Notifications.requestPermission();
        readOneSignalState(window.OneSignal);
        return;
      }

      // Fallback: use native browser API to request, then let OneSignal pick it up
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        setNotificationPermission(result);
        if (result === 'granted') {
          // After native grant, push to OneSignal deferred to finalize subscription
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          window.OneSignalDeferred.push(async (OneSignal) => {
            readOneSignalState(OneSignal);
          });
        }
      } else {
        setPushError('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
      }
    } catch (err) {
      console.error("Failed to request permission:", err);
      setPushError(err.toString());
      alert("เกิดข้อผิดพลาดในการเปิดใช้งานแจ้งเตือน: " + err.message);
    }
  };

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

      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Passwords */}
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

        {/* Push Notification Toggle Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={16} /> การแจ้งเตือนบนอุปกรณ์ (Push Notifications)
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', margin: 0, lineHeight: 1.5 }}>
                เปิดรับการแจ้งเตือนสิทธิ์แบบ Push เพื่อให้ระบบสามารถส่งข้อความเตือนเมื่อมีการเช็คชื่อมาโรงเรียน หรือสรุปรายงานประจำวันเข้าอุปกรณ์ของคุณโดยตรง
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>สิทธิ์การแจ้งเตือนของเบราว์เซอร์:</span>
                  {notificationPermission === 'granted' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4caf50', fontSize: 13, fontWeight: 500 }}>
                      <CheckCircle2 size={14} /> อนุญาตแล้ว
                    </span>
                  ) : notificationPermission === 'denied' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f44336', fontSize: 13, fontWeight: 500 }}>
                      <XCircle size={14} /> ถูกบล็อก/ปฏิเสธ
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ff9800', fontSize: 13, fontWeight: 500 }}>
                      <AlertCircle size={14} /> ยังไม่ได้ขอสิทธิ์
                    </span>
                  )}
                </div>

                {notificationPermission === 'denied' && (
                  <div style={{ padding: 12, borderRadius: 6, background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.2)', fontSize: 12, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6 }}>
                    <strong>⚠️ คุณได้ทำการบล็อกการแจ้งเตือนบนเบราว์เซอร์นี้ไว้:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
                      <li><strong>บนคอมพิวเตอร์ (Chrome / Edge / Firefox):</strong> ให้คลิกที่ไอคอนแม่กุญแจ 🔒 ข้างชื่อโดเมนบนแถบ Address ด้านบน จากนั้นเปลี่ยนค่าของ "การแจ้งเตือน" (Notifications) เป็น <strong>"อนุญาต" (Allow)</strong></li>
                      <li><strong>บนมือถือ iOS (Safari):</strong> แนะนำให้ติดตั้งเว็บนี้ลงหน้าจอหลัก (Add to Home Screen) ก่อน จากนั้นไปที่ "การตั้งค่า" (Settings) ของ iPhone &gt; การแจ้งเตือน (Notifications) &gt; ค้นหาชื่อเว็บนี้แล้วเปิดอนุญาต</li>
                    </ul>
                  </div>
                )}

                {pushError && (
                  <div style={{ padding: 10, borderRadius: 6, background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.2)', fontSize: 11, color: '#ff8a80', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    ⚠️ {pushError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  {notificationPermission === 'granted' ? (
                    <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSubscribed ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ color: '#4caf50', fontWeight: 500 }}>อุปกรณ์นี้ลงทะเบียนสำเร็จและพร้อมรับแจ้งเตือนแล้ว ✅</span>
                          {subscriptionId && <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'monospace' }}>ID: {subscriptionId}</span>}
                        </div>
                      ) : (
                        <button 
                          type="button" 
                          className="btn" 
                          style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                          onClick={() => {
                            if (window.OneSignal && window.OneSignal.User?.PushSubscription) {
                              window.OneSignal.User.PushSubscription.optIn();
                            } else {
                              window.OneSignalDeferred = window.OneSignalDeferred || [];
                              window.OneSignalDeferred.push(function(OneSignal) {
                                OneSignal.User?.PushSubscription?.optIn();
                              });
                            }
                          }}
                        >
                          เปิดรับข้อมูล (Opt-in)
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#4a90e2', border: 'none', padding: '8px 14px', borderRadius: 4, color: 'white', fontWeight: 500, fontSize: 12, cursor: 'pointer' }}
                      onClick={handleEnablePush}
                    >
                      <Bell size={13} /> เปิดใช้งานการแจ้งเตือนแบบ Push
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.3)', fontFamily: 'monospace' }}>
                  SDK: {window.OneSignal ? '✓ loaded' : '✗ not loaded'} | Permission: {notificationPermission} | Subscribed: {isSubscribed ? 'yes' : 'no'} | ID: {subscriptionId || 'none'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
