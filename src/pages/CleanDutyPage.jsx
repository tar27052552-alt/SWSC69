import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import CameraCapture from '../components/CameraCapture';

export default function CleanDutyPage() {
  const { user, cleanDutyState, setCleanDutyState } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('attendance_settings').select('*');
        if (error) throw error;
        if (data) {
          const startD = data.find(d => d.key === 'start_date')?.value;
          if (startD) setStartDate(startD);
        }
      } catch (err) {
        console.error('Error loading settings in CleanDutyPage:', err);
      } finally {
        setLoadingSettings(false);
      }
    }
    loadSettings();
  }, []);

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const isBeforeStart = startDate && todayStr < startDate;

  const handleSubmit = async () => {
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    
    try {
      if (user) {
        const record = {
          nickname: user.nickname,
          date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
          status: 'done',
          photo: photoUrl
        };
        const { error: upsertError } = await supabase
          .from('clean_duty_checks')
          .upsert([record], { onConflict: 'nickname,date' });
          
        if (upsertError) {
          console.error("Clean Duty error:", upsertError);
          alert("ไม่สามารถบันทึกข้อมูลได้: " + upsertError.message);
          return;
        }
      }
    } catch (err) {
      console.error('Error submitting clean duty to Supabase:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
      return;
    }

    setCleanDutyState({ status: 'done', time: timeStr, photo: photoUrl });
  };

  if (loadingSettings) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <div style={{ fontSize: 14, color: '#757575', marginTop: 12 }}>กำลังตรวจสอบการตั้งค่าระบบ...</div>
      </div>
    );
  }

  if (isBeforeStart) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <AlertTriangle size={64} color="#e53935" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          ยังไม่ถึงกำหนดเริ่มระบบเวรห้องสภา
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8, lineHeight: 1.5 }}>
          ฝ่ายปกครองได้ตั้งค่ากำหนดเริ่มเปิดระบบและทำเวรห้องสภาในวันที่ {new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (user?.role === 'admin' || user?.nickname === 'แอดมิน') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={64} color="#00bcd4" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          บัญชีผู้ดูแลระบบ
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8 }}>
          ในฐานะผู้ดูแลระบบ คุณได้รับการยกเว้นและไม่จำเป็นต้องปฏิบัติหรือรายงานเวรห้องสภา
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (cleanDutyState) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={64} color="#2e7d32" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#2e7d32', marginTop: 16 }}>ส่งรูปทำเวรสำเร็จ!</h2>
        <div style={{ fontSize: 15, color: '#757575', marginTop: 8 }}>เวลาที่บันทึก: {cleanDutyState.time}</div>
        
        {cleanDutyState.photo && (
          <div style={{ marginTop: 24, borderRadius: 12, overflow: 'hidden', border: '4px solid #f0f0f0', display: 'inline-block' }}>
            <img src={cleanDutyState.photo} alt="clean-duty" style={{ width: 200, height: 200, objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="page-header" style={{ textAlign: 'center' }}>
        <div className="page-title">✨ ส่งรูปทำเวรห้องสภา</div>
        <div className="page-subtitle">ถ่ายรูปเพื่อยืนยันการทำความสะอาดห้องสภานักเรียน</div>
      </div>

      <div className="card" style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <CameraCapture
            onCapture={(dataUrl) => setPhotoUrl(dataUrl)}
            facingMode="environment"
            height={280}
          />

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px 0', fontSize: 16 }}
            disabled={!photoUrl}
            onClick={handleSubmit}
          >
            ยืนยันการส่งรูป
          </button>
        </div>
      </div>
    </div>
  );
}
