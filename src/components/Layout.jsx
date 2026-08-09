import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Calendar, Bell, UserCircle,
  Shield, Banknote, BookOpen, Building, Megaphone,
  Music, FileText, Warehouse, Camera, HandHeart, LogOut, Settings, MapPin, Sparkles, ClipboardList, ChevronDown, User, X, Menu, RotateCw, Target
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import logoUrl from '../assets/logo.png';
import PWAPrompt from './PWAPrompt';

const NAV = [
  { section: 'ทั่วไป', items: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'หน้าหลัก' },
    { to: '/checkin',   icon: MapPin,          label: 'เช็คชื่อเข้า รร.' },
    { to: '/my-attendance', icon: ClipboardList, label: 'ประวัติเช็คชื่อ' },
    { to: '/greeting-duty', icon: HandHeart,    label: 'ส่งรายงานเวรยืนไหว้' },
    { to: '/clean-duty',icon: Sparkles,        label: 'ส่งเวรห้องสภา' },
    { to: '/submit-news', icon: Megaphone,     label: 'ส่งข่าวประชาสัมพันธ์' },
    { to: '/suggestions', icon: FileText,      label: 'ข้อเสนอแนะนักเรียน' },
    { to: '/schedules', icon: Calendar,        label: 'ตารางเวร' },
    { to: '/calendar',  icon: Calendar,        label: 'ปฏิทินกิจกรรม' },
    { to: '/my-fines',  icon: Banknote,        label: 'ชำระเงิน/ค่าปรับ' },
    { to: '/profile',   icon: UserCircle,      label: 'ประวัติส่วนตัว' },
    { to: '/settings',  icon: Settings,        label: 'ตั้งค่าทั่วไป' },
  ]},
  { section: 'ฝ่ายงาน', items: [
    { to: '/finance',    icon: Banknote,  label: 'การเงินและพัสดุ',  deptId: 1 },
    { to: '/discipline', icon: Shield,    label: 'ฝ่ายปกครอง',       deptId: 2 },
    { to: '/academic',   icon: BookOpen,  label: 'ฝ่ายวิชาการ',      deptId: 3 },
    { to: '/office',     icon: Building,  label: 'สนง.กรรมการ',      deptId: 4 },
    { to: '/pr',         icon: Megaphone, label: 'ประชาสัมพันธ์',    deptId: 5 },
    { to: '/recreation', icon: Music,     label: 'นันทนาการ',        deptId: 6 },
    { to: '/secretary',  icon: FileText,  label: 'เลขานุการ',        deptId: 7 },
    { to: '/facilities', icon: Warehouse, label: 'อาคารสถานที่',     deptId: 8 },
    { to: '/av',         icon: Camera,    label: 'โสตทัศนศึกษา',    deptId: 9 },
    { to: '/reception',  icon: HandHeart, label: 'ฝ่ายปฏิคม',       deptId: 10 },
  ]},
];

const PAGE_TITLES = {
  '/dashboard': 'หน้าหลัก', '/checkin': 'เช็คชื่อมาโรงเรียน', '/my-attendance': 'ประวัติเช็คชื่อ', '/greeting-duty': 'ส่งรายงานเวรยืนไหว้', '/clean-duty': 'ส่งเวรห้องสภา', '/submit-news': 'ส่งข่าวประชาสัมพันธ์', '/suggestions': 'ข้อเสนอแนะนักเรียน', '/schedules': 'ตารางเวร', '/calendar': 'ปฏิทินกิจกรรม',
  '/my-fines': 'ชำระเงินและค่าปรับ',
  '/profile': 'ประวัติส่วนตัว', '/settings': 'ตั้งค่าทั่วไป', '/admin': 'จัดการผู้ใช้งาน', '/admin-videos': 'จัดการวิดีโอกิจกรรม', '/admin-policies': 'จัดการนโยบายสภาฯ',
  '/finance': 'ฝ่ายการเงิน', '/discipline': 'ฝ่ายปกครอง', '/academic': 'ฝ่ายวิชาการ',
  '/office': 'สนง.กรรมการ', '/pr': 'ประชาสัมพันธ์', '/recreation': 'นันทนาการ',
  '/secretary': 'เลขานุการ', '/facilities': 'อาคารสถานที่', '/av': 'โสตทัศนศึกษา',
  '/reception': 'ปฏิคม',
};

