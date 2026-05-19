import { createContext, useContext, useState, useEffect } from 'react';
import { DEPARTMENTS, ROLES } from '../data/mockData';
import { supabaseRpc } from '../lib/supabaseRest';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [checkInState, setCheckInState] = useState(null);
  const [cleanDutyState, setCleanDutyState] = useState(null);

  useEffect(() => {
    if (!user) {
      setCheckInState(null);
      setCleanDutyState(null);
      return;
    }

    async function loadTodayStates() {
      try {
        const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

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
    }

    loadTodayStates();
  }, [user]);

  const login = async (studentId, password) => {
    try {
      const rows = await supabaseRpc('login_student', { p_student_id: studentId, p_password: password });
      const found = Array.isArray(rows) ? rows[0] : null;
      if (!found) return { success: false, error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง' };

      const dept = found.dept_id ? DEPARTMENTS.find((d) => d.id === found.dept_id) : null;
      const isImg = found.avatar && (found.avatar.startsWith('data:image') || found.avatar.startsWith('http'));
      setUser({
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
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' };
    }
  };

  const logout = () => setUser(null);

  const updateUser = (updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
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
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

