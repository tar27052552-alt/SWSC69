import React from 'react';
import { RotateCw, AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught React Error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: 24,
          fontFamily: "'Noto Sans Thai', sans-serif"
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: '32px 28px',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#ef4444',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              เกิดข้อผิดพลาดในการโหลดหน้าเว็บ
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, margin: '0 0 24px 0' }}>
              ขออภัยในความไม่สะดวก ระบบพบข้อผิดพลาดชั่วคราวขณะโหลดข้อมูลหรือสลับหน้า
            </p>
            <button
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              <RotateCw size={16} />
              โหลดระบบใหม่อีกครั้ง
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
