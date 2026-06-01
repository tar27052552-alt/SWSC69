import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SchedulesPage from './pages/SchedulesPage';
import CalendarPage from './pages/CalendarPage';
import MyStats from './pages/MyStats';
import SettingsPage from './pages/SettingsPage';
import CheckInPage from './pages/CheckInPage';
import CleanDutyPage from './pages/CleanDutyPage';
import GreetingDutyPage from './pages/GreetingDutyPage';
import MyAttendancePage from './pages/MyAttendancePage';
import AdminPage from './pages/AdminPage';
import DisciplinePage from './pages/DisciplinePage';
import MyFinesPage from './pages/MyFinesPage';
import FinancePage from './pages/FinancePage';
import PRPage from './pages/PRPage';
import AVPage from './pages/AVPage';
import SecretaryPage from './pages/SecretaryPage';
import AcademicPage from './pages/AcademicPage';
import OfficePage from './pages/OfficePage';
import RecreationPage from './pages/RecreationPage';
import FacilitiesPage from './pages/FacilitiesPage';
import ReceptionPage from './pages/ReceptionPage';
import SubmitNewsPage from './pages/SubmitNewsPage';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

const DEPT_PAGES = [
  {
    path: '/finance', emoji: '💰', name: 'ฝ่ายการเงินและพัสดุ',
    desc: 'จัดการการเงิน การเบิกจ่าย และพัสดุของสภานักเรียน',
    features: [
      { icon: '📝', label: 'ระบบเบิกจ่าย', desc: 'ยื่นคำขอเบิกเงินและอนุมัติ' },
      { icon: '📊', label: 'บัญชีสภา', desc: 'รายรับ-รายจ่ายและยอดคงเหลือ' },
      { icon: '🧾', label: 'ใบเสร็จรับเงิน', desc: 'บันทึกและจัดเก็บใบเสร็จ' },
    ],
  },
  {
    path: '/discipline', emoji: '🛡️', name: 'ฝ่ายปกครอง',
    desc: 'จัดตารางเวร บันทึกความผิด และหักเงินสมาชิก',
    features: [
      { icon: '📋', label: 'จัดตารางเวร', desc: 'สุ่มและจัดเวรยืนไหว้ เชิญธง' },
      { icon: '⚖️', label: 'บันทึกความผิด', desc: 'หักเงินสมาชิกที่ทำผิดกฎ' },
      { icon: '📈', label: 'รายงานสถิติ', desc: 'สถิติการขาด-มาสาย' },
    ],
  },
  {
    path: '/academic', emoji: '📚', name: 'ฝ่ายวิชาการ',
    desc: 'จัดการเอกสารโครงการและงานวิชาการ',
    features: [
      { icon: '📂', label: 'คลังเอกสาร', desc: 'อัปโหลดและจัดเก็บเอกสาร' },
      { icon: '📋', label: 'โครงการ', desc: 'ติดตามสถานะโครงการ' },
    ],
  },
  {
    path: '/office', emoji: '🏢', name: 'ฝ่ายสำนักงานคณะกรรมการนักเรียน',
    desc: 'ดูแลห้องสภาและงานสำนักงาน',
    features: [
      { icon: '🔑', label: 'บันทึกการใช้ห้องสภา', desc: 'บันทึกการใช้งานห้องสภานักเรียน' },
    ],
  },
  {
    path: '/pr', emoji: '📢', name: 'ฝ่ายประชาสัมพันธ์',
    desc: 'วางแผนคอนเทนต์และร่างแคปชั่นสำหรับโพสต์',
    features: [
      { icon: '📅', label: 'Content Planner', desc: 'วางแผนข่าวรายวัน' },
      { icon: '✍️', label: 'ร่างแคปชั่น', desc: 'เขียนและส่งต่อให้โสตฯ' },
      { icon: '📊', label: 'สถิติโพสต์', desc: 'ติดตาม engagement' },
    ],
  },
  {
    path: '/recreation', emoji: '🎮', name: 'ฝ่ายนันทนาการและเครือข่ายชุมชน',
    desc: 'วางแผนกิจกรรมสันทนาการและนันทนาการ',
    features: [
      { icon: '👥', label: 'วางแผนสันทนาการ', desc: 'กำหนดผู้รับผิดชอบและออกแบบเกม' },
    ],
  },
  {
    path: '/secretary', emoji: '📝', name: 'ฝ่ายเลขานุการ',
    desc: 'วางตารางงาน โครงการ และวาระการประชุม',
    features: [
      { icon: '📅', label: 'จัดการปฏิทิน', desc: 'เพิ่มและแก้ไขกำหนดการ' },
      { icon: '📋', label: 'วาระการประชุม', desc: 'ร่างและบันทึกรายงาน' },
      { icon: '📁', label: 'เอกสารสำคัญ', desc: 'จัดเก็บไฟล์การประชุม' },
    ],
  },
  {
    path: '/facilities', emoji: '🏗️', name: 'ฝ่ายอาคารสถานที่',
    desc: 'จัดเตรียมสถานที่และอุปกรณ์สำหรับกิจกรรม',
    features: [
      { icon: '📝', label: 'รับคำขอจัดสถานที่', desc: 'รับและจัดการคำขอจัดสถานที่จัดกิจกรรมของสภา' },
    ],
  },
  {
    path: '/av', emoji: '🎬', name: 'ฝ่ายโสตทัศนศึกษา',
    desc: 'กราฟิก วิดีโอ ถ่ายภาพ และโพสต์สื่อ',
    features: [
      { icon: '🎨', label: 'AV Task Manager', desc: 'รับบรีฟ จัดคิวงาน' },
      { icon: '📸', label: 'คลังสื่อ', desc: 'จัดเก็บและแชร์สื่อ' },
      { icon: '📲', label: 'ตั้งเวลาโพสต์', desc: 'เตรียมโพสต์ลง IG/Page' },
    ],
  },
  {
    path: '/reception', emoji: '🤝', name: 'ฝ่ายปฏิคม',
    desc: 'ต้อนรับ ดูแลวิทยากร และแขกรับเชิญ',
    features: [
      { icon: '👔', label: 'รายชื่อแขก', desc: 'จัดการข้อมูลการต้อนรับวิทยากรและแขกรับเชิญ' },
    ],
  },
];

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/schedules"  element={<PrivateRoute><SchedulesPage /></PrivateRoute>} />
      <Route path="/calendar"   element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
      <Route path="/checkin"    element={<PrivateRoute><CheckInPage /></PrivateRoute>} />
      <Route path="/clean-duty" element={<PrivateRoute><CleanDutyPage /></PrivateRoute>} />
      <Route path="/greeting-duty" element={<PrivateRoute><GreetingDutyPage /></PrivateRoute>} />
      <Route path="/my-attendance" element={<PrivateRoute><MyAttendancePage /></PrivateRoute>} />
      <Route path="/profile"    element={<PrivateRoute><MyStats /></PrivateRoute>} />
      <Route path="/settings"   element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/submit-news" element={<PrivateRoute><SubmitNewsPage /></PrivateRoute>} />
      <Route path="/admin"      element={<PrivateRoute><AdminPage /></PrivateRoute>} />
      <Route path="/discipline" element={<PrivateRoute><DisciplinePage /></PrivateRoute>} />
      <Route path="/my-fines"   element={<PrivateRoute><MyFinesPage /></PrivateRoute>} />
      <Route path="/finance"    element={<PrivateRoute><FinancePage /></PrivateRoute>} />
      <Route path="/pr"          element={<PrivateRoute><PRPage /></PrivateRoute>} />
      <Route path="/av"          element={<PrivateRoute><AVPage /></PrivateRoute>} />
      <Route path="/secretary"   element={<PrivateRoute><SecretaryPage /></PrivateRoute>} />
      <Route path="/academic"    element={<PrivateRoute><AcademicPage /></PrivateRoute>} />
      <Route path="/office"      element={<PrivateRoute><OfficePage /></PrivateRoute>} />
      <Route path="/recreation"  element={<PrivateRoute><RecreationPage /></PrivateRoute>} />
      <Route path="/facilities"  element={<PrivateRoute><FacilitiesPage /></PrivateRoute>} />
      <Route path="/reception"   element={<PrivateRoute><ReceptionPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    const oneSignalAppId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (oneSignalAppId && 'serviceWorker' in navigator) {
      const base = import.meta.env.BASE_URL || '/';
      const swPath = `${base}OneSignalSDKWorker.js`;
      
      // Register service worker manually first, then pass to OneSignal
      navigator.serviceWorker.register(swPath, { scope: base })
        .then((registration) => {
          console.log('Service Worker registered manually at:', swPath, 'scope:', base);
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          window.OneSignalDeferred.push(async function(OneSignal) {
            const initOptions = {
              appId: oneSignalAppId,
              allowLocalhostAsSecureOrigin: true,
              serviceWorker: {
                path: swPath,
                scope: base
              }
            };
            console.log('OneSignal init with options:', JSON.stringify(initOptions));
            await OneSignal.init(initOptions);
          });
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    }
  }, []);

  useEffect(() => {
    // 1. Get the current active JavaScript file hash
    let localHash = '';
    const scripts = Array.from(document.querySelectorAll('script'));
    const currentScript = scripts.find(s => s.src && s.src.includes('/assets/index-'));
    if (currentScript) {
      const match = currentScript.src.match(/\/assets\/index-([^.]+)\.js/);
      if (match) {
        localHash = match[1];
      }
    }

    // 2. Fetch index.html and compare JS hash to detect new deployments
    const checkForUpdate = async () => {
      if (!localHash) return;
      try {
        const res = await fetch('./index.html?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        const match = text.match(/src="[^"]*\/assets\/index-([^.]+)\.js"/);
        if (match && match[1]) {
          const serverHash = match[1];
          if (serverHash !== localHash) {
            console.log("New version detected. Reloading app automatically...");
            window.location.reload();
          }
        }
      } catch (err) {
        console.error("Auto-update check failed:", err);
      }
    };

    // Check on mount
    checkForUpdate();

    // Check when user resumes the app (tab focus / visibility)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
