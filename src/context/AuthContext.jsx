import { createContext, useContext, useState, useEffect } from 'react';
import { DEPARTMENTS, ROLES } from '../data/mockData';
import { supabaseRpc } from '../lib/supabaseRest';
import { supabase } from '../supabaseClient';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const AuthContext = createContext(null);

function CustomModalAlert({ title, message, type, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 size={32} style={{ color: '#10b981' }} />,
    error: <XCircle size={32} style={{ color: '#ef4444' }} />,
    warning: <AlertTriangle size={32} style={{ color: '#f59e0b' }} />,
    info: <Info size={32} style={{ color: '#3b82f6' }} />
  };

  const bgColors = {
    success: '#e8f5e9',
    error: '#ffebee',
    warning: '#fffde7',
    info: '#e3f2fd'
  };

  const buttonColors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f57f17',
    info: '#1565c0'
  };

  // Strip emojis from the message if they exist since we now have a gorgeous header icon
  let cleanMessage = message;
  if (message.startsWith('❌ ') || message.startsWith('✅ ') || message.startsWith('⚠️ ') || message.startsWith('💡 ')) {
    cleanMessage = message.substring(2);
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)', // Sleek modern dark overlay
      backdropFilter: 'blur(8px)', // Glassmorphism backdrop
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      animation: 'fadeIn 0.2s ease-out'
    }} onClick={onClose}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        width: '90%',
        maxWidth: '380px',
        padding: '28px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }} onClick={e => e.stopPropagation()}>
        
        {/* Soft circle icon container */}
        <div style={{
          background: bgColors[type] || bgColors.info,
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '4px',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
        }}>
          {icons[type] || icons.info}
        </div>

        {/* Title */}
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#1e293b',
          letterSpacing: '-0.025em'
        }}>{title}</div>

        {/* Message */}
        <div style={{
          fontSize: '14px',
          color: '#64748b',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: '0 8px 8px 8px'
        }}>{cleanMessage}</div>

        {/* Action Button */}
        <button 
          style={{
            background: buttonColors[type] || '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s ease',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}
          onClick={onClose}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
          }}
          onMouseDown={e => {
            e.currentTarget.style.transform = 'translateY(1px)';
          }}
        >
          ตกลง
        </button>
      </div>
    </div>
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('sc_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved user session:', e);
      }
    }
    return null;
  });
  const [notifications, setNotifications] = useState([]);
  const [checkInState, setCheckInState] = useState(null);
  const [cleanDutyState, setCleanDutyState] = useState(null);
  const [modalAlert, setModalAlert] = useState(null);

  useEffect(() => {
    window.alert = (message) => {
      let type = 'info';
      let title = 'แจ้งเตือน';
      
      const msgStr = String(message);
      const msgLower = msgStr.toLowerCase();
      if (
        msgLower.includes('เกิดข้อผิดพลาด') || 
        msgLower.includes('ไม่สำเร็จ') || 
        msgLower.includes('ล้มเหลว') || 
        msgLower.includes('ไม่พบ') || 
        msgLower.includes('ผิดพลาด') ||
        msgLower.includes('error') ||
        msgLower.includes('ไม่สามารถ') ||
        msgLower.includes('ไม่ผ่าน') ||
        msgLower.includes('ไม่ถูกต้อง') ||
        msgLower.includes('ไม่ตรง')
      ) {
        type = 'error';
        title = 'เกิดข้อผิดพลาด';
      } else if (
        msgLower.includes('สำเร็จ') || 
        msgLower.includes('เรียบร้อย') || 
        msgLower.includes('ถูกต้อง') || 
        msgLower.includes('ผ่าน') ||
        msgLower.includes('success')
      ) {
        type = 'success';
        title = 'สำเร็จ';
      } else if (
        msgLower.includes('กรุณา') || 
        msgLower.includes('ระบุ') || 
        msgLower.includes('เลือก') || 
        msgLower.includes('เตือน')
      ) {
        type = 'warning';
        title = 'คำเตือน';
      }
      
      setModalAlert({
        title,
        message: msgStr,
        type,
        onClose: () => setModalAlert(null)
      });
    };
  }, []);

  const toGregorianStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [currentDateStr, setCurrentDateStr] = useState(() => toGregorianStr());

  useEffect(() => {
    const timer = setInterval(() => {
      const todayStr = toGregorianStr();
      if (todayStr !== currentDateStr) {
        setCurrentDateStr(todayStr);
      }
    }, 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, [currentDateStr]);

  const loadTodayStates = async () => {
    if (!user) return;
    try {
      const todayStr = currentDateStr;

      // 1. Fetch today's check-in status
      const { data: attData, error: attError } = await supabase
        .from('student_attendance')
        .select('status, time, photo')
        .eq('user_id', String(user.id))
        .eq('date', todayStr)
        .maybeSingle();

      if (!attError && attData) {
        setCheckInState({ status: attData.status, time: attData.time, photo: attData.photo });
      } else {
        setCheckInState(null);
      }

      // 2. Fetch today's clean duty status
      if (user.nickname) {
        const { data: cdData, error: cdError } = await supabase
          .from('clean_duty_checks')
          .select('status, photo, created_at')
          .eq('nickname', user.nickname)
          .eq('date', todayStr)
          .maybeSingle();

        if (!cdError && cdData) {
          const timeStr = cdData.created_at
            ? new Date(cdData.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : 'ไม่ระบุ';
          setCleanDutyState({ status: cdData.status, time: timeStr, photo: cdData.photo });
        } else {
          setCleanDutyState(null);
        }
      }
    } catch (err) {
      console.error('Error fetching today states from Supabase:', err);
    }
  };

  useEffect(() => {
    if (!user) {
      setCheckInState(null);
      setCleanDutyState(null);
      return;
    }

    loadTodayStates();

    // Subscribe to realtime updates for current user's check-in and clean duty status
    const attendanceChannel = supabase
      .channel('my-attendance-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_attendance' },
        (payload) => {
          const targetUserId = payload.new ? payload.new.user_id : (payload.old ? payload.old.user_id : null);
          const targetDate = payload.new ? payload.new.date : (payload.old ? payload.old.date : null);
          if (targetUserId && String(targetUserId) === String(user.id) && targetDate === currentDateStr) {
            loadTodayStates();
          }
        }
      )
      .subscribe();

    const cleanDutyChannel = supabase
      .channel('my-cleanduty-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clean_duty_checks' },
        (payload) => {
          const targetNickname = payload.new ? payload.new.nickname : (payload.old ? payload.old.nickname : null);
          const targetDate = payload.new ? payload.new.date : (payload.old ? payload.old.date : null);
          if (targetNickname && targetNickname === user.nickname && targetDate === currentDateStr) {
            loadTodayStates();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(cleanDutyChannel);
    };
  }, [user, currentDateStr]);

  const login = async (studentId, password) => {
    try {
      const rows = await supabaseRpc('login_student', { p_student_id: studentId, p_password: password });
      const found = Array.isArray(rows) ? rows[0] : null;
      if (!found) return { success: false, error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง' };

      const dept = found.dept_id ? DEPARTMENTS.find((d) => d.id === found.dept_id) : null;
      const isImg = found.avatar && (found.avatar.startsWith('data:image') || found.avatar.startsWith('http'));
      const userData = {
        id: found.id,
        name: found.name,
        nickname: found.nickname,
        studentId: found.student_id,
        phone: found.phone || '',
        deptId: found.dept_id,
        role: found.role,
        position: found.position,
        avatar: isImg ? (found.nickname?.substring(0, 1) || found.name?.substring(0, 1) || 'U') : found.avatar,
        profileImage: isImg ? found.avatar : null,
        avatarColor: found.avatar_color,
        dept,
      };
      setUser(userData);
      localStorage.setItem('sc_user', JSON.stringify(userData));
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sc_user');
  };

  const updateUser = (updates) => {
    setUser((prev) => {
      const updated = prev ? { ...prev, ...updates } : null;
      if (updated) {
        localStorage.setItem('sc_user', JSON.stringify(updated));
      } else {
        localStorage.removeItem('sc_user');
      }
      return updated;
    });
  };

  const isAdmin = user?.role === ROLES.ADMIN;
  const isPresident = user?.role === ROLES.PRESIDENT;
  const isDeptHead = user?.role === ROLES.DEPT_HEAD || isAdmin || isPresident;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        updateUser,
        isAdmin,
        isPresident,
        isDeptHead,
        notifications,
        setNotifications,
        checkInState,
        setCheckInState,
        cleanDutyState,
        setCleanDutyState,
      }}
    >
      {children}
      {modalAlert && (
        <CustomModalAlert
          title={modalAlert.title}
          message={modalAlert.message}
          type={modalAlert.type}
          onClose={modalAlert.onClose}
        />
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

