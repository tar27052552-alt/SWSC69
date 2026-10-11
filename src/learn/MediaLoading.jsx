import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle } from 'lucide-react';

export default function MediaLoading({ label, failed = false, onRetry, overlay = false, fallbackUrl, mediaType = 'document' }) {
  const [slowKey, setSlowKey] = useState(null);
  const key = `${label}:${fallbackUrl || ''}`;
  const slow = slowKey === key;
  useEffect(() => {
    const timer = setTimeout(() => setSlowKey(key), 15000);
    return () => clearTimeout(timer);
  }, [key]);
  return <div className={`learn-loading-card${overlay ? ' is-overlay' : ` reserve-${mediaType}`}`} role={failed ? 'alert' : 'status'} aria-live="polite">
    <div className="learn-loading-emblem" aria-hidden="true"><BookOpen size={32} /><LoaderCircle size={64} /></div>
    <strong>{failed ? 'เปิดสื่อไม่สำเร็จ' : `${label}…`}</strong>
    <p>{failed ? 'ข้อมูลการเรียนยังอยู่ กรุณาลองอีกครั้ง' : slow
      ? 'สื่อใช้เวลาโหลดนานกว่าปกติ กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ต'
      : 'กำลังเตรียมบทเรียนให้คุณ'}</p>
    {!failed && <div className="learn-loading-shimmer" aria-hidden="true" />}
    {failed && onRetry && <button type="button" onClick={onRetry}>ลองใหม่</button>}
    {slow && fallbackUrl && <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">เปิด PDF เต็มหน้าจอ ↗</a>}
  </div>;
}
