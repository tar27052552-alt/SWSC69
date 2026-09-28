import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { DEPARTMENTS, ROLES } from '../data/mockData';
import { supabase } from '../supabaseClient';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const AuthContext = createContext(null);

function mapCouncilProfile(profile) {
  const dept = profile.dept_id ? DEPARTMENTS.find((d) => d.id === profile.dept_id) : null;
  const isImg = profile.avatar && (profile.avatar.startsWith('data:image') || profile.avatar.startsWith('http'));
  return {
    id: profile.id,
    name: profile.name,
    nickname: profile.nickname,
    studentId: profile.student_id,
    phone: profile.phone || '',
    deptId: profile.dept_id,
    role: profile.role,
    position: profile.position,
    avatar: isImg ? (profile.nickname?.substring(0, 1) || profile.name?.substring(0, 1) || 'U') : profile.avatar,
    profileImage: isImg ? profile.avatar : null,
    avatarColor: profile.avatar_color,
    dept,
  };
}

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
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [checkInState, setCheckInState] = useState(null);
  const [cleanDutyState, setCleanDutyState] = useState(null);
  const [greetingDutyState, setGreetingDutyState] = useState(null);
  const [modalAlert, setModalAlert] = useState(null);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMustChangePassword(false);
    localStorage.removeItem('sc_user');
    localStorage.removeItem('sc_last_active'); // Clear last active on logout
  };

  useEffect(() => {
    let active = true;
    // Never trust the legacy client-side identity after switching to Supabase Auth.
    localStorage.removeItem('sc_user');
    const loadSessionProfile = async (session) => {
      if (!session?.user) {
        if (active) {
          setUser(null);
          setMustChangePassword(false);
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_my_council_profile');
      const profile = Array.isArray(data) ? data[0] : data;
      if (error || !profile || profile.banned) {
        await supabase.auth.signOut();
        if (active) {
          setUser(null);
          setMustChangePassword(false);
        }
        return;
      }
      if (profile.must_change_password) {
        await supabase.auth.signOut();
        if (active) {
          setUser(null);
          setMustChangePassword(false);
        }
        return;
      }
      if (active) {
        setMustChangePassword(false);
        setUser(mapCouncilProfile(profile));
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadSessionProfile(session).finally(() => active && setAuthReady(true));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase calls until after the auth callback returns.
      setTimeout(() => {
        loadSessionProfile(session).finally(() => active && setAuthReady(true));
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
      // Check if user is banned
      try {
        const { data: profile, error: profileError } = await supabase.rpc('get_my_council_profile');
        if (!profileError && (!Array.isArray(profile) || profile.length === 0)) {
          console.log('User is banned. Logging out...');
          await logout();
          return;
        }
      } catch (err) {
        console.error('Error verifying banned status:', err);
      }

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
        // Check if user is exempt today (participating in external event)
        try {
          const { data: eventsData } = await supabase.from('events').select('*');
          const { data: partData } = await supabase
            .from('event_participants')
            .select('event_id')
            .eq('user_id', String(user.id));

          let exempt = false;
          if (eventsData && partData) {
            const myEventIds = partData.map(p => p.event_id);
            const hasCheckinEvent = eventsData.some(ev => {
              const start = ev.date;
              const end = ev.end_date || ev.date;
              return ev.check_attendance && myEventIds.includes(ev.id) && todayStr >= start && todayStr <= end;
            });

            if (!hasCheckinEvent) {
              const myTodayEvents = eventsData.filter(ev => {
                const start = ev.date;
                const end = ev.end_date || ev.date;
                return ev.location_category === 'external' && myEventIds.includes(ev.id) && todayStr >= start && todayStr <= end;
              });
              if (myTodayEvents.length > 0) {
                exempt = true;
              }
            }
          }

          if (exempt) {
            setCheckInState({ status: 'activity', time: 'ทำกิจกรรม', photo: null });
          } else {
            setCheckInState(null);
          }
        } catch (err) {
          console.error('Error checking today exemption in AuthContext:', err);
          setCheckInState(null);
        }
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
      // 3. Fetch today's greeting duty status
      if (user.nickname) {
        const { data: gdData, error: gdError } = await supabase
          .from('greeting_duty_checks')
          .select('status, photo, created_at')
          .eq('nickname', user.nickname)
          .eq('date', todayStr)
          .maybeSingle();

        if (!gdError && gdData) {
          const timeStr = gdData.created_at
            ? new Date(gdData.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : 'ไม่ระบุ';
          setGreetingDutyState({ status: gdData.status, time: timeStr, photo: gdData.photo });
        } else {
          setGreetingDutyState(null);
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
      setGreetingDutyState(null);
      return;
    }

    loadTodayStates();

    // Polling fallback every 15 seconds
    const interval = setInterval(() => {
      loadTodayStates();
    }, 15000);

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

    const greetingDutyChannel = supabase
      .channel('my-greetingduty-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'greeting_duty_checks' },
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
      clearInterval(interval);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(cleanDutyChannel);
      supabase.removeChannel(greetingDutyChannel);
    };
  }, [user, currentDateStr]);

  useEffect(() => {
    if (!user) return;

    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    const checkSessionTimeout = () => {
      const lastActive = localStorage.getItem('sc_last_active');
      if (lastActive) {
        const diff = Date.now() - parseInt(lastActive, 10);
        if (diff > TIMEOUT_MS) {
          console.log('Session timed out due to inactivity.');
          logout();
          window.location.reload(); // Force refresh back to login page
          return;
        }
      }
      localStorage.setItem('sc_last_active', Date.now().toString());
    };

    // Run check on mount
    checkSessionTimeout();

    // Run check when visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSessionTimeout();
      } else {
        localStorage.setItem('sc_last_active', Date.now().toString());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkSessionTimeout);

    // Update active timestamp on user clicks/interactions (throttled to at most once per 30 seconds)
    let lastRecorded = 0;
    const updateActiveTime = () => {
      const now = Date.now();
      if (now - lastRecorded > 30000) {
        lastRecorded = now;
        localStorage.setItem('sc_last_active', now.toString());
      }
    };
    window.addEventListener('click', updateActiveTime);
    window.addEventListener('keydown', updateActiveTime);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkSessionTimeout);
      window.removeEventListener('click', updateActiveTime);
      window.removeEventListener('keydown', updateActiveTime);
    };
  }, [user]);

  const login = async (studentId, password) => {
    try {
      const { data, error } = await supabase.functions.invoke('legacy-student-login', {
        body: { studentId, password },
      });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || error.message);
      }
      if (!data?.email) return { success: false, error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง' };

      if (data.token_hash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink',
        });
        if (otpError) throw otpError;
        const { data: profileData, error: profileError } = await supabase.rpc('get_my_council_profile');
        const profile = Array.isArray(profileData) ? profileData[0] : profileData;
        if (profileError || !profile || profile.banned || profile.must_change_password) {
          await supabase.auth.signOut();
          throw profileError || new Error('ตรวจสอบบัญชีหลังเข้าสู่ระบบไม่สำเร็จ');
        }
        setMustChangePassword(false);
        setUser(mapCouncilProfile(profile));
        localStorage.setItem('sc_last_active', Date.now().toString());
        return { success: true };
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (signInError) throw signInError;
      const { data: profileData, error: profileError } = await supabase.rpc('get_my_council_profile');
      const profile = Array.isArray(profileData) ? profileData[0] : profileData;
      if (profileError || !profile || profile.banned) {
        await supabase.auth.signOut();
        throw new Error('ไม่พบบัญชีสมาชิกหรือบัญชีถูกระงับ');
      }
      if (profile.must_change_password) {
        setUser(null);
        setMustChangePassword(true);
        return { success: true, needsPasswordChange: true };
      }
      setMustChangePassword(false);
      setUser(mapCouncilProfile(profile));
      localStorage.setItem('sc_last_active', Date.now().toString());
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' };
    }
  };

  const completeInitialPasswordChange = async (newPassword) => {
    try {
      const { data, error } = await supabase.functions.invoke('complete-password-migration', {
        body: { newPassword },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');

      const { data: profileData, error: profileError } = await supabase.rpc('get_my_council_profile');
      const profile = Array.isArray(profileData) ? profileData[0] : profileData;
      if (profileError || !profile || profile.must_change_password || profile.banned) {
        throw profileError || new Error('ตรวจสอบบัญชีหลังเปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
      setUser(mapCouncilProfile(profile));
      setMustChangePassword(false);
      localStorage.setItem('sc_last_active', Date.now().toString());
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ' };
    }
  };

  const updateUser = (updates) => {
    setUser((prev) => {
      const updated = prev ? { ...prev, ...updates } : null;
      return updated;
    });
  };

  const isAdmin = user?.role === ROLES.ADMIN;
  const isPresident = user?.role === ROLES.PRESIDENT;
  const isDeptHead = user?.role === ROLES.DEPT_HEAD || isAdmin || isPresident;

  const value = useMemo(() => ({
    user,
    authReady,
    mustChangePassword,
    login,
    completeInitialPasswordChange,
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
    greetingDutyState,
    setGreetingDutyState,
    setModalAlert,
  }), [
    user,
    authReady,
    mustChangePassword,
    isAdmin,
    isPresident,
    isDeptHead,
    notifications,
    checkInState,
    cleanDutyState,
    greetingDutyState,
  ]);

  return (
    <AuthContext.Provider value={value}>
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

