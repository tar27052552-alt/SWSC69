import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { supabase as defaultSupabase } from '../supabaseClient';

const DEFAULT_GOOGLE_CLIENT_ID = '904792987921-nsifka5uq1k057acsfc5hbphj1oblcov.apps.googleusercontent.com';

function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return { isInApp: false, appName: '', isLine: false, isAndroid: false, isMobile: false };
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isLine = /\bLine\//i.test(ua);
  if (isLine) return { isInApp: true, appName: 'LINE', isLine: true, isAndroid, isMobile: true };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { isInApp: true, appName: 'Facebook', isLine: false, isAndroid, isMobile: true };
  if (/Instagram/i.test(ua)) return { isInApp: true, appName: 'Instagram', isLine: false, isAndroid, isMobile: true };
  if (/Messenger/i.test(ua)) return { isInApp: true, appName: 'Messenger', isLine: false, isAndroid, isMobile: true };
  if (/BytedanceWebview|TikTok|musical_ly/i.test(ua)) return { isInApp: true, appName: 'TikTok', isLine: false, isAndroid, isMobile: true };
  if (isAndroid && /; wv\)/i.test(ua)) return { isInApp: true, appName: 'แอปแชท', isLine: false, isAndroid, isMobile: true };
  return { isInApp: false, appName: '', isLine: false, isAndroid, isMobile };
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
  const preferRedirect = inAppInfo.isMobile && !inAppInfo.isInApp;
  const [status, setStatus] = useState(inAppInfo.isInApp || preferRedirect ? '' : 'กำลังเตรียมปุ่มเข้าสู่ระบบ Google...');
  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onClose, onSuccess, onError };
  }, [onClose, onSuccess, onError]);

  useEffect(() => {
    if (inAppInfo.isInApp || preferRedirect) return undefined;
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
  }, [supabaseClient, allowedDomain, inAppInfo.isInApp, preferRedirect]);

  const handleRedirectOAuth = async () => {
    setSubmitting(true);
    setStatus('กำลังนำคุณไปยังหน้าเลือกบัญชี Google...');
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('openExternalBrowser');
      cleanUrl.hash = '';
      const redirectTo = cleanUrl.toString();
      try {
        localStorage.setItem('swsc_oauth_return', JSON.stringify({ url: redirectTo, ts: Date.now() }));
      } catch {
        // ignore storage errors
      }
      const queryParams = { prompt: 'select_account' };
      if (allowedDomain) queryParams.hd = allowedDomain;
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams,
        },
      });
      if (error) {
        setSubmitting(false);
        setStatus('');
        callbacksRef.current.onError?.(error.message || 'ไม่สามารถเชื่อมต่อ Google ได้');
      }
    } catch (err) {
      setSubmitting(false);
      setStatus('');
      callbacksRef.current.onError?.(err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อ Google ได้');
    }
  };

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
          ) : preferRedirect ? (
            <div style={{ width: '100%', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={handleRedirectOAuth}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '12px 18px',
                  borderRadius: 999,
                  border: '1px solid #dadce0',
                  background: '#ffffff',
                  color: '#1f1f1f',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                {submitting ? 'กำลังเชื่อมต่อ Google...' : 'ดำเนินการต่อด้วย Google'}
              </button>
              {status && <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>{status}</div>}
            </div>
          ) : (
            <>
              <div
                ref={btnContainerRef}
                style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0 6px' }}
              />

              {status && <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>{status}</div>}

              <button
                type="button"
                disabled={submitting}
                onClick={handleRedirectOAuth}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  color: '#6b21a8',
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                หากหน้าต่างค้างจอขาว กดเข้าสู่ระบบแบบเปลี่ยนหน้าตรงนี้
              </button>
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
