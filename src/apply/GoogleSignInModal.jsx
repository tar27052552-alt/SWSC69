import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { supabase as defaultSupabase } from '../supabaseClient';

const DEFAULT_GOOGLE_CLIENT_ID = '904792987921-nsifka5uq1k057acsfc5hbphj1oblcov.apps.googleusercontent.com';

function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return { isInApp: false, appName: '', isLine: false, isAndroid: false };
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isLine = /\bLine\//i.test(ua);
  if (isLine) return { isInApp: true, appName: 'LINE', isLine: true, isAndroid };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { isInApp: true, appName: 'Facebook', isLine: false, isAndroid };
  if (/Instagram/i.test(ua)) return { isInApp: true, appName: 'Instagram', isLine: false, isAndroid };
  if (/Messenger/i.test(ua)) return { isInApp: true, appName: 'Messenger', isLine: false, isAndroid };
  if (/BytedanceWebview|TikTok|musical_ly/i.test(ua)) return { isInApp: true, appName: 'TikTok', isLine: false, isAndroid };
  if (isAndroid && /; wv\)/i.test(ua)) return { isInApp: true, appName: 'แอปแชท', isLine: false, isAndroid };
  return { isInApp: false, appName: '', isLine: false, isAndroid };
}

function getLineExternalUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('openExternalBrowser', '1');
    return url.toString();
  } catch {
    return window.location.href;
  }
}

function getAndroidChromeIntentUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('openExternalBrowser');
    const clean = url.toString().replace(/^https?:\/\//i, '');
    return `intent://${clean}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return window.location.href;
  }
}

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
  const inAppInfo = useMemo(() => detectInAppBrowser(), []);
  const [status, setStatus] = useState(inAppInfo.isInApp ? '' : 'กำลังเตรียมปุ่มเข้าสู่ระบบ Google...');
  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onClose, onSuccess, onError };
  }, [onClose, onSuccess, onError]);

  useEffect(() => {
    if (inAppInfo.isInApp) return undefined;
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
  }, [supabaseClient, allowedDomain, inAppInfo.isInApp]);

  const handleOpenExternal = () => {
    if (inAppInfo.isLine) {
      window.location.href = getLineExternalUrl();
      return;
    }
    if (inAppInfo.isAndroid) {
      window.location.href = getAndroidChromeIntentUrl();
      return;
    }
    window.open(getLineExternalUrl(), '_blank', 'noopener,noreferrer');
  };

  const handleCopyCurrentLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('openExternalBrowser');
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

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

          {inAppInfo.isInApp ? (
            <div
              style={{
                width: '100%',
                marginTop: 8,
                padding: '16px 14px',
                borderRadius: 14,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14.5, marginBottom: 6 }}>
                กรุณาเปิดใน Chrome หรือ Safari เพื่อเข้าสู่ระบบ
              </div>
              <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, marginBottom: 12 }}>
                ระบบความปลอดภัยของ Google ไม่อนุญาตให้เข้าสู่ระบบผ่านเบราว์เซอร์ย่อยภายในแอป <strong>{inAppInfo.appName}</strong> (จะขึ้นจอขาว)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  style={{
                    width: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    borderRadius: 999,
                    border: 'none',
                    background: 'linear-gradient(135deg, #5b188a, #7e22ce)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <ExternalLink size={16} /> เปิดใน Chrome / Safari ทันที
                </button>
                <button
                  type="button"
                  onClick={handleCopyCurrentLink}
                  style={{
                    width: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: '1px solid #d8b4fe',
                    background: '#fff',
                    color: '#5b188a',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Copy size={15} /> {copiedLink ? '✓ คัดลอกลิงก์แล้ว! นำไปวางใน Chrome / Safari' : 'คัดลอกลิงก์ไปวางใน Chrome / Safari'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 10, lineHeight: 1.55 }}>
                หรือแตะจุด 3 จุด <strong>(⋮)</strong> มุมขวาล่าง / ขวาบน → เลือก <strong>&ldquo;เปิดด้วยเบราว์เซอร์เริ่มต้น&rdquo;</strong>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={btnContainerRef}
                style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0 6px' }}
              />

              {status && <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>{status}</div>}
            </>
          )}

          <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
            ยืนยันตัวตนโดยตรงกับ Google • SWSC.OFFICIAL โรงเรียนสรรพวิทยาคม
          </div>
        </div>
      </div>
    </div>
  );
}
