import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Save, Bell, AlertCircle, CheckCircle2, XCircle, MessageSquare, Send, Loader } from 'lucide-react';
import { supabaseRpc } from '../lib/supabaseRest';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import { DEPARTMENTS } from '../data/mockData';

export default function SettingsPage() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });

  const [pushSupported, setPushSupported] = useState('Notification' in window);
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [pushError, setPushError] = useState('');
  const [externalId, setExternalId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [adminMessage, setAdminMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState('');

  const [allUsers, setAllUsers] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('all'); // 'all', 'depts', 'users'
  const [selectedDepts, setSelectedDepts] = useState([]); // Array of dept IDs
  const [selectedUserIds, setSelectedUserIds] = useState([]); // Array of user IDs
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const filteredUsers = allUsers.filter(u => {
    if (u.id === user?.id) return false;
    const nameMatch = u.name ? u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) : false;
    const nicknameMatch = u.nickname ? u.nickname.toLowerCase().includes(userSearchQuery.toLowerCase()) : false;
    return nameMatch || nicknameMatch;
  });

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'president') {
      const fetchAllUsers = async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('id, name, nickname, dept_id, role')
            .order('name');
          if (!error && data) {
            setAllUsers(data);
          }
        } catch (e) {
          console.error("Error loading users for announcement:", e);
        }
      };
      fetchAllUsers();
    }
  }, [user]);

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!adminMessage.trim()) return;

    setIsSending(true);
    setSendSuccess(false);
    setSendError('');

    try {
      let targetUserIds = [];

      if (selectedTarget === 'all') {
        // Send to everyone except the sender
        const { data: users, error } = await supabase
          .from('users')
          .select('id')
          .neq('id', user.id);
        if (error) throw error;
        targetUserIds = users.map(u => u.id);
      } else if (selectedTarget === 'depts') {
        if (selectedDepts.length === 0) {
          throw new Error('กรุณาเลือกฝ่ายอย่างน้อย 1 ฝ่าย');
        }
        // Send to everyone in selected departments
        const { data: users, error } = await supabase
          .from('users')
          .select('id')
          .in('dept_id', selectedDepts)
          .neq('id', user.id);
        if (error) throw error;
        targetUserIds = users.map(u => u.id);
      } else if (selectedTarget === 'users') {
        if (selectedUserIds.length === 0) {
          throw new Error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
        }
        targetUserIds = selectedUserIds;
      }

      if (targetUserIds.length === 0) {
        throw new Error('ไม่พบเป้าหมายผู้รับข้อความ');
      }

      let recipientTargetText = '';
      if (selectedTarget === 'all') {
        recipientTargetText = 'ทุกคนในสภานักเรียน';
      } else if (selectedTarget === 'depts') {
        const deptNames = selectedDepts.map(id => {
          const d = DEPARTMENTS.find(dept => dept.id === id);
          return d ? d.name : id;
        });
        recipientTargetText = `ส่งเฉพาะฝ่าย: ${deptNames.join(', ')}`;
      } else if (selectedTarget === 'users') {
        const userNames = selectedUserIds.map(id => {
          const u = allUsers.find(usr => usr.id === id);
          return u ? `${u.nickname || u.name}` : id;
        });
        recipientTargetText = `ส่งรายบุคคล: ${userNames.join(', ')}`;
      }

      if (recipientTargetText.length > 1000) {
        recipientTargetText = recipientTargetText.substring(0, 997) + '...';
      }

      const senderDept = user?.dept?.name || 'ไม่มีสังกัดฝ่าย';
      const title = `📢 ประกาศด่วนจากประธาน/ผู้ดูแลระบบ`;
      const description = `มีข้อความแจ้งเตือนประกาศด่วนส่งจากคุณ **${user?.name || 'ไม่ระบุ'} (${user?.nickname || 'ไม่มีชื่อเล่น'})**`;
      
      const fields = [
        { name: '👤 ผู้ส่ง', value: `${user?.name || 'ไม่ระบุชื่อ'} (${user?.nickname || 'ไม่มีชื่อเล่น'})`, inline: true },
        { name: '🏢 ฝ่ายผู้ส่ง', value: senderDept, inline: true },
        { name: '🎯 ส่งถึง', value: recipientTargetText, inline: false },
        { name: '📝 เนื้อหาประกาศ', value: adminMessage, inline: false }
      ];

      const success = await sendDiscordEmbedViaGAS(
        title,
        description,
        15105570, // Orange color for announcements
        fields,
        null,
        'general',
        targetUserIds
      );

      if (!success) {
        throw new Error('ส่งข้อความผ่านทางระบบแจ้งเตือนไม่สำเร็จ');
      }

      // Record in Supabase notifications table
      try {
        await supabase
          .from('notifications')
          .insert([{
            type: 'announcement',
            message: `📢 ประกาศด่วนโดย ${user?.nickname || user?.name || 'ผู้ดูแลระบบ'}: ${adminMessage}`
          }]);
      } catch (errDb) {
        console.error('Failed to save announcement in DB:', errDb);
      }

      setSendSuccess(true);
      setAdminMessage('');
      setSelectedDepts([]);
      setSelectedUserIds([]);
      setTimeout(() => setSendSuccess(false), 5000);
    } catch (err) {
      console.error('Error sending announcement:', err);
      setSendError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSending(false);
    }
  };

  // Always read native permission - this is the source of truth
  const getNativePermission = () => {
    return 'Notification' in window ? Notification.permission : 'default';
  };

  const readOneSignalSubscription = (OneSignal) => {
    // Only update subscription info from OneSignal, NOT permission
    if (OneSignal.User?.PushSubscription) {
      setIsSubscribed(OneSignal.User.PushSubscription.optedIn || false);
      setSubscriptionId(OneSignal.User.PushSubscription.id || '');
    }
    if (OneSignal.User?.externalId) {
      setExternalId(OneSignal.User.externalId);
    } else {
      setExternalId('');
    }
  };

  useEffect(() => {
    // Always set permission from native API
    setNotificationPermission(getNativePermission());

    const initOneSignal = async (OneSignal) => {
      try {
        // Re-check native permission (might have changed)
        setNotificationPermission(getNativePermission());
        readOneSignalSubscription(OneSignal);
        try {
          OneSignal.Notifications.addEventListener('permissionChange', () => {
            setNotificationPermission(getNativePermission());
            readOneSignalSubscription(OneSignal);
          });
          OneSignal.User?.PushSubscription?.addEventListener('change', () => {
            readOneSignalSubscription(OneSignal);
          });
          OneSignal.User?.addEventListener('change', () => {
            readOneSignalSubscription(OneSignal);
          });
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
        setNotificationPermission(getNativePermission());
        readOneSignalSubscription(window.OneSignal);
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
            readOneSignalSubscription(OneSignal);
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

  const handleResyncOneSignal = async () => {
    if (!window.OneSignal || !user) return;
    setIsSyncing(true);
    setPushError('');
    try {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          const targetId = String(user.id);
          console.log("Forcing OneSignal full reset and alignment to:", targetId);
          
          // 1. Force clear local and server session (Logout)
          console.log("Step 1: Logging out current session...");
          await OneSignal.logout();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 2. Log in fresh (Forces API call to bind new user)
          console.log("Step 2: Logging in fresh with target ID:", targetId);
          await OneSignal.login(targetId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 3. Opt out of push to break any stale token linkages
          if (OneSignal.User?.PushSubscription?.optedIn) {
            console.log("Step 3: Opting out of push subscription...");
            await OneSignal.User.PushSubscription.optOut();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // 4. Opt back in under the new logged in session
          console.log("Step 4: Opting back in to register subscription...");
          await OneSignal.User.PushSubscription.optIn();
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          readOneSignalSubscription(OneSignal);
          
          const currentExternalId = OneSignal.User?.externalId;
          const isSub = OneSignal.User?.PushSubscription?.optedIn;
          
          if (currentExternalId === targetId && isSub) {
            alert("เคลียร์แคชและเชื่อมบัญชีการแจ้งเตือนใหม่สำเร็จ! อุปกรณ์เครื่องนี้เชื่อมโยงกับบัญชีของคุณเรียบร้อยแล้วครับ");
          } else {
            alert(`ซิงค์สำเร็จแล้ว แต่ ID บนเครื่องคือ: ${currentExternalId || 'ไม่มี'} และการลงทะเบียน: ${isSub ? 'สำเร็จ' : 'ไม่สำเร็จ'} กรุณาลองกดซิงค์ใหม่อีกครั้ง`);
          }
        } catch (err) {
          console.error("Force sync error:", err);
          setPushError(err.toString());
          alert("เกิดข้อผิดพลาดในการซิงค์บัญชี: " + err.message);
        } finally {
          setIsSyncing(false);
        }
      });
    } catch (e) {
      console.error(e);
      setIsSyncing(false);
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
              <p style={{ fontSize: 13, color: 'var(--text-muted, #757575)', margin: 0, lineHeight: 1.5 }}>
                เปิดรับการแจ้งเตือนสิทธิ์แบบ Push เพื่อให้ระบบสามารถส่งข้อความเตือนเมื่อมีการเช็คชื่อมาโรงเรียน หรือสรุปรายงานประจำวันเข้าอุปกรณ์ของคุณโดยตรง
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 6, background: 'var(--bg-light, #f5f5f7)', border: '1px solid var(--border, #e5e5ea)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text, #212121)' }}>สิทธิ์การแจ้งเตือนของเบราว์เซอร์:</span>
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
                  <div style={{ padding: 12, borderRadius: 6, background: 'rgba(244, 67, 54, 0.05)', border: '1px solid rgba(244, 67, 54, 0.2)', fontSize: 12, color: 'var(--text, #212121)', lineHeight: 1.6 }}>
                    <strong>⚠️ คุณได้ทำการบล็อกการแจ้งเตือนบนเบราว์เซอร์นี้ไว้:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
                      <li><strong>บนคอมพิวเตอร์ (Chrome / Edge / Firefox):</strong> ให้คลิกที่ไอคอนแม่กุญแจ 🔒 ข้างชื่อโดเมนบนแถบ Address ด้านบน จากนั้นเปลี่ยนค่าของ "การแจ้งเตือน" (Notifications) เป็น <strong>"อนุญาต" (Allow)</strong></li>
                      <li><strong>บนมือถือ iOS (Safari):</strong> แนะนำให้ติดตั้งเว็บนี้ลงหน้าจอหลัก (Add to Home Screen) ก่อน จากนั้นไปที่ "การตั้งค่า" (Settings) ของ iPhone &gt; การแจ้งเตือน (Notifications) &gt; ค้นหาชื่อเว็บนี้แล้วเปิดอนุญาต</li>
                    </ul>
                  </div>
                )}

                {pushError && (
                  <div style={{ padding: 10, borderRadius: 6, background: 'rgba(244, 67, 54, 0.05)', border: '1px solid rgba(244, 67, 54, 0.2)', fontSize: 11, color: '#d32f2f', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    ⚠️ {pushError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  {notificationPermission === 'granted' ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #757575)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSubscribed ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ color: '#4caf50', fontWeight: 500 }}>อุปกรณ์นี้ลงทะเบียนสำเร็จและพร้อมรับแจ้งเตือนแล้ว ✅</span>
                          {subscriptionId && <span style={{ fontSize: 10, color: 'var(--text-muted, #9e9e9e)', fontFamily: 'monospace' }}>ID: {subscriptionId}</span>}
                        </div>
                      ) : (
                        <button 
                          type="button" 
                          className="btn" 
                          style={{ background: 'var(--border, #e0e0e0)', color: 'var(--text, #333333)', border: '1px solid var(--border, #bdbdbd)', padding: '7px 12px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                          onClick={async () => {
                            setPushError('');
                            try {
                              if (window.OneSignal && window.OneSignal.User?.PushSubscription) {
                                await window.OneSignal.User.PushSubscription.optIn();
                                readOneSignalSubscription(window.OneSignal);
                              } else {
                                window.OneSignalDeferred = window.OneSignalDeferred || [];
                                window.OneSignalDeferred.push(async function(OneSignal) {
                                  try {
                                    await OneSignal.User?.PushSubscription?.optIn();
                                    readOneSignalSubscription(OneSignal);
                                  } catch (err) {
                                    setPushError(err.toString());
                                  }
                                });
                              }
                            } catch (err) {
                              console.error("Opt-in error:", err);
                              setPushError(err.toString());
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

                <div style={{ fontSize: 10, color: 'var(--text-muted, #9e9e9e)', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>
                    SDK: {window.OneSignal ? '✓ loaded' : '✗ not loaded'} | Permission: {notificationPermission} | Subscribed: {isSubscribed ? 'yes' : 'no'} | ID: {subscriptionId || 'none'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>ลิงก์ผู้ใช้ (External ID): <strong>{externalId || 'ไม่มี'}</strong></span>
                    {externalId ? (
                      externalId === user?.id ? (
                        <span style={{ color: '#4caf50', fontWeight: 500 }}>(✅ ตรงกับบัญชีที่เข้าสู่ระบบ)</span>
                      ) : (
                        <span style={{ color: '#f44336', fontWeight: 500 }}>(⚠️ ไม่ตรงกับบัญชีปัจจุบัน - มีปัญหาการแจ้งเตือนสลับคน)</span>
                      )
                    ) : null}
                    
                    {window.OneSignal && (
                      <button
                        type="button"
                        onClick={handleResyncOneSignal}
                        disabled={isSyncing}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#4a90e2',
                          textDecoration: 'underline',
                          fontSize: 10,
                          cursor: 'pointer',
                          padding: '0 4px',
                          fontWeight: 600
                        }}
                      >
                        {isSyncing ? 'กำลังซิงค์...' : '🔄 คลิกเพื่อซิงค์บัญชีใหม่'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Send Announcement Card (Only for Admin & President) */}
        {(user?.role === 'admin' || user?.role === 'president') && (
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={16} /> 📢 ส่งข้อความประกาศด่วนถึงสมาชิกสภานักเรียน
              </span>
            </div>
            <div className="card-body">
              <form onSubmit={handleSendAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted, #757575)', margin: 0, lineHeight: 1.5 }}>
                  คุณสามารถพิมพ์ข้อความเพื่อส่งข่าวสารหรือสั่งงานเร่งด่วน โดยระบบจะยิงแจ้งเตือนแจ้งตรงเข้าหน้าจอโทรศัพท์ (Push Notification) ของเป้าหมายทันที พร้อมบันทึกข้อความลง Discord
                </p>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>ผู้รับข้อความประกาศ:</label>
                  <div style={{ display: 'flex', gap: 10, margin: '8px 0 10px' }}>
                    <button
                      type="button"
                      style={{
                        background: selectedTarget === 'all' ? 'var(--primary, #6200ee)' : 'var(--bg-light, #f5f5f7)',
                        color: selectedTarget === 'all' ? 'white' : 'var(--text, #333333)',
                        border: '1px solid var(--border, #e5e5ea)',
                        padding: '6px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedTarget('all')}
                    >
                      ส่งหาทุกคน
                    </button>
                    <button
                      type="button"
                      style={{
                        background: selectedTarget === 'depts' ? 'var(--primary, #6200ee)' : 'var(--bg-light, #f5f5f7)',
                        color: selectedTarget === 'depts' ? 'white' : 'var(--text, #333333)',
                        border: '1px solid var(--border, #e5e5ea)',
                        padding: '6px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedTarget('depts')}
                    >
                      ส่งแยกตามฝ่าย
                    </button>
                    <button
                      type="button"
                      style={{
                        background: selectedTarget === 'users' ? 'var(--primary, #6200ee)' : 'var(--bg-light, #f5f5f7)',
                        color: selectedTarget === 'users' ? 'white' : 'var(--text, #333333)',
                        border: '1px solid var(--border, #e5e5ea)',
                        padding: '6px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedTarget('users')}
                    >
                      ส่งรายบุคคล
                    </button>
                  </div>
                </div>

                {/* Target = Depts */}
                {selectedTarget === 'depts' && (
                  <div style={{ padding: 14, background: 'var(--bg-light, #f5f5f7)', borderRadius: 8, border: '1px solid var(--border, #e5e5ea)', marginBottom: 6 }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, display: 'block' }}>เลือกฝ่ายที่ต้องการรับข้อความ:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                      {DEPARTMENTS.map(dept => (
                        <label key={dept.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text, #212121)' }}>
                          <input
                            type="checkbox"
                            checked={selectedDepts.includes(dept.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDepts([...selectedDepts, dept.id]);
                              } else {
                                setSelectedDepts(selectedDepts.filter(id => id !== dept.id));
                              }
                            }}
                          />
                          <span>{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target = Users */}
                {selectedTarget === 'users' && (
                  <div style={{ padding: 14, background: 'var(--bg-light, #f5f5f7)', borderRadius: 8, border: '1px solid var(--border, #e5e5ea)', marginBottom: 6 }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, display: 'block' }}>ค้นหาและเลือกสมาชิกผู้รับข้อความ:</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="พิมพ์ชื่อ หรือชื่อเล่น เพื่อค้นหา..."
                      style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border, #e5e5ea)', marginBottom: 12 }}
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                    />
                    <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 6 }}>
                      {filteredUsers.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted, #757575)', padding: 8, textAlign: 'center' }}>ไม่พบรายชื่อผู้ใช้ที่ค้นหา</div>
                      ) : filteredUsers.map(u => {
                        const userDept = DEPARTMENTS.find(d => d.id === u.dept_id)?.short || 'ไม่มีสังกัด';
                        const isChecked = selectedUserIds.includes(u.id);
                        return (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: isChecked ? 'rgba(76, 175, 80, 0.08)' : 'transparent', color: 'var(--text, #212121)', border: isChecked ? '1px solid rgba(76, 175, 80, 0.2)' : '1px solid transparent', transition: 'all 0.15s' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds([...selectedUserIds, u.id]);
                                } else {
                                  setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                                }
                              }}
                            />
                            <span><strong>{u.nickname || 'ไม่มีชื่อเล่น'}</strong> — {u.name} ({userDept})</span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedUserIds.length > 0 && (
                      <div style={{ fontSize: 11, color: '#4caf50', marginTop: 10, fontWeight: 600 }}>
                        ✓ เลือกสมาชิกไว้แล้ว {selectedUserIds.length} คน
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>เนื้อหาประกาศ</label>
                  <textarea
                    required
                    rows={4}
                    className="input-field"
                    placeholder="พิมพ์เนื้อหาข้อความประกาศสำคัญที่นี่..."
                    style={{ resize: 'vertical', width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e5ea)', fontFamily: 'inherit', fontSize: 13 }}
                    value={adminMessage}
                    onChange={e => setAdminMessage(e.target.value)}
                    disabled={isSending}
                  />
                </div>

                {sendSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 6, background: 'rgba(76, 175, 80, 0.08)', border: '1px solid rgba(76, 175, 80, 0.3)', color: '#2e7d32', fontSize: 13 }}>
                    <CheckCircle2 size={16} />
                    <span>ส่งข้อความแจ้งเตือนประกาศหาผู้รับสำเร็จแล้ว!</span>
                  </div>
                )}

                {sendError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 6, background: 'rgba(244, 67, 54, 0.08)', border: '1px solid rgba(244, 67, 54, 0.3)', color: '#c62828', fontSize: 13 }}>
                    <XCircle size={16} />
                    <span>ส่งประกาศไม่สำเร็จ: {sendError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: isSending ? 'not-allowed' : 'pointer',
                      opacity: isSending ? 0.7 : 1,
                      transition: 'all 0.2s ease-in-out'
                    }}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <>
                        <Loader size={13} className="animate-spin" />
                        กำลังส่งประกาศ...
                      </>
                    ) : (
                      <>
                        <Send size={13} /> ส่งข้อความประกาศด่วน
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
