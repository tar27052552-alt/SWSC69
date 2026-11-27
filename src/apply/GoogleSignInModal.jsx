import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { supabase as defaultSupabase } from '../supabaseClient';

const DEFAULT_GOOGLE_CLIENT_ID = '904792987921-nsifka5uq1k057acsfc5hbphj1oblcov.apps.googleusercontent.com';

async function createNoncePair() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const rawNonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const encoded = new TextEncoder().encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
  return { rawNonce, hashedNonce };
}

export default function GoogleSignInModal({
  supabaseClient = defaultSupabase,
  allowedDomain = '',
  title = 'เข้าสู่ระบบด้วย Google',
  subtitle = '',
  onClose,
  onSuccess,
  onError,
}) {
  const btnContainerRef = useRef(null);
  const callbacksRef = useRef({ onClose, onSuccess, onError });
  const [status, setStatus] = useState('กำลังเตรียมปุ่มเข้าสู่ระบบ Google...');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onClose, onSuccess, onError };
  }, [onClose, onSuccess, onError]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

    async function mountGsi() {
      if (cancelled || !btnContainerRef.current) return;
      if (!window.google?.accounts?.id) {
        pollTimer = setTimeout(mountGsi, 200);
        return;
      }

      try {
        const { rawNonce, hashedNonce } = await createNoncePair();
        if (cancelled || !btnContainerRef.current) return;

        const initOpts = {
          client_id: clientId,
          nonce: hashedNonce,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!response?.credential) {
              callbacksRef.current.onError?.('ไม่ได้รับข้อมูลยืนยันตัวตนจาก Google');
              return;
            }
            setSubmitting(true);
            setStatus('กำลังยืนยันตัวตนกับระบบสภานักเรียน...');
            const { error } = await supabaseClient.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: rawNonce,
            });
            if (error) {
              setSubmitting(false);
              setStatus('');
              callbacksRef.current.onError?.(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
              return;
            }
            callbacksRef.current.onSuccess?.();
            callbacksRef.current.onClose?.();
          },
        };
        if (allowedDomain) initOpts.hd = allowedDomain;

        window.google.accounts.id.initialize(initOpts);

        btnContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(btnContainerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 300,
          locale: 'th',
        });
        setStatus('');
      } catch (err) {
        setStatus('');
        callbacksRef.current.onError?.(err instanceof Error ? err.message : 'ไม่สามารถโหลด Google Sign-In ได้');
      }
    }

    mountGsi();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [supabaseClient, allowedDomain]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 10, 46, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !submitting && onClose?.()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: 'min(440px, 100%)',
          padding: 26,
          boxShadow: '0 24px 64px rgba(30, 10, 46, 0.35)',
          textAlign: 'center',
          color: '#18181b',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="ปิด"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#faf5ff',
              color: '#4a1270',
              border: '1px solid #e9dff2',
              borderRadius: 999,
              padding: 7,
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: -8 }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: '#f3e8ff', color: '#6b21a8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: 20, color: '#2d1046', fontWeight: 800 }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#52525b', lineHeight: 1.6 }}>
            {subtitle || (allowedDomain ? (
              <>
                กรุณาเลือกบัญชีอีเมลโรงเรียน <strong>@{allowedDomain}</strong> เท่านั้น<br />
                (เช่น <code>เลขประจำตัว@{allowedDomain}</code>)
              </>
            ) : (
              'เลือกบัญชี Google ของคุณเพื่อเข้าสู่ระบบและบันทึกข้อมูล'
            ))}
          </p>

          <div
            ref={btnContainerRef}
            style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0 6px' }}
          />

          {status && <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>{status}</div>}

          <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
            ยืนยันตัวตนโดยตรงกับ Google • SWSC.OFFICIAL โรงเรียนสรรพวิทยาคม
          </div>
        </div>
      </div>
    </div>
  );
}
