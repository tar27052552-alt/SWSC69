import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, AlertTriangle, Sparkles, HandHeart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import CameraCapture from '../components/CameraCapture';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

export default function GreetingDutyPage() {
  const { user, checkInState, greetingDutyState, setGreetingDutyState } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [greetingActive, setGreetingActive] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingDuty, setLoadingDuty] = useState(true);
  const [hasDutyToday, setHasDutyToday] = useState(false);
  const [isMyDutyToday, setIsMyDutyToday] = useState(false);
  const [assignedGate, setAssignedGate] = useState('');
  const [assignedGateLabel, setAssignedGateLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLateSubmission, setIsLateSubmission] = useState(false);

  useEffect(() => {
    async function initPage() {
      try {
        // Load Settings
        const { data: settingsData, error: settingsError } = await supabase.from('attendance_settings').select('*');
        if (!settingsError && settingsData) {
          const startD = settingsData.find(d => d.key === 'greeting_duty_start_date')?.value || settingsData.find(d => d.key === 'start_date')?.value;
          if (startD) setStartDate(startD);
          const greetingAct = settingsData.find(d => d.key === 'greeting_duty_active')?.value;
          if (greetingAct !== undefined) setGreetingActive(greetingAct !== 'false');
        }

        // Load today's Greeting Duty
        const DAY_MAP = { 0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัส', 5: 'ศุกร์', 6: 'เสาร์' };
        const todayKey = DAY_MAP[new Date().getDay()];

        const { data: scheduleData, error: scheduleError } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'greeting')
          .eq('day', todayKey);

        let myNickname = user?.nickname || '';
        let hasDuty = false;
        let isMyDuty = false;
        let gateKey = '';
        let gateNameTh = '';

        if (!scheduleError && scheduleData && scheduleData[0]) {
          const rowData = scheduleData[0].data || {};
          
          // Search gates
          if (rowData.gate1?.includes(myNickname)) {
            gateKey = 'gate1';
            gateNameTh = 'ประตูไหมไทย';
            isMyDuty = true;
          } else if (rowData.gate2?.includes(myNickname)) {
            gateKey = 'gate2';
            gateNameTh = 'ประตูอำเภอ';
            isMyDuty = true;
          } else if (rowData.gate3?.includes(myNickname)) {
            gateKey = 'gate3';
            gateNameTh = 'ประตูหน้า รร.';
            isMyDuty = true;
          }

          // Check if any members assigned today
          const totalMembersToday = [
            ...(rowData.gate1 || []),
            ...(rowData.gate2 || []),
            ...(rowData.gate3 || [])
          ];
          hasDuty = totalMembersToday.length > 0 && totalMembersToday.some(n => n !== '–');
        }

        setHasDutyToday(hasDuty);
        setIsMyDutyToday(isMyDuty);
        setAssignedGate(gateKey);
        setAssignedGateLabel(gateNameTh);

        // Check if late (after 07:10 AM)
        const now = new Date();
        const isLate = now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 10);
        setIsLateSubmission(isLate);

      } catch (err) {
        console.error('Error in GreetingDutyPage init:', err);
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

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    const todayFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Recalculate late submission on submit moment
    const isLate = now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 10);

    try {
      if (user) {
        let finalPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:')) {
          try {
            const fileName = `greetingduty_${user.nickname || 'user'}_${todayFormatted}_${Date.now()}.jpg`;
            const uploadResult = await uploadFileToDrive(photoUrl, fileName, 'duties');
            if (uploadResult && uploadResult.url) {
              finalPhotoUrl = uploadResult.url;
            }
          } catch (uploadErr) {
            console.error("Failed to upload greeting duty image to Google Drive. Using local base64 fallback:", uploadErr);
          }
        }

        const record = {
          nickname: user.nickname,
          date: todayFormatted,
          gate: assignedGate,
          status: 'done',
          photo: finalPhotoUrl
        };

        const { error: upsertError } = await supabase
          .from('greeting_duty_checks')
          .upsert([record], { onConflict: 'nickname,date' });
          
        if (upsertError) {
          console.error("Greeting Duty error:", upsertError);
          alert("ไม่สามารถบันทึกข้อมูลได้: " + upsertError.message);
          isSubmitting.current = false;
          setSubmitting(false);
          return;
        }

        // Notify Discord (attendance channel)
        const embedTitle = `🙏 [เวรยืนไหว้] ${user.nickname} รายงานตัวเวรยืนไหว้${isLate ? ' (ล่าช้า ⚠️)' : ' สำเร็จ'}`;
        const embedDesc = `ส่งรายงานรูปภาพการปฏิบัติหน้าที่เวรยืนไหว้ ณ **${assignedGateLabel}** ประจำวันที่ **${todayFormatted}** เวลา **${timeStr}**`;
        const embedColor = isLate ? 15158332 : 3066993; // Red if late, Green if on time
        
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, embedColor, [], finalPhotoUrl, 'attendance_alerts');
        
        // Update local state with Google Drive URL
        setGreetingDutyState({ status: 'done', time: timeStr, photo: finalPhotoUrl });
        alert('อัปโหลดหลักฐานปฏิบัติหน้าที่สำเร็จแล้วครับ!');
      }
    } catch (err) {
      console.error('Error submitting greeting duty to Supabase:', err);
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
          ยังไม่ถึงกำหนดเริ่มระบบเวรยืนไหว้
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8, lineHeight: 1.5 }}>
          ฝ่ายปกครองได้ตั้งค่ากำหนดเริ่มเปิดระบบเวรยืนไหว้ในวันที่ {new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
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
          ในฐานะผู้ดูแลระบบ คุณได้รับการยกเว้นและไม่จำเป็นต้องปฏิบัติหรือรายงานเวรยืนไหว้
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (!greetingActive) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <AlertTriangle size={64} color="#e53935" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          ระบบส่งรายงานเวรยืนไหว้ต้อนรับปิดให้บริการชั่วคราว
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
    const DAY_MAP = { 0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัส', 5: 'ศุกร์', 6: 'เสาร์' };
    const todayKey = DAY_MAP[new Date().getDay()];
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 64, margin: '0 auto' }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          เฉพาะผู้มีเวรยืนไหว้ในวันนี้
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8, lineHeight: 1.6 }}>
          ระบบจำกัดให้ส่งรายงานเวรได้เฉพาะผู้ที่มีรายชื่อปฏิบัติหน้าที่เวรยืนไหว้ต้อนรับในวัน{todayKey}เท่านั้น
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (!checkInState) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 64, margin: '0 auto' }}>📍</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          กรุณาเช็คชื่อเข้าโรงเรียนก่อน
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8, lineHeight: 1.6 }}>
          วันนี้คุณมีเวรปฏิบัติหน้าที่ยืนไหว้ต้อนรับ แต่จำเป็นต้องเช็คชื่อมาโรงเรียนและยืนยันตัวตนผ่านระบบเช็คชื่อปกติให้เรียบร้อยก่อน จึงจะสามารถส่งรายงานรูปภาพการปฏิบัติเวรยืนไหว้ได้
        </div>
        <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-gray" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/checkin')}>
            ไปหน้าเช็คชื่อเข้า รร.
          </button>
        </div>
      </div>
    );
  }

  if (greetingDutyState) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={64} color="#2e7d32" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#2e7d32', marginTop: 16 }}>ส่งรูปปฏิบัติเวรสำเร็จ!</h2>
        <div style={{ fontSize: 15, color: '#757575', marginTop: 8 }}>สถานที่ปฏิบัติงาน: {assignedGateLabel}</div>
        <div style={{ fontSize: 15, color: '#757575', marginTop: 4 }}>เวลาที่บันทึก: {greetingDutyState.time}</div>
        
        {greetingDutyState.photo && (
          <div style={{ marginTop: 24, borderRadius: 12, overflow: 'hidden', border: '4px solid #f0f0f0', display: 'inline-block' }}>
            <img src={transformGoogleDriveUrl(greetingDutyState.photo)} alt="greeting-duty" style={{ width: 200, height: 200, objectFit: 'cover', display: 'block' }} />
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
        <div className="page-title">🙏 รายงานตัวเวรยืนไหว้</div>
        <div className="page-subtitle">กรุณาอัปโหลดรูปภาพยืนเวรก่อนเวลา 07:10 น.</div>
      </div>

      <div className="card" style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <HandHeart size={48} color="#00bcd4" />
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#37474f', margin: 0 }}>
              ประจำการ: {assignedGateLabel}
            </h3>
            <p style={{ fontSize: 13, color: '#757575', marginTop: 6, lineHeight: 1.5 }}>
              ถ่ายภาพเซลฟี่ของตัวท่านขณะปฏิบัติหน้าที่ต้อนรับบริเวณหน้าประตูโรงเรียนเพื่อยืนยันการทำหน้าที่จริง
            </p>
          </div>

          {isLateSubmission && (
            <div style={{ 
              background: '#ffebee', 
              border: '1px solid #ffcdd2', 
              color: '#c62828', 
              borderRadius: 8, 
              padding: '10px 14px', 
              fontSize: 12, 
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              width: '100%'
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>คำเตือน: เลยเวลา 07:10 น. แล้ว!</strong>
                <div style={{ marginTop: 2, lineHeight: 1.4, color: '#b71c1c' }}>
                  ระบบอาจทำการบันทึกค่าปรับล่าช้า 100 บาท อย่างไรก็ตาม ขอให้ท่านรายงานรูปภาพส่งเพื่อเป็นหลักฐานให้ฝ่ายปกครองทราบ
                </div>
              </div>
            </div>
          )}

          <CameraCapture
            onCapture={(dataUrl) => setPhotoUrl(dataUrl)}
            facingMode="user"
            height={280}
          />

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px 0', fontSize: 16 }}
            disabled={!photoUrl || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'กำลังบันทึกหลักฐาน...' : 'ส่งรายงานตัวเวรยืนไหว้'}
          </button>
        </div>
      </div>
    </div>
  );
}
