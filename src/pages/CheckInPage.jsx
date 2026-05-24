import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import CameraCapture from '../components/CameraCapture';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

export default function CheckInPage() {
  const { user, checkInState, setCheckInState } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0=start, 1=locating, 2=camera
  const [photoUrl, setPhotoUrl] = useState(null);
  const [distanceInfo, setDistanceInfo] = useState('');
  const [enabledDays, setEnabledDays] = useState(["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]);
  const [disabledDates, setDisabledDates] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [greetingSchedules, setGreetingSchedules] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const isSubmitting = useRef(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('attendance_settings').select('*');
        if (error) throw error;
        if (data) {
          const days = data.find(d => d.key === 'enabled_days')?.value;
          const dates = data.find(d => d.key === 'disabled_dates')?.value;
          const startD = data.find(d => d.key === 'start_date')?.value;
          if (days) setEnabledDays(days);
          if (dates) setDisabledDates(dates);
          if (startD) setStartDate(startD);
        }
      } catch (err) {
        console.error('Error loading settings in CheckInPage:', err);
      } finally {
        setLoadingSettings(false);
      }
    }
    async function loadGreetingSchedules() {
      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'greeting');
        if (!error && data) {
          setGreetingSchedules(data);
        }
      } catch (err) {
        console.error('Error loading greeting schedules:', err);
      }
    }
    
    loadSettings();
    loadGreetingSchedules();

    // 10-second interval to check/update date
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 10000);

    // Supabase Realtime channel subscriptions
    const settingsChannel = supabase
      .channel('attendance-settings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_settings' },
        () => {
          loadSettings();
        }
      )
      .subscribe();

    const schedulesChannel = supabase
      .channel('schedules-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules' },
        () => {
          loadGreetingSchedules();
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(schedulesChannel);
    };
  }, []);

  const toGregorianStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = toGregorianStr(currentDate);
  const todayDayName = TH_DAYS[currentDate.getDay()];
  const isBeforeStart = startDate && todayStr < startDate;
  const isEnabledToday = enabledDays.includes(todayDayName) && !disabledDates.includes(todayStr) && !isBeforeStart;

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleStartCheckIn = () => {
    setStep(1);
    
    if (!navigator.geolocation) {
      alert("เบราว์เซอร์ไม่รองรับ GPS");
      setStep(0); return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const schoolLat = 16.713227719670115; 
        const schoolLng = 98.57308240750432;
        const dist = getDistance(latitude, longitude, schoolLat, schoolLng);
        
        if (dist > 300) {
          alert(`ไม่สามารถเช็คชื่อได้! คุณอยู่ห่างจากโรงเรียน ${Math.round(dist)} เมตร (ต้องไม่เกิน 300 เมตร)`);
          setStep(0);
        } else {
          setDistanceInfo(`ระยะห่างจากโรงเรียน: ${Math.round(dist)} เมตร`);
          setTimeout(() => setStep(2), 1500);
        }
      },
      (err) => {
        alert("ไม่สามารถดึงตำแหน่งได้ กรุณาเปิด GPS");
        setStep(0);
      }
    );
  };

  const handleSubmitCheckIn = async () => {
    if (isSubmitting.current || submitting) return;
    isSubmitting.current = true;
    setSubmitting(true);

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    
    // Check duty
    const dayIndex = now.getDay();
    const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    const todayName = daysTh[dayIndex];
    
    let hasGreetingDuty = false;
    const todaySchedule = greetingSchedules.find(s => s.day === todayName);
    if (todaySchedule && user?.nickname) {
      const scheduleData = todaySchedule.data || {};
      if (scheduleData.gate1?.includes(user.nickname) ||
          scheduleData.gate2?.includes(user.nickname) ||
          scheduleData.gate3?.includes(user.nickname)) {
        hasGreetingDuty = true;
      }
    }

    const limitM = hasGreetingDuty ? 0 : 35; // 07:00 or 07:35
    const isLate = (h > 7) || (h === 7 && m > limitM); 
    const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} น.`;
    const status = isLate ? 'late' : 'on_time';
    
    try {
      if (user) {
        let finalPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:')) {
          try {
            const fileName = `selfie_${user.nickname || user.id}_${toGregorianStr(now)}_${Date.now()}.jpg`;
            const uploadResult = await uploadFileToDrive(photoUrl, fileName, 'selfies');
            if (uploadResult && uploadResult.url) {
              finalPhotoUrl = uploadResult.url;
            }
          } catch (uploadErr) {
            console.error("Failed to upload selfie to Google Drive. Storing locally as Base64 as fallback:", uploadErr);
          }
        }

        const record = {
          user_id: String(user.id),
          user_name: user.name,
          nickname: user.nickname,
          date: toGregorianStr(now),
          time: timeStr,
          status: status,
          photo: finalPhotoUrl,
          is_manual: false
        };
        const { error: upsertError } = await supabase
          .from('student_attendance')
          .upsert([record], { onConflict: 'user_id,date' });
        
        if (upsertError) {
          console.error("CheckIn error:", upsertError);
          alert("ไม่สามารถบันทึกข้อมูลได้: " + upsertError.message);
          isSubmitting.current = false;
          setSubmitting(false);
          return;
        }

        // Auto-fine if late
        let minutesLate = 0;
        let finalAmount = 0;

        if (isLate) {
          const limitHour = 7;
          const limitMinute = limitM;
          const limitDate = new Date(now);
          limitDate.setHours(limitHour, limitMinute, 0, 0);

          if (now > limitDate) {
            const diffMs = now - limitDate;
            minutesLate = Math.ceil(diffMs / (1000 * 60));
          }

          if (minutesLate > 0) {
            const dateStr = toGregorianStr(now);
            // Check if fine already exists for this user, date and violation
            const { data: existingFine } = await supabase
              .from('discipline_fines')
              .select('id')
              .eq('user_id', String(user.id))
              .eq('date', dateStr)
              .eq('violation', 'มาสาย (นาที)');

            if (!existingFine || existingFine.length === 0) {
              const baseAmount = 5; // 5 Baht per minute
              finalAmount = baseAmount * minutesLate;

              // 2x fine multiplier for Discipline dept (deptId === 2)
              if (user.deptId === 2) {
                finalAmount *= 2;
              }

              const fineRecord = {
                user_id: String(user.id),
                user_name: user.name,
                nickname: user.nickname,
                violation: 'มาสาย (นาที)',
                amount: finalAmount,
                date: dateStr,
                note: `มาสาย ${minutesLate} นาที (เวลาเช็คชื่อ ${timeStr})${user.deptId === 2 ? ' - ปรับ 2 เท่าเนื่องจากเป็นสารวัตรนักเรียน' : ''}`,
                by: 'ระบบอัตโนมัติ',
                paid: false
              };
              await supabase.from('discipline_fines').insert([fineRecord]);
            } else {
              const baseAmount = 5;
              finalAmount = baseAmount * minutesLate;
              if (user.deptId === 2) finalAmount *= 2;
            }
          }
        }

        // Notify Discord
        let embedTitle = `🟢 [เช็คชื่อเข้าแถว] ${user.nickname} เช็คชื่อสำเร็จ`;
        let embedDesc = `เมื่อเวลา **${timeStr}** ของวันที่ **${toGregorianStr(now)}**`;
        let embedColor = 3066993; // Green
        const fields = [];

        if (status === 'late') {
          embedColor = 15158332; // Red
          embedTitle = `🔴 [เช็คชื่อเข้าแถว] ${user.nickname} มาสาย!`;
          embedDesc += `\n⚠️ เช็คชื่อสายไป **${minutesLate}** นาที (เกณฑ์ยืนเวร/สภาคือ 07:${limitM.toString().padStart(2,'0')} น.)`;
          fields.push({
            name: "ค่าปรับอัตโนมัติ",
            value: `💸 โดนปรับ **${finalAmount}** บาท (บันทึกเข้าระบบ)`,
            inline: true
          });
        }

        // Send to Discord (attendance channel)
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, embedColor, fields, finalPhotoUrl, 'attendance_alerts');
      }
      setCheckInState({ status: status, time: timeStr, photo: photoUrl });
    } catch (err) {
      console.error('Error submitting attendance and logging auto-fine:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.role === 'admin' || user?.nickname === 'แอดมิน') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={64} color="#00bcd4" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          บัญชีผู้ดูแลระบบ
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8 }}>
          ในฐานะผู้ดูแลระบบ คุณได้รับการยกเว้นและไม่จำเป็นต้องเช็คชื่อเข้าโรงเรียน
        </div>
        <div style={{ marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (checkInState) {
    let icon = <AlertTriangle size={64} color="#c62828" style={{ margin: '0 auto' }} />;
    let titleText = 'คุณมาสาย!';
    let titleColor = '#c62828';

    if (checkInState.status === 'on_time') {
      icon = <CheckCircle size={64} color="#2e7d32" style={{ margin: '0 auto' }} />;
      titleText = 'เช็คชื่อสำเร็จ!';
      titleColor = '#2e7d32';
    } else if (checkInState.status === 'leave') {
      icon = <CheckCircle size={64} color="#f57f17" style={{ margin: '0 auto' }} />;
      titleText = 'บันทึกการลาแล้ว';
      titleColor = '#f57f17';
    } else if (checkInState.status === 'missing') {
      icon = <AlertTriangle size={64} color="#616161" style={{ margin: '0 auto' }} />;
      titleText = 'คุณขาดแถว!';
      titleColor = '#616161';
    } else if (checkInState.status === 'not_required') {
      icon = <CheckCircle size={64} color="#455a64" style={{ margin: '0 auto' }} />;
      titleText = 'ได้รับการยกเว้น';
      titleColor = '#455a64';
    }

    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        {icon}
        <h2 style={{ fontSize: 24, fontWeight: 700, color: titleColor, marginTop: 16 }}>
          {titleText}
        </h2>
        <div style={{ fontSize: 15, color: '#757575', marginTop: 8 }}>บันทึกเวลา: {checkInState.time || '-'}</div>
        
        {checkInState.photo && (
          <div style={{ marginTop: 24, borderRadius: 12, overflow: 'hidden', border: '4px solid #f0f0f0', display: 'inline-block' }}>
            <img src={transformGoogleDriveUrl(checkInState.photo)} alt="check-in selfie" style={{ width: 200, height: 200, objectFit: 'cover', display: 'block' }} />
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
        <div className="page-title">📍 เช็คชื่อมาโรงเรียน</div>
        <div className="page-subtitle">กรุณาเช็คชื่อก่อนเวลา 07:35 น. (เวรยืนไหว้ 07:00 น.)</div>
      </div>

      <div className="card" style={{ padding: '32px 20px', textAlign: 'center' }}>
        {step === 0 && (
          loadingSettings ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
              <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 14, color: '#757575' }}>กำลังตรวจสอบการตั้งค่าระบบ...</div>
            </div>
          ) : !isEnabledToday ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 10px' }}>
              <AlertTriangle size={56} color="#e53935" />
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#37474f', margin: 0 }}>
                  {isBeforeStart ? 'ยังไม่ถึงกำหนดเริ่มระบบเช็คชื่อ' : 'วันนี้ไม่ได้เปิดระบบเช็คชื่อสภานักเรียน'}
                </h3>
                <p style={{ fontSize: 13, color: '#757575', marginTop: 8, lineHeight: 1.5 }}>
                  {isBeforeStart 
                    ? `ฝ่ายปกครองได้ตั้งค่ากำหนดเริ่มเปิดระบบเช็คชื่อในวันที่ ${new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : `ฝ่ายปกครองได้ปิดระบบการเช็คชื่อเข้าแถวในวันนี้ (วัน${todayDayName}ที่ ${currentDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })})`
                  }
                </p>
              </div>
              <button className="btn btn-gray" onClick={() => navigate('/dashboard')} style={{ width: '100%', marginTop: 8 }}>
                กลับหน้าหลัก
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <MapPin size={48} color="#00bcd4" />
              <div style={{ fontSize: 14, color: '#616161' }}>
                ระบบจะทำการตรวจสอบพิกัด GPS ว่าคุณอยู่ในบริเวณโรงเรียนหรือไม่ จากนั้นให้ถ่ายภาพเซลฟี่เพื่อยืนยันตัวตน
              </div>
              <button className="btn btn-primary" onClick={handleStartCheckIn} style={{ marginTop: 16, width: '100%', padding: '12px 0', fontSize: 16 }}>
                เริ่มเช็คชื่อ
              </button>
            </div>
          )
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 0' }}>
            <div style={{ width: 60, height: 60, border: '5px solid #f3f3f3', borderTop: '5px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>กำลังดึงตำแหน่ง GPS...</div>
              <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 4 }}>กรุณารอสักครู่ ระบบกำลังตรวจสอบพิกัด</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 13, background: '#e0f7fa', color: '#00838f', padding: '8px 16px', borderRadius: 20, fontWeight: 500 }}>
              ✓ ตำแหน่งผ่านเกณฑ์ ({distanceInfo})
            </div>
            
            <CameraCapture
              onCapture={(dataUrl) => setPhotoUrl(dataUrl)}
              facingMode="user"
              height={280}
            />

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '12px 0', fontSize: 16 }}
              disabled={!photoUrl || submitting}
              onClick={handleSubmitCheckIn}
            >
              {submitting ? 'กำลังบันทึก...' : 'บันทึกการเช็คชื่อ'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
