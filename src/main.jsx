import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// iOS Safari zooms when focusing form controls with font-size < 16px.
// For <select>, temporarily raise font-size on focus (avoid transforms which can break option scrolling).
(() => {
  if (typeof window === 'undefined') return;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  // Mark iOS for CSS targeting.
  document.documentElement.classList.add('is-ios');

  const saveKeys = ['fontSize'];

  const onFocusIn = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.tagName !== 'SELECT') return;
    if (el.dataset.iosNoZoomApplied === '1') return;

    const computed = window.getComputedStyle(el);
    const prevSize = parseFloat(computed.fontSize || '16');
    if (!Number.isFinite(prevSize) || prevSize >= 16) return;

    // Snapshot inline styles so we can restore them exactly.
    for (const key of saveKeys) el.dataset[`iosPrev_${key}`] = el.style[key] || '';

    el.style.fontSize = '16px';
    el.dataset.iosNoZoomApplied = '1';
  };

  const onFocusOut = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.tagName !== 'SELECT') return;
    if (el.dataset.iosNoZoomApplied !== '1') return;

    for (const key of saveKeys) el.style[key] = el.dataset[`iosPrev_${key}`] || '';
    for (const key of saveKeys) delete el.dataset[`iosPrev_${key}`];
    delete el.dataset.iosNoZoomApplied;
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
