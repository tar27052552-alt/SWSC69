import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import swscLogo from './assets/form1_image2.png';
import './loadingState.css';

function useSlowNotice(active, delayMs = 10000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [active, delayMs]);
  return active && slow;
}

export function LoadingScreen({
  title = 'กำลังโหลดข้อมูล...',
  subtitle = 'กรุณารอสักครู่ ระบบกำลังเชื่อมต่อฐานข้อมูล',
  fullscreen = false,
  error = '',
  onRetry,
}) {
  const isSlow = useSlowNotice(!error, 10000);
  const handleRetry = () => {
    if (typeof onRetry === 'function') {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className={`swsc-load-screen ${fullscreen ? 'is-fullscreen' : ''}`} role="status" aria-live="polite">
      <div className="swsc-load-card">
        <div className="swsc-load-badge">
          {!error && (
            <>
              <div className="swsc-load-ring" />
              <div className="swsc-load-ring-inner" />
            </>
          )}
          <img src={swscLogo} alt="SWSC" className="swsc-load-logo" />
        </div>
        <h3 className="swsc-load-title">{error ? 'ไม่สามารถโหลดข้อมูลได้' : title}</h3>
        {!error && subtitle && <p className="swsc-load-sub">{subtitle}</p>}

        {(error || isSlow) && (
          <div className={`swsc-load-slow ${error ? 'is-error' : ''}`}>
            <span>
              {error || 'การเชื่อมต่อใช้เวลานานกว่าปกติ (อาจเกิดจากสัญญาณอินเทอร์เน็ตช้า)'}
            </span>
            <button type="button" className="swsc-load-retry-btn" onClick={handleRetry}>
              <RefreshCw size={14} /> ลองโหลดใหม่
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LoadingOverlay({
  visible,
  title = 'กำลังดำเนินการ...',
  subtitle = 'กรุณารอสักครู่ อย่าเพิ่งปิดหน้าต่างนี้',
}) {
  const isSlow = useSlowNotice(Boolean(visible), 10000);
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="swsc-load-overlay" role="status" aria-live="assertive" aria-busy="true">
      <div className="swsc-load-card">
        <div className="swsc-load-badge">
          <div className="swsc-load-ring" />
          <div className="swsc-load-ring-inner" />
          <img src={swscLogo} alt="SWSC" className="swsc-load-logo" />
        </div>
        <h3 className="swsc-load-title">{title}</h3>
        {subtitle && <p className="swsc-load-sub">{subtitle}</p>}
        {isSlow && (
          <div className="swsc-load-slow">
            <span>กำลังประมวลผลไฟล์ขนาดใหญ่หรือเน็ตช้า กรุณารออีกสักครู่...</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
