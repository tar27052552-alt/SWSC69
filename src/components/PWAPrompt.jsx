import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function PWAPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if dismissed previously
    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      width: 'calc(100% - 32px)',
      maxWidth: 460,
      background: 'linear-gradient(135deg, #0d0714 0%, #1e0a2e 100%)',
      color: '#fff',
      padding: '14px 18px',
      borderRadius: 16,
      boxShadow: '0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,188,212,0.3)',
      display: 'flex',
      alignItems: 'center',
      justify: 'space-between',
      gap: 12,
      animation: 'slideUp 0.4s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <div style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #00bcd4, #00838f)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Smartphone size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#e0f7fa' }}>
            📱 ติดตั้งแอปสภานักเรียน
          </div>
          <div style={{ fontSize: 11, color: '#b2ebf2', marginTop: 2 }}>
            เพิ่มลงหน้าจอโฮมมือถือ เพื่อใช้งานสะดวกเสมือนแอปจริง
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={handleInstall}
          style={{
            background: '#00bcd4',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,188,212,0.4)',
            whiteSpace: 'nowrap'
          }}
        >
          <Download size={14} /> ติดตั้ง
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#b2ebf2',
            cursor: 'pointer',
            padding: 4
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
