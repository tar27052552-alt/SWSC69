import { useState } from 'react';

export default function PushSubscriptionControl({ userId }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('เปิดรับแจ้งเตือนบนอุปกรณ์ แม้ปิดหน้าเว็บ');
  async function enable() {
    if (busy) return;
    if (import.meta.env.DEV) { setMessage('การรับ Push ต้องตั้งค่าบนเว็บจริง รุ่นในเครื่องไม่ได้เปิด OneSignal'); return; }
    if (!window.oneSignalInitialized || !window.OneSignal) { setMessage('ระบบแจ้งเตือนยังไม่พร้อม กรุณารอสักครู่แล้วลองอีกครั้ง'); return; }
    setBusy(true);
    try {
      const sdk = window.OneSignal;
      if (!sdk.Notifications.isPushSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Push หากใช้ iPhone ให้เพิ่มเว็บไปหน้าจอโฮมแล้วเปิดจากไอคอน');
      await sdk.login(String(userId));
      await sdk.Notifications.requestPermission();
      if (!sdk.Notifications.permission) throw new Error('ยังไม่ได้อนุญาตแจ้งเตือน กรุณาตรวจสิทธิ์ของเว็บไซต์ในการตั้งค่าเบราว์เซอร์');
      await sdk.User.PushSubscription.optIn();
      setMessage(sdk.User.PushSubscription.optedIn && sdk.User.PushSubscription.id
        ? 'อุปกรณ์นี้สมัครรับแจ้งเตือนแล้ว'
        : 'อนุญาตแล้ว แต่ยังยืนยันการสมัครรับไม่ได้ กรุณากดตรวจอีกครั้ง');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <div style={{ padding: '10px 16px', background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
    <p role="status" style={{ fontSize: 12, color: '#1e40af', margin: '0 0 8px' }}>{message}</p>
    <button className="btn btn-primary btn-sm" disabled={busy} onClick={enable}>{busy ? 'กำลังตรวจสอบ…' : 'เปิดรับ / ตรวจการแจ้งเตือน'}</button>
  </div>;
}
