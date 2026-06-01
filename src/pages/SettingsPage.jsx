import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Save, Bell, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { supabaseRpc } from '../lib/supabaseRest';

export default function SettingsPage() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });

  const [pushSupported, setPushSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default'); // 'default', 'granted', 'denied'
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    try {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        setPushSupported(true);
        if (OneSignal.Notifications) {
          const perm = OneSignal.Notifications.permissionNative || (OneSignal.Notifications.permission ? 'granted' : 'default');
          setNotificationPermission(perm);
          
          try {
            OneSignal.Notifications.addEventListener('permissionChange', () => {
              const currentPerm = OneSignal.Notifications.permissionNative || (OneSignal.Notifications.permission ? 'granted' : 'default');
              setNotificationPermission(currentPerm);
            });
          } catch (e) {
            console.warn("OneSignal permissionChange listener error", e);
          }
        }
        
        if (OneSignal.User?.PushSubscription) {
          setIsSubscribed(OneSignal.User.PushSubscription.optedIn || false);
          try {
            OneSignal.User.PushSubscription.addEventListener('change', (state) => {
              setIsSubscribed(state?.current?.optedIn || false);
            });
          } catch (e) {
            console.warn("OneSignal subscription change listener error", e);
          }
        }
      });
    } catch (err) {
      console.error("OneSignal init inside settings error", err);
    }
  }, []);

  const handleEnablePush = () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        if (OneSignal.Notifications) {
          const perm = OneSignal.Notifications.permissionNative || (OneSignal.Notifications.permission ? 'granted' : 'default');
          setNotificationPermission(perm);
        }
        if (OneSignal.User?.PushSubscription) {
          setIsSubscribed(OneSignal.User.PushSubscription.optedIn || false);
        }
      } catch (err) {
        console.error("Failed to request permission:", err);
        alert("เกิดข้อผิดพลาดในการเปิดใช้งานแจ้งเตือน");
      }
    });
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
              
              {!pushSupported ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 6, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <AlertCircle size={18} style={{ color: '#e5c07b' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
                    กำลังโหลดตัวจัดการการแจ้งเตือน หรืออุปกรณ์ไม่รองรับการแจ้งเตือน
                  </span>
                </div>
              ) : (
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    {notificationPermission === 'granted' ? (
                      <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isSubscribed ? (
                          <span style={{ color: '#4caf50', fontWeight: 500 }}>อุปกรณ์นี้ลงทะเบียนสำเร็จและพร้อมรับแจ้งเตือนแล้ว ✅</span>
                        ) : (
                          <button 
                            type="button" 
                            className="btn" 
                            style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                            onClick={() => {
                              window.OneSignalDeferred = window.OneSignalDeferred || [];
                              window.OneSignalDeferred.push(function(OneSignal) {
                                OneSignal.User?.PushSubscription?.optIn();
                              });
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
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: notificationPermission === 'denied' ? '#444' : '#4a90e2', border: 'none', padding: '8px 14px', borderRadius: 4, color: 'white', fontWeight: 500, fontSize: 12, cursor: notificationPermission === 'denied' ? 'not-allowed' : 'pointer' }}
                        onClick={handleEnablePush}
                        disabled={notificationPermission === 'denied'}
                      >
                        <Bell size={13} /> เปิดใช้งานการแจ้งเตือนแบบ Push
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
