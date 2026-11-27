import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PenTool, RotateCcw, X } from 'lucide-react';

function exportTrimmedPng(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return '';
  const pad = 8;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w - sx, maxX - minX + pad * 2);
  const sh = Math.min(h - sy, maxY - minY + pad * 2);

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

function DrawingCanvas({ value = '', onChange, disabled = false, height = 176, strokeWidth = 2.5 }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [hasStroke, setHasStroke] = useState(Boolean(value));
  const showStroke = Boolean(value) || hasStroke;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(260, Math.round(rect.width || 420));
    const cssH = height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = strokeWidth;

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, cssW, cssH);
        const scale = Math.min(cssW / img.width, cssH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, (cssW - drawW) / 2, (cssH - drawH) / 2, drawW, drawH);
      };
      img.src = value;
    }
  }, [value, height, strokeWidth]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const pt = getPoint(e);
    lastPointRef.current = pt;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.fillStyle = '#1e1b4b';
    ctx.arc(pt.x, pt.y, strokeWidth * 0.55, 0, Math.PI * 2);
    ctx.fill();
    setHasStroke(true);
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getPoint(e);
    const prev = lastPointRef.current || pt;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
  };

  const finishStroke = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore if pointer was not captured
    }
    if (canvasRef.current && onChange) {
      onChange(exportTrimmedPng(canvasRef.current));
    }
  };

  return (
    <div className={`sig-pad-box ${disabled ? 'is-disabled' : ''}`}>
      <canvas
        ref={canvasRef}
        className="sig-pad-canvas"
        style={{ height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      />
      {!showStroke && (
        <div className="sig-pad-placeholder">
          ใช้นิ้ว ปากกา (Apple Pencil) หรือเมาส์เซ็นชื่อลงในกรอบนี้
        </div>
      )}
      <div className="sig-pad-baseline" aria-hidden="true" />
    </div>
  );
}

export default function SignaturePad({
  label,
  hint,
  value = '',
  onChange,
  disabled = false,
  height = 176,
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fsDraft, setFsDraft] = useState('');

  useEffect(() => {
    if (!fullscreenOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreenOpen]);

  const openFullscreen = () => {
    if (disabled) return;
    setFsDraft(value || '');
    setFullscreenOpen(true);
  };

  const confirmFullscreen = () => {
    onChange?.(fsDraft);
    setFullscreenOpen(false);
  };

  return (
    <div className="sig-pad-wrap">
      <div className="sig-pad-head">
        <div>
          <div className="sig-pad-label">
            <PenTool size={14} /> {label}
          </div>
          {hint && <div className="sig-pad-hint">{hint}</div>}
        </div>
        {!disabled && (
          <div className="sig-pad-actions">
            <button
              type="button"
              className="btn-purple sig-pad-btn"
              onClick={openFullscreen}
            >
              <PenTool size={13} /> {value ? 'เซ็นใหม่' : 'แตะเพื่อเซ็นชื่อ'}
            </button>
            {Boolean(value) && (
              <button
                type="button"
                className="btn-outline sig-pad-btn"
                onClick={() => onChange?.('')}
              >
                <RotateCcw size={13} /> ล้างลายเซ็น
              </button>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`sig-preview-card ${value ? 'has-sig' : ''} ${disabled ? 'is-disabled' : ''}`}
        style={{ minHeight: Math.min(height, 148) }}
        onClick={openFullscreen}
        disabled={disabled}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="sig-preview-img" />
            <div className="sig-pad-baseline" aria-hidden="true" />
            {!disabled && <span className="sig-preview-badge">แตะเพื่อเซ็นใหม่</span>}
          </>
        ) : (
          <div className="sig-preview-empty">
            <div className="sig-preview-icon">
              <PenTool size={20} />
            </div>
            <strong>{disabled ? 'ยังไม่มีลายเซ็น' : 'แตะที่นี่เพื่อเปิดกรอบเซ็นชื่อ'}</strong>
            {!disabled && <span>เปิดหน้าต่างเซ็นแบบเต็มจอ ป้องกันการเผลอขีดโดนตอนเลื่อนหน้า</span>}
          </div>
        )}
      </button>

      {fullscreenOpen && createPortal(
        <div className="sig-fs-backdrop" role="dialog" aria-modal="true" aria-label={label}>
          <div className="sig-fs-modal">
            <div className="sig-fs-head">
              <div>
                <strong>{label}</strong>
                <span>ใช้นิ้ว ปากกา หรือเมาส์เซ็นชื่อในกรอบด้านล่าง แล้วกด &ldquo;ใช้ลายเซ็นนี้&rdquo;</span>
              </div>
              <button
                type="button"
                className="btn-outline sig-pad-btn"
                onClick={() => setFullscreenOpen(false)}
              >
                <X size={15} /> ปิด
              </button>
            </div>

            <div className="sig-fs-body">
              <DrawingCanvas
                value={fsDraft}
                onChange={setFsDraft}
                disabled={false}
                height={Math.min(340, Math.max(220, Math.round((typeof window !== 'undefined' ? window.innerHeight : 600) * 0.52)))}
                strokeWidth={3}
              />
            </div>

            <div className="sig-fs-foot">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setFsDraft('')}
              >
                <RotateCcw size={15} /> ล้างเซ็นใหม่
              </button>
              <button
                type="button"
                className="btn-purple"
                disabled={!fsDraft}
                onClick={confirmFullscreen}
              >
                <Check size={16} /> ใช้ลายเซ็นนี้
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
