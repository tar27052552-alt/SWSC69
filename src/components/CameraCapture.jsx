import { useRef, useState, useEffect } from 'react';
import { Camera, RotateCcw, Upload, X } from 'lucide-react';

/**
 * CameraCapture - Component ถ่ายรูปผ่านกล้องเว็บ
 * @param {Function} onCapture - callback รับ base64 data URL (หรือ null เมื่อ retake)
 * @param {string} facingMode  - 'user' (front) | 'environment' (back)
 * @param {number} height      - ความสูงของพื้นที่แสดงผล (px)
 */
export default function CameraCapture({ onCapture, facingMode = 'user', height = 280 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [mode, setMode] = useState('idle');       // 'idle' | 'live' | 'captured'
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [camError, setCamError] = useState(null);
  const [currentFacing, setCurrentFacing] = useState(facingMode);

  // Start camera stream
  const startCamera = async (facing = currentFacing) => {
    setCamError(null);
    try {
      // Stop any existing stream first
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode('live');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCamError('ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในเบราว์เซอร์แล้วลองใหม่');
      } else if (err.name === 'NotFoundError') {
        setCamError('ไม่พบกล้องในอุปกรณ์นี้');
      } else {
        setCamError('ไม่สามารถเปิดกล้องได้: ' + err.message);
      }
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // Capture frame from video
  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    // Mirror for front camera
    if (currentFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setCapturedUrl(dataUrl);
    onCapture(dataUrl);
    setMode('captured');
  };

  // Retake photo
  const retake = () => {
    setCapturedUrl(null);
    onCapture(null);
    setMode('idle');
  };

  // Flip camera
  const flipCamera = async () => {
    const next = currentFacing === 'user' ? 'environment' : 'user';
    setCurrentFacing(next);
    await startCamera(next);
  };

  // File upload fallback - convert to base64 with compression
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800; // max size limit
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.7);
        setCapturedUrl(compressedUrl);
        onCapture(compressedUrl);
        setMode('captured');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const boxStyle = {
    width: '100%',
    height,
    background: '#1a1a1a',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    border: '2px solid #e0e0e0',
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── IDLE STATE ── */}
      {mode === 'idle' && (
        <>
          <div
            style={{ ...boxStyle, background: '#f5f5f5', border: '2px dashed #bdbdbd', cursor: 'pointer' }}
            onClick={() => startCamera()}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#9e9e9e' }}>
              <Camera size={52} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>แตะเพื่อเปิดกล้อง</span>
              <span style={{ fontSize: 12 }}>ถ่ายรูปผ่านเว็บแคม</span>
            </div>
          </div>

          {camError && (
            <div style={{ background: '#ffebee', color: '#c62828', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              ⚠️ {camError}
            </div>
          )}

          {/* File upload fallback */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', border: '1px dashed #bdbdbd', borderRadius: 8,
            cursor: 'pointer', fontSize: 13, color: '#757575', background: '#fafafa'
          }}>
            <Upload size={15} />
            หรืออัปโหลดรูปจากอุปกรณ์
            <input type="file" accept="image/*" capture={facingMode === 'user' ? 'user' : 'environment'}
              onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </>
      )}

      {/* ── LIVE CAMERA ── */}
      {mode === 'live' && (
        <>
          <div style={{ ...boxStyle, background: '#000' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: currentFacing === 'user' ? 'scaleX(-1)' : 'none',
              }}
            />
            {/* Flip button */}
            <button
              onClick={flipCamera}
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: 'none', borderRadius: '50%', width: 38, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="สลับกล้อง"
            >
              <RotateCcw size={18} />
            </button>
            {/* Cancel button */}
            <button
              onClick={() => { stopCamera(); setMode('idle'); }}
              style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: 'none', borderRadius: '50%', width: 38, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Capture button */}
          <button
            onClick={capture}
            style={{
              width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700,
              background: 'linear-gradient(135deg, #00bcd4, #0097a7)',
              color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Camera size={20} /> 📸 ถ่ายภาพ
          </button>
        </>
      )}

      {/* ── CAPTURED STATE ── */}
      {mode === 'captured' && capturedUrl && (
        <>
          <div style={{ ...boxStyle, background: '#000' }}>
            <img
              src={capturedUrl}
              alt="captured"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          {/* Retake button */}
          <button
            onClick={retake}
            style={{
              width: '100%', padding: '10px 0', fontSize: 14,
              background: '#f5f5f5', color: '#616161',
              border: '1px solid #e0e0e0', borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <RotateCcw size={15} /> ถ่ายใหม่
          </button>
        </>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
