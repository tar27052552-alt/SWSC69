import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import CameraCapture from '../components/CameraCapture';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

export default function CleanDutyPage() {
  const { user, cleanDutyState, setCleanDutyState } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [cleanActive, setCleanActive] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingDuty, setLoadingDuty] = useState(true);
  const [dutyMembers, setDutyMembers] = useState([]);
  const [hasDutyToday, setHasDutyToday] = useState(false);
  const [isMyDutyToday, setIsMyDutyToday] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function initPage() {
      try {
        // Load Settings
        const { data: settingsData, error: settingsError } = await supabase.from('attendance_settings').select('*');
        if (!settingsError && settingsData) {
          const startD = settingsData.find(d => d.key === 'clean_duty_start_date')?.value || settingsData.find(d => d.key === 'start_date')?.value;
          if (startD) setStartDate(startD);
          const cleanAct = settingsData.find(d => d.key === 'clean_duty_active')?.value;
          if (cleanAct !== undefined) setCleanActive(cleanAct !== 'false');
        }

        // Load today's Clean Room Duty
        const DAY_MAP = { 0:'อาทิตย์', 1:'จันทร์', 2:'อังคาร', 3:'พุธ', 4:'พฤหัส', 5:'ศุกร์', 6:'เสาร์' };
        const todayKey = DAY_MAP[new Date().getDay()];
        
        const { data: scheduleData, error: scheduleError } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'clean_room')
          .eq('day', todayKey);
        
        let members = [];
        if (!scheduleError && scheduleData && scheduleData[0]) {
          const rowData = scheduleData[0].data;
          members = rowData.members || [];
        }
        
        setDutyMembers(members);
        const hasDuty = members.length > 0 && members[0] !== '–';
        setHasDutyToday(hasDuty);
        
        const myNickname = user?.nickname || '';
        const isMyDuty = hasDuty && members.some(n => n === myNickname);
        setIsMyDutyToday(isMyDuty);
      } catch (err) {
        console.error('Error in CleanDutyPage init:', err);
      } finally {
        setLoadingSettings(false);
        setLoadingDuty(false);
      }
    }
    initPage();
  }, [user]);

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const isBeforeStart = startDate && todayStr < startDate;
  
  const isSubmitting = useRef(false);

  const handleSubmit = async () => {
    if (isSubmitting.current || submitting) return;
    isSubmitting.current = true;
    setSubmitting(true);

    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    const todayFormatted = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    
    try {
      if (user) {
        let finalPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:')) {
          try {
            const fileName = `cleanduty_${user.nickname || 'user'}_${todayFormatted}_${Date.now()}.jpg`;
            const uploadResult = await uploadFileToDrive(photoUrl, fileName, 'duties');
            if (uploadResult && uploadResult.url) {
              finalPhotoUrl = uploadResult.url;
            }
          } catch (uploadErr) {
            console.error("Failed to upload clean duty image to Google Drive. Using local base64 fallback:", uploadErr);
          }
        }

        const record = {
          nickname: user.nickname,
          date: todayFormatted,
          status: 'done',
          photo: finalPhotoUrl
        };
        const { error: upsertError } = await supabase
          .from('clean_duty_checks')
          .upsert([record], { onConflict: 'nickname,date' });
          
        if (upsertError) {
          console.error("Clean Duty error:", upsertError);
          alert("ไม่สามารถบันทึกข้อมูลได้: " + upsertError.message);
          isSubmitting.current = false;
          setSubmitting(false);
          return;
        }

        // Notify Discord (attendance channel)
        const embedTitle = `🧹 [เวรห้องสภา] ${user.nickname} ส่งรายงานเวรเรียบร้อย`;
        const embedDesc = `ส่งรายงานการทำความสะอาดห้องสภานักเรียนประจำวันที่ **${todayFormatted}** เวลา **${timeStr}**`;
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, [], finalPhotoUrl, 'attendance_alerts');
        
        // Update local state with Google Drive URL
        setCleanDutyState({ status: 'done', time: timeStr, photo: finalPhotoUrl });
      }
    } catch (err) {
      console.error('Error submitting clean duty to Supabase:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      isSubmitting.current = false;
      setSubmitting(false);
    }
  };

  if (loadingSettings || loadingDuty) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <div style={{ fontSize: 14, color: '#757575', marginTop: 12 }}>กำลังตรวจสอบข้อมูลเวรวันนี้...</div>
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

  if (!cleanActive) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <AlertTriangle size={64} color="#e53935" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          ระบบส่งเวรทำความสะอาดปิดให้บริการชั่วคราว
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8 }}>
          ผู้ดูแลระบบได้ปิดใช้งานส่วนนี้ชั่วคราว กรุณาติดตามประกาศหรือติดต่อฝ่ายปกครอง
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (!isMyDutyToday) {
    const DAY_MAP = { 0:'อาทิตย์', 1:'จันทร์', 2:'อังคาร', 3:'พุธ', 4:'พฤหัส', 5:'ศุกร์', 6:'เสาร์' };
    const todayKey = DAY_MAP[new Date().getDay()];
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 64, margin: '0 auto' }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          เฉพาะผู้มีเวรทำความสะอาดในวันนี้
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8, lineHeight: 1.6 }}>
          ระบบจำกัดให้ส่งรายงานเวรได้เฉพาะผู้ที่มีรายชื่อเวรทำความสะอาดในวัน{todayKey}เท่านั้น
        </div>
        
        <div style={{ 
          marginTop: 24, 
          padding: '16px 20px', 
          background: '#f8f9fa', 
          borderRadius: 8, 
          border: '1px solid #e9ecef',
          display: 'inline-block',
          minWidth: 280
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#495057', marginBottom: 8 }}>
            รายชื่อผู้รับผิดชอบวันนี้:
          </div>
          {hasDutyToday ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {dutyMembers.map((n, i) => (
                <span key={i} style={{
                  background: '#e0f7fa',
                  color: '#00838f',
                  border: '1px solid #b2ebf2',
                  borderRadius: 4, 
                  padding: '4px 10px', 
                  fontSize: 13, 
                  fontWeight: 600,
                }}>{n}</span>
              ))}
            </div>
          ) : (
            <div style={{ color: '#6c757d', fontSize: 13 }}>ไม่มีเวรทำความสะอาดในวันนี้ (วันหยุด)</div>
          )}
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
            <img src={transformGoogleDriveUrl(cleanDutyState.photo)} alt="clean-duty" style={{ width: 200, height: 200, objectFit: 'cover', display: 'block' }} />
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
            disabled={!photoUrl || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'กำลังบันทึก...' : 'ยืนยันการส่งรูป'}
          </button>
        </div>
      </div>
    </div>
  );
}