const NOTIF_ICONS = { fine: '💸', task: '📋', event: '🎉', meeting: '📅', announcement: '📢' };

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isPresident, notifications, setNotifications } = useAuth();
  const navigate = useNavigate();
  const path = window.location.pathname;
  const unread = (notifications || []).filter(n => !n.read).length;
  const notifs = notifications || [];

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const isDeptRoute = ['/finance', '/discipline', '/academic', '/office', '/pr', '/recreation', '/secretary', '/facilities', '/av', '/reception'].includes(path);
  const [deptOpen, setDeptOpen] = useState(() => isDeptRoute || true);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    function triggerBrowserNotification(title, body, notifId) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: logoUrl || '/logo.png',
            badge: logoUrl || '/logo.png',
            tag: notifId ? String(notifId) : undefined
          });
        } catch (err) {
          console.error('Error triggering browser notification:', err);
        }
      }
    }

    async function fetchNotifications() {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          const myNotifs = data.filter(n => {
            if (!n.user_id || n.user_id === 'all') return true;
            return String(n.user_id) === String(user.id);
          });
          setNotifications(myNotifs);
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    }

    async function checkTodayDutyReminder() {
      if (!user?.nickname) return;
      try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
        const todayDayName = daysTh[today.getDay()];

        const { data: existingReminders } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', String(user.id))
          .like('message', `%วันนี้ (${todayStr})%`);

        if (existingReminders && existingReminders.length > 0) return;

        const myTodayDuties = [];

        const { data: swaps } = await supabase
          .from('duty_swaps')
          .select('*')
          .eq('date', todayStr);

        const { data: schedules } = await supabase
          .from('schedules')
          .select('*')
          .eq('day', todayDayName);

        if (schedules) {
          schedules.forEach(sched => {
            const data = sched.data || {};
            const dutyType = sched.type;
            const isSwappedOut = swaps?.some(s => s.duty_type === dutyType && s.original_nickname === user.nickname);
            
            if (!isSwappedOut) {
              if (dutyType === 'greeting') {
                const gate1 = data.gate1 || [];
                const gate2 = data.gate2 || [];
                const gate3 = data.gate3 || [];
                if (gate1.includes(user.nickname)) myTodayDuties.push('🙏 เวรยืนไหว้ (ประตูไหมไทย)');
                if (gate2.includes(user.nickname)) myTodayDuties.push('🙏 เวรยืนไหว้ (ประตูอำเภอ)');
                if (gate3.includes(user.nickname)) myTodayDuties.push('🙏 เวรยืนไหว้ (ประตูหน้า รร.)');
              } else if (dutyType === 'clean_room') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTodayDuties.push('🧹 เวรทำความสะอาดห้องสภา');
              } else if (dutyType === 'national_flag') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTodayDuties.push('🚩 เวรเชิญธงชาติ');
              } else if (dutyType === 'color_flag') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTodayDuties.push('🎌 เวรเชิญธงสี');
              }
            }
          });
        }

        swaps?.forEach(s => {
          if (s.substitute_nickname === user.nickname) {
            myTodayDuties.push(`🔄 ปฏิบัติเวรแทน ${s.original_nickname}`);
          }
        });

        if (myTodayDuties.length > 0) {
          const msg = `🔔 แจ้งเตือนเวรวันนี้ (${todayStr}): คุณมีหน้าที่ ${myTodayDuties.join(', ')} กรุณาปฏิบัติหน้าที่ตรงเวลาครับ`;
          await supabase
            .from('notifications')
            .insert([{
              type: 'task',
              user_id: String(user.id),
              message: msg
            }]);
          triggerBrowserNotification('SWSC.OFFICIAL - แจ้งเตือนเวรวันนี้ 🔔', msg);
        }
      } catch (err) {
        console.error('Error checking today duty reminder:', err);
      }
    }

    async function checkTomorrowDutyReminder() {
      if (!user?.nickname) return;
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowStr = `${yyyy}-${mm}-${dd}`;
        const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
        const tomorrowDayName = daysTh[tomorrow.getDay()];

        const { data: existingReminders } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', String(user.id))
          .like('message', `%${tomorrowStr}%`);

        if (existingReminders && existingReminders.length > 0) return;

        const myTomorrowDuties = [];

        const { data: swaps } = await supabase
          .from('duty_swaps')
          .select('*')
          .eq('date', tomorrowStr);

        const { data: schedules } = await supabase
          .from('schedules')
          .select('*')
          .eq('day', tomorrowDayName);

        if (schedules) {
          schedules.forEach(sched => {
            const data = sched.data || {};
            const dutyType = sched.type;
            
            const isSwappedOut = swaps?.some(s => s.duty_type === dutyType && s.original_nickname === user.nickname);
            
            if (!isSwappedOut) {
              if (dutyType === 'greeting') {
                const gate1 = data.gate1 || [];
                const gate2 = data.gate2 || [];
                const gate3 = data.gate3 || [];
                if (gate1.includes(user.nickname)) myTomorrowDuties.push('🙏 เวรยืนไหว้ (ประตูไหมไทย)');
                if (gate2.includes(user.nickname)) myTomorrowDuties.push('🙏 เวรยืนไหว้ (ประตูอำเภอ)');
                if (gate3.includes(user.nickname)) myTomorrowDuties.push('🙏 เวรยืนไหว้ (ประตูหน้า รร.)');
              } else if (dutyType === 'clean_room') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTomorrowDuties.push('🧹 เวรทำความสะอาดห้องสภา');
              } else if (dutyType === 'national_flag') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTomorrowDuties.push('🚩 เวรเชิญธงชาติ');
              } else if (dutyType === 'color_flag') {
                const members = data.members || [];
                if (members.includes(user.nickname)) myTomorrowDuties.push('🎌 เวรเชิญธงสี');
              }
            }
          });
        }

        swaps?.forEach(s => {
          if (s.substitute_nickname === user.nickname) {
            myTomorrowDuties.push(`🔄 ปฏิบัติเวรแทน ${s.original_nickname}`);
          }
        });

        if (myTomorrowDuties.length > 0) {
          const msg = `⏰ แจ้งเตือนเวรวันพรุ่งนี้ (${tomorrowStr}): คุณมีหน้าที่ ${myTomorrowDuties.join(', ')} กรุณาเตรียมตัวมาปฏิบัติหน้าที่ตรงเวลาครับ`;
          await supabase
            .from('notifications')
            .insert([{
              type: 'task',
              user_id: String(user.id),
              message: msg
            }]);
          triggerBrowserNotification('SWSC.OFFICIAL - แจ้งเตือนเวรวันพรุ่งนี้ ⏰', msg);
        }
      } catch (err) {
        console.error('Error checking tomorrow duty reminder:', err);
      }
    }

    fetchNotifications();
    checkTodayDutyReminder();
    checkTomorrowDutyReminder();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          fetchNotifications();
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new;
            if (newNotif && (!newNotif.user_id || newNotif.user_id === 'all' || String(newNotif.user_id) === String(user.id))) {
              triggerBrowserNotification('SWSC.OFFICIAL - การแจ้งเตือนใหม่ 🔔', newNotif.message || 'คุณมีรายการแจ้งเตือนใหม่ในระบบ', newNotif.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setNotifications]);

  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);
      if (error) throw error;
      setNotifications(prev => (prev || []).map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      {/* ── Mobile Sidebar Overlay ── */}
      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}
      
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${showSidebar ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo" style={{ padding: '0 16px', height: 64, gap: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'white',
              boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 5, flexShrink: 0
            }}>
              <img src={logoUrl} alt="SWSC Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div className="sidebar-logo-text">
              <div style={{ fontWeight: 800, fontSize: 14, color: 'white', letterSpacing: '-0.01em' }}>สภานักเรียน</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', fontWeight: 500, marginTop: -1 }}>Student Council</div>
            </div>
          </div>

          <button className="sidebar-close-btn" onClick={() => setShowSidebar(false)} aria-label="ปิดเมนู">
            <X size={20} color="white" />
          </button>
        </div>

        {/* User */}
        <div className="sidebar-user">
          <div className="sidebar-avatar" style={{ background: user?.avatarColor + '33', color: user?.avatarColor, overflow: 'hidden' }}>
            {user?.profileImage ? <img src={user.profileImage} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.avatar}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.nickname || user?.name?.split(' ')[0]}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.position}
            </div>
          </div>
          {unread > 0 && (
            <div style={{ background: '#ef5350', color: 'white', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0 }}>
              {unread}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(sec => {
            const isDeptSection = sec.section === 'ฝ่ายงาน';
            const isOpen = isDeptSection ? deptOpen : true;
            return (
              <div key={sec.section}>
                <div 
                  className="nav-section"
                  onClick={isDeptSection ? () => setDeptOpen(prev => !prev) : undefined}
                  style={isDeptSection ? { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' } : undefined}
                >
                  <span>{sec.section}</span>
                  {isDeptSection && (
                    <ChevronDown 
                      size={13} 
                      style={{ 
                        transform: deptOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
                        transition: 'transform 0.2s ease',
                        opacity: 0.7 
                      }} 
                    />
                  )}
                </div>
                {isOpen && sec.items.map(item => {
                  const isSecretaryOrAcademic = item.to === '/secretary' || item.to === '/academic';
                  if (item.deptId && !isAdmin && !isPresident && user?.deptId !== item.deptId && !isSecretaryOrAcademic) return null;
                  if (item.to === '/my-fines' && user?.role === 'admin') return null;
                  return (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setShowSidebar(false)}>
                      <item.icon size={15} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}

          {isAdmin && (
            <div>
              <div className="nav-section">ผู้ดูแลระบบ</div>
              <NavLink to="/admin" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setShowSidebar(false)}>
                <Shield size={15} />
                <span>จัดการผู้ใช้งาน</span>
              </NavLink>
              <NavLink to="/admin-announcements" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setShowSidebar(false)}>
                <Megaphone size={15} />
                <span>จัดการประกาศหน้าเว็บ</span>
              </NavLink>
              <NavLink to="/admin-videos" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setShowSidebar(false)}>
                <Camera size={15} />
                <span>จัดการวิดีโอกิจกรรม</span>
              </NavLink>
              <NavLink to="/admin-policies" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setShowSidebar(false)}>
                <Target size={15} />
                <span>จัดการนโยบายสภาฯ</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* Logout */}
        <div className="sidebar-footer">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '7px 12px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
          >
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-layout" style={{ flex: 1 }}>
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu-btn" onClick={() => setShowSidebar(prev => !prev)} aria-label="เปิดปิดเมนู">
              <Menu size={22} />
            </button>
            <div style={{ display:'flex', alignItems:'center' }}>
              สภานักเรียน
              <span className="topbar-breadcrumb">/ {PAGE_TITLES[path] || 'หน้าหลัก'}</span>
            </div>
          </div>
          <div className="topbar-user" style={{ display:'flex', alignItems:'center', gap:12 }}>

            {/* Reload button for PWAs/Standalone mode */}
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'inherit', 
                padding: 4,
                opacity: 0.7 
              }}
              title="รีเฟรชหน้าเว็บ"
            >
              <RotateCw size={15} />
            </button>

            {/* Bell / Notifications */}
            <div ref={notifRef} style={{ position:'relative' }}>
              <button onClick={() => { setShowNotifs(!showNotifs); setShowUserMenu(false); }} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'inherit', padding:4 }}>
                <Bell size={16} style={{ opacity:0.85 }} />
                {unread > 0 && <span style={{ background:'#ef5350', color:'white', borderRadius:99, fontSize:10, fontWeight:700, padding:'1px 6px' }}>{unread}</span>}
              </button>

              {showNotifs && (
                <>
                  <div className="notif-overlay" onClick={() => setShowNotifs(false)} />
                  <div className="notif-dropdown">
                    <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(0,0,0,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontWeight:700, fontSize:15 }}>🔔 การแจ้งเตือน</span>
                      {unread > 0 && <button onClick={markAllRead} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:13, fontWeight:600, cursor:'pointer' }}>อ่านทั้งหมด</button>}
                    </div>
                    {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                      <div style={{ padding: '8px 16px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>เปิดรับแจ้งเตือนแบบป๊อบอัพบนอุปกรณ์</span>
                        <button 
                          onClick={() => {
                            Notification.requestPermission().then(() => {
                              window.location.reload();
                            });
                          }}
                          style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          เปิดใช้งาน
                        </button>
                      </div>
                    )}
                    <div className="notif-body">
                      {notifs.length === 0 ? (
                        <div style={{ padding:32, textAlign:'center', color:'#9e9e9e', fontSize:14 }}>ไม่มีการแจ้งเตือน</div>
                      ) : notifs.map(n => (
                        <div key={n.id} 
                          onClick={async () => {
                            setSelectedNotification(n);
                            setShowNotifs(false);
                            if (!n.read) {
                              try {
                                const { error } = await supabase
                                  .from('notifications')
                                  .update({ read: true })
                                  .eq('id', n.id);
                                if (!error) {
                                  setNotifications(prev => (prev || []).map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
                                }
                              } catch (e) {
                                console.error(e);
                              }
                            }
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = n.read ? '#f9f9fb' : 'rgba(0,188,212,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : 'var(--primary-light)'}
                          style={{ 
                            padding:'12px 16px', 
                            borderBottom:'1px solid rgba(0,0,0,0.02)', 
                            background: n.read ? '#fff' : 'var(--primary-light)', 
                            display:'flex', 
                            gap:10, 
                            alignItems:'flex-start',
                            cursor: 'pointer',
                            transition: 'background 0.15s'
                          }}
                        >
                          <span style={{ fontSize:18, flexShrink:0 }}>{NOTIF_ICONS[n.type] || '📌'}</span>
                          <div style={{ flex:1, minWidth:0, textAlign: 'left' }}>
                            <div style={{ fontSize:13, color: n.read ? '#757575' : '#212121', fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
                            <div style={{ fontSize:11, color:'#9e9e9e', marginTop:4 }}>{n.created_at ? formatRelativeTime(n.created_at) : n.time}</div>
                          </div>
                          {!n.read && <div style={{ width:8, height:8, borderRadius:99, background:'var(--primary)', flexShrink:0, marginTop:6 }} />}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User name + dropdown */}
            <div ref={userMenuRef} style={{ position:'relative' }}>
              <button onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifs(false); }} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:6, color:'inherit', padding:'4px 8px', borderRadius:6 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: (user?.avatarColor || '#00bcd4') + '22', color: user?.avatarColor || '#00bcd4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, overflow: 'hidden' }}>
                  {user?.profileImage ? <img src={user.profileImage} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.avatar}
                </div>
                <span style={{ fontSize:13, fontWeight:500, opacity:0.9 }}>{user?.name}</span>
                <ChevronDown size={14} style={{ opacity:0.5 }} />
              </button>

              {showUserMenu && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:220, background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.15)', zIndex:999, overflow:'hidden', border:'1px solid #e0e0e0' }}>
                  <div style={{ padding:'16px', borderBottom:'1px solid #f0f0f0', textAlign:'center' }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', background: (user?.avatarColor || '#00bcd4') + '22', color: user?.avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, margin:'0 auto 8px', overflow: 'hidden' }}>
                      {user?.profileImage ? <img src={user.profileImage} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : user?.avatar}
                    </div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{user?.name}</div>
                    <div style={{ fontSize:12, color:'#9e9e9e' }}>{user?.position}</div>
                  </div>
                  <div style={{ padding:'4px 0' }}>
                    <button onClick={() => { navigate('/profile'); setShowUserMenu(false); }} style={{ width:'100%', background:'none', border:'none', padding:'10px 16px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:10, color:'#424242', textAlign:'left', fontFamily:'inherit' }} onMouseEnter={e => e.target.style.background='#f5f5f5'} onMouseLeave={e => e.target.style.background='none'}>
                      <User size={15} /> ประวัติส่วนตัว
                    </button>
                    <button onClick={() => { navigate('/settings'); setShowUserMenu(false); }} style={{ width:'100%', background:'none', border:'none', padding:'10px 16px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:10, color:'#424242', textAlign:'left', fontFamily:'inherit' }} onMouseEnter={e => e.target.style.background='#f5f5f5'} onMouseLeave={e => e.target.style.background='none'}>
                      <Settings size={15} /> ตั้งค่าทั่วไป
                    </button>
                  </div>
                  <div style={{ borderTop:'1px solid #f0f0f0', padding:'4px 0' }}>
                    <button onClick={() => { logout(); navigate('/login'); }} style={{ width:'100%', background:'none', border:'none', padding:'10px 16px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:10, color:'#c62828', textAlign:'left', fontFamily:'inherit', fontWeight:600 }} onMouseEnter={e => e.target.style.background='#ffebee'} onMouseLeave={e => e.target.style.background='none'}>
                      <LogOut size={15} /> ออกจากระบบ
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>

      {/* Selected Notification View Modal */}
      {selectedNotification && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 450, width: '100%', margin: 0, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e5e5ea', background: '#f5f5f7' }}>
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 15 }}>
                {selectedNotification.type === 'announcement' ? '📢 ประกาศด่วน' :
                 selectedNotification.type === 'fine' ? '💸 ใบสั่งค่าปรับ' :
                 selectedNotification.type === 'task' ? '📋 การมอบหมายงาน' :
                 selectedNotification.type === 'event' ? '📅 กิจกรรม' : '🔔 การแจ้งเตือน'}
              </span>
              <button 
                className="btn btn-gray" 
                style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center' }} 
                onClick={() => setSelectedNotification(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '24px 20px' }}>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', color: '#212121', textAlign: 'left' }}>
                {selectedNotification.message}
              </p>
              
              {selectedNotification.created_at && (
                <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 20, textAlign: 'right' }}>
                  ส่งเมื่อ: {new Date(selectedNotification.created_at).toLocaleString('th-TH')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', background: '#f5f5f7', borderTop: '1px solid #e5e5ea' }}>
              <button 
                className="btn btn-primary" 
                style={{ background: 'var(--primary, #00bcd4)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setSelectedNotification(null)}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PWA Prompt Banner */}
      <PWAPrompt />
    </div>
  );
}
