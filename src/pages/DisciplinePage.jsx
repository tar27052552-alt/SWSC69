import { useState, useEffect } from 'react';
import { DEPARTMENTS } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, X, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const VIOLATION_TYPES = [
  'วางรองเท้าไม่เรียบร้อย (ข้าง)',
  'เล่นโทรศัพท์ระหว่างแถว',
  'แต่งตัวไม่เรียบร้อย (จุด)',
  'ทรงผมไม่เรียบร้อย',
  'กระทำความผิดตามระเบียบคู่มือนักเรียน',
  'ไม่ทำเวรห้องสภา',
  'ไม่ปฏิบัติเวรไหว้',
  'ไม่ส่งรูปเช็คชื่อ',
  'มาสาย (นาที)',
  'อื่นๆ (ระบุในหมายเหตุ)',
];

const FINE_AMOUNTS = { 
  'วางรองเท้าไม่เรียบร้อย (ข้าง)': 10,
  'เล่นโทรศัพท์ระหว่างแถว': 10,
  'แต่งตัวไม่เรียบร้อย (จุด)': 10,
  'ทรงผมไม่เรียบร้อย': 30,
  'กระทำความผิดตามระเบียบคู่มือนักเรียน': 50,
  'ไม่ทำเวรห้องสภา': 30,
  'ไม่ปฏิบัติเวรไหว้': 100,
  'ไม่ส่งรูปเช็คชื่อ': 20,
  'มาสาย (นาที)': 5,
  'อื่นๆ (ระบุในหมายเหตุ)': 0,
};

const MOCK_FINES = [];

export default function DisciplinePage() {
  const { user, isDeptHead, isAdmin, checkInState, cleanDutyState } = useAuth();
  const canManage = isAdmin || user?.deptId === 2;
  const [activeTab, setActiveTab] = useState('list');
  const [fines, setFines] = useState(MOCK_FINES);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ userId:'', violation: VIOLATION_TYPES[0], multiplier: 1, amount:20, date:'', note:'' });
  const [paymentModal, setPaymentModal] = useState(null); // fine object being paid
  const [slipPreview, setSlipPreview] = useState(null);
  const [submittingSlip, setSubmittingSlip] = useState(false);
  const PROMPTPAY_ID = '1639800408765'; // <-- เปลี่ยนเป็นเบอร์ PromptPay ของสภา
  const PROMPTPAY_NAME = 'น.ส. ทิตติกรณ์ แสงหงษ์';

  useEffect(() => {
    async function loadUsers() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, nickname, student_id, phone, dept_id, role, position, avatar_color')
          .order('name', { ascending: true });
        if (error) throw error;
        if (data) {
          const mapped = data.map(r => ({
            id: r.id,
            name: r.name,
            nickname: r.nickname,
            studentId: r.student_id,
            phone: r.phone || '',
            deptId: r.dept_id,
            role: r.role,
            position: r.position,
            avatar: r.avatar || (r.name?.charAt(0) || 'U'),
            avatarColor: r.avatar_color
          }));
          setUsers(mapped);
        }
      } catch (err) {
        console.error('Error loading users:', err);
      }
    }
    loadUsers();
  }, []);

  const loadFines = async () => {
    try {
      const { data, error } = await supabase
        .from('discipline_fines')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped = data.map(d => ({
          id: d.id,
          userId: d.user_id,
          userName: d.user_name,
          nickname: d.nickname,
          violation: d.violation,
          amount: d.amount,
          date: d.date,
          note: d.note,
          by: d.by,
          paid: d.paid,
          paymentStatus: d.payment_status || (d.paid ? 'paid' : 'unpaid'),
          paymentSlip: d.payment_slip || null,
        }));
        setFines(mapped);
      }
    } catch (err) {
      console.error('Error loading discipline fines:', err);
    }
  };

  useEffect(() => {
    loadFines();

    const interval = setInterval(() => {
      loadFines();
    }, 10000);

    const channel = supabase
      .channel('discipline-fines-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discipline_fines' }, () => {
        loadFines();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const toGregorianStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = toGregorianStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [manualChecks, setManualChecks] = useState({});
  const [cleanChecks, setCleanChecks] = useState({});
  const [dbAttendance, setDbAttendance] = useState([]);
  const [dbCleanChecks, setDbCleanChecks] = useState([]);
  const [dbGreetingChecks, setDbGreetingChecks] = useState([]);
  const [enabledDays, setEnabledDays] = useState(["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]);
  const [disabledDates, setDisabledDates] = useState([]);
  const [newDisabledDate, setNewDisabledDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [cleanDutyStartDate, setCleanDutyStartDate] = useState('');
  const [greetingDutyStartDate, setGreetingDutyStartDate] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [cleanSchedules, setCleanSchedules] = useState([]);
  const [greetingSchedules, setGreetingSchedules] = useState([]);
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  const [dbDutySwaps, setDbDutySwaps] = useState([]);
  const [dbExemptNicknames, setDbExemptNicknames] = useState([]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('attendance_settings').select('*');
        if (error) throw error;
        if (data) {
          const days = data.find(d => d.key === 'enabled_days')?.value;
          const dates = data.find(d => d.key === 'disabled_dates')?.value;
          const startD = data.find(d => d.key === 'start_date')?.value;
          const cleanStartD = data.find(d => d.key === 'clean_duty_start_date')?.value;
          const greetingStartD = data.find(d => d.key === 'greeting_duty_start_date')?.value;
          if (days) setEnabledDays(days);
          if (dates) setDisabledDates(dates);
          if (startD) setStartDate(startD);
          if (cleanStartD) setCleanDutyStartDate(cleanStartD);
          if (greetingStartD) setGreetingDutyStartDate(greetingStartD);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    }
    async function loadCleanSchedules() {
      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'clean_room');
        if (!error && data) {
          setCleanSchedules(data);
        }
      } catch (err) {
        console.error('Error loading clean schedules:', err);
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
    loadCleanSchedules();
    loadGreetingSchedules();
  }, []);

  const saveStartDate = async (newVal) => {
    setStartDate(newVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'start_date', value: newVal }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving start date:', err);
    }
  };

  const saveCleanDutyStartDate = async (newVal) => {
    setCleanDutyStartDate(newVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'clean_duty_start_date', value: newVal }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving clean duty start date:', err);
    }
  };

  const saveGreetingDutyStartDate = async (newVal) => {
    setGreetingDutyStartDate(newVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'greeting_duty_start_date', value: newVal }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving greeting duty start date:', err);
    }
  };

  const saveEnabledDays = async (newDays) => {
    setEnabledDays(newDays);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'enabled_days', value: newDays }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving enabled days:', err);
    }
  };

  const handleToggleDay = (day) => {
    const newDays = enabledDays.includes(day)
      ? enabledDays.filter(d => d !== day)
      : [...enabledDays, day];
    saveEnabledDays(newDays);
  };

  const handleAddDisabledDate = async () => {
    if (!newDisabledDate || disabledDates.includes(newDisabledDate)) return;
    const newDates = [...disabledDates, newDisabledDate].sort();
    setDisabledDates(newDates);
    setNewDisabledDate('');
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'disabled_dates', value: newDates }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving disabled dates:', err);
    }
  };

  const handleRemoveDisabledDate = async (dateStr) => {
    const newDates = disabledDates.filter(d => d !== dateStr);
    setDisabledDates(newDates);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'disabled_dates', value: newDates }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving disabled dates:', err);
    }
  };



  const loadAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('date', selectedDate);
      if (error) throw error;
      if (data) {
        setDbAttendance(data);
      }
    } catch (err) {
      console.error('Error loading student attendance:', err);
    }
  };

  const loadCleanChecks = async () => {
    try {
      const { data, error } = await supabase
        .from('clean_duty_checks')
        .select('*')
        .eq('date', selectedDate);
      if (error) throw error;
      if (data) {
        setDbCleanChecks(data);
      }
    } catch (err) {
      console.error('Error loading clean duty checks:', err);
    }
  };

  const loadGreetingChecks = async () => {
    try {
      const { data, error } = await supabase
        .from('greeting_duty_checks')
        .select('*')
        .eq('date', selectedDate);
      if (error) throw error;
      if (data) {
        setDbGreetingChecks(data);
      }
    } catch (err) {
      console.error('Error loading greeting duty checks:', err);
    }
  };

  const loadExemptionsAndSwaps = async () => {
    try {
      const { data: eventsData, error: eventsErr } = await supabase
        .from('events')
        .select('*');
      if (eventsErr) throw eventsErr;

      const activeExtEventIds = (eventsData || [])
        .filter(ev => {
          const start = ev.date;
          const end = ev.end_date || ev.date;
          return ev.location_category === 'external' && selectedDate >= start && selectedDate <= end;
        })
        .map(ev => ev.id);

      if (activeExtEventIds.length > 0) {
        const { data: partData, error: partErr } = await supabase
          .from('event_participants')
          .select('user_id')
          .in('event_id', activeExtEventIds);
        if (partErr) throw partErr;

        const exemptUserIds = (partData || []).map(p => String(p.user_id));
        const exemptNicks = users
          .filter(u => exemptUserIds.includes(String(u.id)))
          .map(u => u.nickname);
        setDbExemptNicknames(exemptNicks);
      } else {
        setDbExemptNicknames([]);
      }

      const { data: swapData, error: swapErr } = await supabase
        .from('duty_swaps')
        .select('*')
        .eq('date', selectedDate);
      if (swapErr) throw swapErr;
      setDbDutySwaps(swapData || []);

    } catch (err) {
      console.error('Error loading exemptions and swaps:', err);
    }
  };

  useEffect(() => {
    loadAttendance();
    loadCleanChecks();
    loadGreetingChecks();

    const interval = setInterval(() => {
      loadAttendance();
      loadCleanChecks();
      loadGreetingChecks();
    }, 10000);

    const channel = supabase
      .channel('discipline-attendance-duty-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_attendance' }, (payload) => {
        const targetDate = payload.new ? payload.new.date : (payload.old ? payload.old.date : null);
        if (targetDate === selectedDate) {
          loadAttendance();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clean_duty_checks' }, (payload) => {
        const targetDate = payload.new ? payload.new.date : (payload.old ? payload.old.date : null);
        if (targetDate === selectedDate) {
          loadCleanChecks();
        }
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, checkInState, users]);

  const STATUS_COLORS = {
    on_time: { bg: '#e8f5e9', col: '#2e7d32', label: 'มา' },
    late:    { bg: '#ffebee', col: '#c62828', label: 'สาย' },
    leave:   { bg: '#fff8e1', col: '#f57f17', label: 'ลา' },
    missing: { bg: '#f5f5f5', col: '#757575', label: 'ขาด' },
    activity: { bg: '#e0f7fa', col: '#00838f', label: 'ทำกิจกรรม' },
    not_required: { bg: '#f9f9f9', col: '#9e9e9e', label: 'ไม่บังคับ' },
  };

  const handleManualCheckIn = async (userId, status) => {
    if (status === 'reset') {
      if (!window.confirm('คุณต้องการลบประวัติการเช็คชื่อของนักเรียนคนนี้ เพื่อให้สามารถใช้กล้องเช็คชื่อใหม่ได้ใช่หรือไม่?')) return;
      try {
        const { error } = await supabase
          .from('student_attendance')
          .delete()
          .eq('user_id', String(userId))
          .eq('date', selectedDate);
        if (error) throw error;
        
        setDbAttendance(prev => prev.filter(x => String(x.user_id) !== String(userId)));
      } catch (err) {
        console.error('Error resetting check-in:', err);
        alert('เกิดข้อผิดพลาดในการรีเซ็ตสถานะ: ' + err.message);
      }
      return;
    }

    let time = '-';
    if (status === 'on_time' || status === 'late') {
      time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } else if (status === 'leave') {
      time = '-';
    }

    const u = users.find(user => String(user.id) === String(userId));
    if (!u) return;

    const record = {
      user_id: String(userId),
      user_name: u.name,
      nickname: u.nickname,
      date: selectedDate,
      time: time,
      status: status,
      is_manual: true
    };

    try {
      const { error } = await supabase
        .from('student_attendance')
        .upsert([record], { onConflict: 'user_id,date' });
      if (error) throw error;
      
      setDbAttendance(prev => {
        const filtered = prev.filter(x => String(x.user_id) !== String(userId));
        return [...filtered, {
          id: Date.now(),
          user_id: String(userId),
          user_name: u.name,
          nickname: u.nickname,
          date: selectedDate,
          time: time,
          status: status,
          is_manual: true
        }];
      });
    } catch (err) {
      console.error('Error updating manual check-in:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกเวลาเข้าแถว: ' + err.message);
    }
  };

  const handleCleanCheck = async (nickname, status) => {
    const record = {
      nickname: nickname,
      date: selectedDate,
      status: status
    };

    try {
      const { error } = await supabase
        .from('clean_duty_checks')
        .upsert([record], { onConflict: 'nickname,date' });
      if (error) throw error;
      setDbCleanChecks(prev => {
        const filtered = prev.filter(x => x.nickname !== nickname);
        return [...filtered, { id: Date.now(), ...record }];
      });
    } catch (err) {
      console.error('Error updating clean duty check:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกเวรห้องสภา: ' + err.message);
    }
  };

  const handleGreetingCheck = async (nickname, gate, status) => {
    if (status === 'reset') {
      if (!window.confirm('คุณต้องการลบประวัติการรายงานเวรยืนไหว้ของคนนี้หรือไม่?')) return;
      try {
        const { error } = await supabase
          .from('greeting_duty_checks')
          .delete()
          .eq('nickname', nickname)
          .eq('date', selectedDate);
        if (error) throw error;
        setDbGreetingChecks(prev => prev.filter(x => x.nickname !== nickname));

        // Delete auto-fine if marked reset
        const { data: userFound } = await supabase.from('users').select('id').eq('nickname', nickname).maybeSingle();
        if (userFound) {
          await supabase.from('discipline_fines')
            .delete()
            .eq('user_id', String(userFound.id))
            .eq('date', selectedDate)
            .eq('violation', 'ไม่ปฏิบัติเวรไหว้');
        }
      } catch (err) {
        console.error('Error resetting greeting check:', err);
        alert('เกิดข้อผิดพลาดในการรีเซ็ตสถานะ: ' + err.message);
      }
      return;
    }

    const record = {
      nickname: nickname,
      date: selectedDate,
      gate: gate,
      status: status
    };

    try {
      const { error } = await supabase
        .from('greeting_duty_checks')
        .upsert([record], { onConflict: 'nickname,date' });
      if (error) throw error;
      setDbGreetingChecks(prev => {
        const filtered = prev.filter(x => x.nickname !== nickname);
        return [...filtered, { id: Date.now(), ...record }];
      });

      // VERY IMPORTANT: If marked as 'done', delete auto-fine for "ไม่ปฏิบัติเวรไหว้"
      if (status === 'done') {
        const { data: userFound } = await supabase.from('users').select('id').eq('nickname', nickname).maybeSingle();
        if (userFound) {
          await supabase.from('discipline_fines')
            .delete()
            .eq('user_id', String(userFound.id))
            .eq('date', selectedDate)
            .eq('violation', 'ไม่ปฏิบัติเวรไหว้');
        }
      }
    } catch (err) {
      console.error('Error updating greeting duty check:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกเวรยืนไหว้: ' + err.message);
    }
  };

  // Generate real attendance based on database records
  const attendanceData = users.filter(u => u.role !== 'admin' && u.nickname !== 'แอดมิน').map(u => {
    // 1. Check in database record
    const realRec = dbAttendance.find(d => String(d.user_id) === String(u.id) || d.nickname === u.nickname);
    if (realRec) {
      return {
        ...u,
        checkInStatus: realRec.status,
        time: realRec.time,
        photo: realRec.photo,
        isManual: realRec.is_manual
      };
    }

    // 2. Real-time check-in (current day only) — ใช้ String() ป้องกัน type mismatch
    if (selectedDate === todayStr && String(user?.id) === String(u.id) && checkInState) {
      return {
        ...u,
        checkInStatus: checkInState.status,
        time: checkInState.time,
        photo: checkInState.photo,
        isManual: false
      };
    }

    // 3. Check activity exemption
    if (dbExemptNicknames.includes(u.nickname)) {
      return {
        ...u,
        checkInStatus: 'activity',
        time: 'ทำกิจกรรม',
        photo: null,
        isManual: false
      };
    }

    // 4. Fallback to blank / clean status (listed as absent until checked)
    const isBeforeStart = startDate && selectedDate < startDate;
    return {
      ...u,
      checkInStatus: isBeforeStart ? 'not_required' : 'missing',
      time: '-',
      photo: null,
      isManual: false
    };
  });

  const initForm = () => setForm({ userId:'', violation: VIOLATION_TYPES[0], multiplier: 1, amount:20, date: todayStr, note:'' });

  const calculateAmount = (userId, violation, multiplier) => {
    let base = FINE_AMOUNTS[violation] || 0;
    let total = base * (multiplier || 1);
    
    // สารวัตรนักเรียน (ฝ่ายปกครอง deptId: 2) จะโดนปรับคูณ 2
    if (userId) {
      const u = users.find(user => String(user.id) === String(userId));
      if (u && u.deptId === 2) {
        total *= 2;
      }
    }
    return total;
  };

  const handleViolationChange = (v) => {
    setForm(p => ({ ...p, violation: v, amount: calculateAmount(p.userId, v, p.multiplier) }));
  };

  const handleMultiplierChange = (m) => {
    const val = parseInt(m) || 1;
    setForm(p => ({ ...p, multiplier: val, amount: calculateAmount(p.userId, p.violation, val) }));
  };

  const handleUserChange = (uId) => {
    setForm(p => ({ ...p, userId: uId, amount: calculateAmount(uId, p.violation, p.multiplier) }));
  };

  const handleSave = async () => {
    if (!form.userId) {
      alert('กรุณาเลือกสมาชิกที่ทำผิดระเบียบด้วยครับ');
      return;
    }
    const member = users.find(u => String(u.id) === String(form.userId));
    if (!member) {
      alert('ไม่พบข้อมูลสมาชิกในระบบครับ');
      return;
    }
    if (!form.date) {
      alert('กรุณาเลือกวันที่เกิดเหตุด้วยครับ');
      return;
    }
    const newFine = {
      user_id: String(member.id),
      user_name: member.name,
      nickname: member.nickname,
      violation: form.violation,
      amount: parseInt(form.amount),
      date: form.date,
      note: form.note,
      by: user?.nickname || 'ไม่ระบุ',
      paid: false
    };
    try {
      const { data, error } = await supabase
        .from('discipline_fines')
        .insert([newFine])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        const inserted = {
          id: data[0].id,
          userId: data[0].user_id,
          userName: data[0].user_name,
          nickname: data[0].nickname,
          violation: data[0].violation,
          amount: data[0].amount,
          date: data[0].date,
          note: data[0].note,
          by: data[0].by,
          paid: data[0].paid
        };
        setFines(prev => [inserted, ...prev]);

        // Send Discord embed notification
        const embedTitle = `💸 บันทึกค่าปรับใหม่ - ฝ่ายปกครอง`;
        const embedDesc = `มีการออกใบสั่งปรับสมาชิกสภานักเรียนเนื่องจากกระทำความผิดระเบียบ`;
        const fields = [
          { name: '👤 ผู้รับโทษ', value: `${inserted.userName} (${inserted.nickname})`, inline: true },
          { name: '⚖️ ข้อหาความผิด', value: inserted.violation, inline: true },
          { name: '💰 ยอดเงินค่าปรับ', value: `${inserted.amount} บาท`, inline: true },
          { name: '📝 หมายเหตุ', value: inserted.note || 'ไม่มี', inline: false },
          { name: '✍️ บันทึกโดย', value: inserted.by, inline: true }
        ];
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, fields, null, 'discipline_fines'); // สีแดงสำหรับค่าปรับ
      }
    } catch (err) {
      console.error('Error saving fine:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกความผิด: ' + err.message);
    }
    setModal(false); initForm();
  };

  const togglePaid = async (id) => {
    const fine = fines.find(f => f.id === id);
    if (!fine) return;
    const newPaid = !fine.paid;
    const newStatus = newPaid ? 'paid' : 'unpaid';
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ paid: newPaid, payment_status: newStatus })
        .eq('id', id);
      if (error) throw error;
      setFines(prev => prev.map(f => f.id === id ? { ...f, paid: newPaid, paymentStatus: newStatus } : f));
    } catch (err) {
      console.error('Error toggling paid state:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะชำระเงิน: ' + err.message);
    }
  };

  const handleUploadSlip = async () => {
    if (submittingSlip) return;
    if (!slipPreview || !paymentModal) return;
    setSubmittingSlip(true);
    try {
      let finalSlipUrl = slipPreview;
      if (slipPreview && slipPreview.startsWith('data:')) {
        try {
          const fileName = `slip_${paymentModal.id}_${Date.now()}.jpg`;
          const uploadResult = await uploadFileToDrive(slipPreview, fileName, 'slips');
          if (uploadResult && uploadResult.url) {
            finalSlipUrl = uploadResult.url;
          }
        } catch (uploadErr) {
          console.error("Failed to upload slip to Google Drive. Storing locally as Base64 fallback:", uploadErr);
        }
      }

      const { error } = await supabase
        .from('discipline_fines')
        .update({ payment_status: 'slip_uploaded', payment_slip: finalSlipUrl })
        .eq('id', paymentModal.id);
      if (error) throw error;
      setFines(prev => prev.map(f => f.id === paymentModal.id ? { ...f, paymentStatus: 'slip_uploaded', paymentSlip: finalSlipUrl } : f));
      setPaymentModal(null);
      setSlipPreview(null);
      alert('อัปโหลดสลิปเรียบร้อยแล้ว! รอฝ่ายการเงินตรวจสอบครับ');
    } catch (err) {
      console.error('Error uploading slip:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดสลิป: ' + err.message);
    } finally {
      setSubmittingSlip(false);
    }
  };

  const deleteFine = async (id) => {
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setFines(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Error deleting fine:', err);
      alert('เกิดข้อผิดพลาดในการลบรายการความผิด: ' + err.message);
    }
  };

  const filtered = fines.filter(f =>
    f.userName.includes(search) || f.nickname.includes(search) || f.violation.includes(search)
  );

  // Summary per user
  const summary = users.map(u => {
    const myFines = fines.filter(f => String(f.userId) === String(u.id));
    return {
      ...u, count: myFines.length,
      total: myFines.reduce((s, f) => s + f.amount, 0),
      unpaid: myFines.filter(f => !f.paid).reduce((s, f) => s + f.amount, 0),
    };
  }).filter(u => u.count > 0).sort((a,b) => b.total - a.total);

  const totalFines = fines.reduce((s,f) => s + f.amount, 0);
  const totalUnpaid = fines.filter(f => !f.paid).reduce((s,f) => s + f.amount, 0);

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">🛡️ ฝ่ายปกครอง</div>
          <div className="page-subtitle">ระบบบันทึกความผิดและการหักเงินสมาชิกสภานักเรียน</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => { initForm(); setModal(true); }}>
            <Plus size={14}/> บันทึกความผิด
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        {[
          { label:'บันทึกความผิดทั้งหมด', value: fines.length,    unit:'ครั้ง', bg:'#fce4ec', color:'#c62828', icon:'📋' },
          { label:'ยอดหักเงินทั้งหมด',    value: totalFines,       unit:'บาท',  bg:'#fff8e1', color:'#e65100', icon:'💰' },
          { label:'ยังไม่ชำระ',           value: totalUnpaid,      unit:'บาท',  bg:'#ffebee', color:'#b71c1c', icon:'⚠️' },
          { label:'ชำระแล้ว',             value: totalFines-totalUnpaid, unit:'บาท', bg:'#e8f5e9', color:'#2e7d32', icon:'✅' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label} ({s.unit})</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 24, display:'flex', gap:8, borderBottom:'1px solid #eee', paddingBottom:8, overflowX: 'auto' }}>
          <button className={`tab ${activeTab==='list'?'active':''}`} onClick={()=>setActiveTab('list')} style={{ padding:'8px 16px', background:activeTab==='list'?'#00bcd4':'#f5f5f5', color:activeTab==='list'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap' }}>📋 บันทึกทั้งหมด</button>
          <button className={`tab ${activeTab==='summary'?'active':''}`} onClick={()=>setActiveTab('summary')} style={{ padding:'8px 16px', background:activeTab==='summary'?'#00bcd4':'#f5f5f5', color:activeTab==='summary'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap' }}>📊 สรุปรายบุคคล</button>
          <button className={`tab ${activeTab==='checkin'?'active':''}`} onClick={()=>setActiveTab('checkin')} style={{ padding:'8px 16px', background:activeTab==='checkin'?'#00bcd4':'#f5f5f5', color:activeTab==='checkin'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap' }}>📍 ตรวจสอบการมา รร.</button>
          <button className={`tab ${activeTab==='greeting'?'active':''}`} onClick={()=>setActiveTab('greeting')} style={{ padding:'8px 16px', background:activeTab==='greeting'?'#00bcd4':'#f5f5f5', color:activeTab==='greeting'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap' }}>🙏 ตรวจสอบเวรยืนไหว้</button>
          <button className={`tab ${activeTab==='clean'?'active':''}`} onClick={()=>setActiveTab('clean')} style={{ padding:'8px 16px', background:activeTab==='clean'?'#00bcd4':'#f5f5f5', color:activeTab==='clean'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap' }}>🧹 ตรวจสอบเวรห้องสภา</button>
        </div>

      {/* Settings Panel */}
      {canManage && (activeTab === 'checkin' || activeTab === 'clean' || activeTab === 'greeting') && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowSettings(!showSettings)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚙️</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#37474f' }}>ตั้งค่าการเช็คชื่อเข้าแถว & เวรห้องสภา</span>
            </div>
            <button className="btn btn-gray" style={{ padding: '4px 12px', fontSize: 12 }}>
              {showSettings ? 'ซ่อนการตั้งค่า' : 'แสดงการตั้งค่า'}
            </button>
          </div>

          {showSettings && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
              {/* Start Date Settings */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#455a64', marginBottom: 12 }}>ตั้งค่าวันเริ่มบังคับใช้ระบบ (แยกรายหมวดหมู่):</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  {/* General Check-in */}
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>📍 เริ่มบังคับเช็คชื่อเข้าโรงเรียน:</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="date"
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: 12, flex: 1 }}
                        value={startDate}
                        onChange={e => saveStartDate(e.target.value)}
                      />
                      {startDate && (
                        <button
                          className="btn btn-gray"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => saveStartDate('')}
                        >
                          รีเซ็ต
                        </button>
                      )}
                    </div>
                    {!startDate && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>* เริ่มบังคับทุกวันทำงาน</div>}
                  </div>

                  {/* Clean Room Duty */}
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>🧹 เริ่มบังคับเวรทำความสะอาดห้องสภา:</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="date"
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: 12, flex: 1 }}
                        value={cleanDutyStartDate}
                        onChange={e => saveCleanDutyStartDate(e.target.value)}
                      />
                      {cleanDutyStartDate && (
                        <button
                          className="btn btn-gray"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => saveCleanDutyStartDate('')}
                        >
                          รีเซ็ต
                        </button>
                      )}
                    </div>
                    {!cleanDutyStartDate && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>* เริ่มบังคับทุกวันทำงาน</div>}
                  </div>

                  {/* Greeting Duty */}
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>🙏 เริ่มบังคับเวรยืนไหว้ต้อนรับ:</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="date"
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: 12, flex: 1 }}
                        value={greetingDutyStartDate}
                        onChange={e => saveGreetingDutyStartDate(e.target.value)}
                      />
                      {greetingDutyStartDate && (
                        <button
                          className="btn btn-gray"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => saveGreetingDutyStartDate('')}
                        >
                          รีเซ็ต
                        </button>
                      )}
                    </div>
                    {!greetingDutyStartDate && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>* เริ่มบังคับทุกวันทำงาน</div>}
                  </div>
                </div>
              </div>

              {/* Day settings */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#455a64', marginBottom: 8 }}>วันที่กำหนดให้มีการเช็คชื่อ (วันในสัปดาห์):</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(day => {
                    const active = enabledDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => handleToggleDay(day)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          border: `1px solid ${active ? '#00bcd4' : '#e0e0e0'}`,
                          background: active ? '#e0f7fa' : '#fff',
                          color: active ? '#00838f' : '#757575',
                          cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}
                      >
                        {active ? '✓ ' : ''}{day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Special Holidays settings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#455a64', marginBottom: 8 }}>เพิ่มวันหยุดเช็คชื่อพิเศษ (รายวัน):</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="date"
                      className="input-field"
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      value={newDisabledDate}
                      onChange={e => setNewDisabledDate(e.target.value)}
                    />
                    <button className="btn btn-primary" style={{ padding: '0 16px', fontSize: 13 }} onClick={handleAddDisabledDate}>
                      เพิ่ม
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#455a64', marginBottom: 8 }}>วันหยุดพิเศษที่เปิดใช้งานอยู่:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {disabledDates.length === 0 ? (
                      <span style={{ fontSize: 12, color: '#9e9e9e' }}>ไม่มีวันหยุดพิเศษ</span>
                    ) : (
                      disabledDates.map(date => (
                        <span
                          key={date}
                          style={{
                            background: '#ffebee',
                            color: '#c62828',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '4px 8px',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                          <button
                            onClick={() => handleRemoveDisabledDate(date)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#c62828',
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: 10,
                              marginLeft: 2
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>


            </div>
          )}
        </div>
      )}

      {/* Fines Table */}
      {activeTab === 'list' && (
        <div className="card">
          <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap: 'wrap', gap: 12 }}>
            <span className="card-title">บันทึกการกระทำความผิด</span>
            <div style={{ display:'flex', gap:8, width: '100%', maxWidth: 300 }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="🔍 ค้นหาชื่อ หรือความผิด..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                style={{ fontSize: 13, padding: '6px 12px' }}
              />
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>สมาชิก</th>
                  <th>ความผิด</th>
                  <th>จำนวนเงิน</th>
                  <th>วันที่</th>
                  <th>หมายเหตุ</th>
                  <th>ผู้บันทึก</th>
                  <th>สถานะชำระเงิน</th>
                  {canManage && <th style={{ textAlign:'center' }}>การจัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const u = users.find(user => String(user.id) === String(f.userId));
                  const dept = u && u.deptId ? DEPARTMENTS.find(d => d.id === u.deptId) : null;
                  const ps = f.paymentStatus;
                  return (
                    <tr key={f.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div className="avatar" style={{ width:28, height:28, fontSize:11, background: (u?.avatarColor || '#00bcd4') + '22', color: u?.avatarColor || '#00bcd4' }}>{u?.avatar || f.nickname.charAt(0)}</div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{f.userName}</div>
                            <div style={{ fontSize:11, color:'#9e9e9e' }}>"{f.nickname}"</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{f.violation}</td>
                      <td style={{ fontWeight: 700, color: '#e53935' }}>{f.amount} บาท</td>
                      <td style={{ fontSize: 12 }}>{f.date}</td>
                      <td style={{ fontSize: 12, color: '#757575' }}>{f.note || '–'}</td>
                      <td style={{ fontSize: 12, color: '#9e9e9e' }}>{f.by}</td>
                      <td>
                        {ps === 'paid' && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                        {ps === 'slip_uploaded' && <span className="badge badge-yellow">⏳ รอตรวจสลิป</span>}
                        {ps === 'unpaid' && <span className="badge badge-red">ยังไม่ชำระ</span>}
                      </td>
                      {canManage && (
                        <td style={{ textAlign:'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {!f.paid && (
                              <button 
                                className="btn btn-gray btn-sm" 
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => togglePaid(f.id)}
                              >
                                💵 ค้างชำระ
                              </button>
                            )}
                            {ps === 'slip_uploaded' && (
                              <button 
                                className="btn btn-primary btn-sm" 
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => { setPaymentModal(f); setSlipPreview(f.paymentSlip); }}
                              >
                                👁️ สลิป
                              </button>
                            )}
                            <button 
                              className="btn btn-danger btn-sm" 
                              style={{ padding: '4px 8px', fontSize: 11, background: '#d32f2f' }}
                              onClick={() => { if (confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteFine(f.id); }}
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ไม่พบรายการบันทึกความผิด 🔍</div>
          )}
        </div>
      )}

      {/* Attendance Table */}
      {activeTab === 'checkin' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">บันทึกการเช็คชื่อเข้าโรงเรียน</span>
              <div style={{ fontSize: 12, color: '#757575' }}>ข้อมูลวันที่เลือก</div>
            </div>
            <div>
              <input 
                type="date" 
                className="input-field" 
                style={{ padding: '4px 8px', fontSize: 13 }}
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                max={todayStr}
              />
            </div>
          </div>
          {startDate && selectedDate < startDate && (
            <div style={{ background: '#e0f7fa', color: '#006064', padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 14px 16px', borderRadius: 8 }}>
              <span>ℹ️</span>
              <span><strong>วันที่เลือก อยู่ก่อนกำหนดวันเริ่มเช็คชื่อจริง ({new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })})</strong> ทำให้ไม่มีการบังคับเช็คชื่อในวันนี้</span>
            </div>
          )}
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr><th>#</th><th>สมาชิก</th><th>ฝ่าย</th><th>เวลาเช็คชื่อ</th><th>สถานะ</th><th>ภาพถ่ายยืนยัน</th></tr>
              </thead>
              <tbody>
                {attendanceData.map((u,i) => {
                  const dept = u.deptId ? DEPARTMENTS.find(d=>d.id===u.deptId) : null;
                  return (
                    <tr key={u.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div className="avatar" style={{ width:28, height:28, fontSize:12, background: u.avatarColor+'22', color: u.avatarColor }}>{u.avatar}</div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                            <div style={{ fontSize:11, color:'#9e9e9e' }}>"{u.nickname}"</div>
                          </div>
                        </div>
                      </td>
                      <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                      <td style={{ fontSize:13, fontWeight: 500 }}>
                        {u.time}
                        {u.isManual && u.checkInStatus !== 'leave' && u.checkInStatus !== 'missing' && <div style={{ fontSize: 10, color: '#f57f17' }}>* เช็คโดยปกครอง</div>}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        {canManage ? (
                          <select 
                            value={u.checkInStatus} 
                            onChange={(e) => handleManualCheckIn(u.id, e.target.value)}
                            style={{ 
                              background: STATUS_COLORS[u.checkInStatus].bg, 
                              color: STATUS_COLORS[u.checkInStatus].col,
                              border: `1px solid ${STATUS_COLORS[u.checkInStatus].col}44`,
                              padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer', width: '100%'
                            }}
                          >
                            <option value="on_time">มา</option>
                            <option value="late">สาย</option>
                            <option value="leave">ลา</option>
                            <option value="missing">ขาด</option>
                            <option value="activity">ทำกิจกรรม</option>
                            <option value="reset">รีเซ็ต (ลบประวัติ)</option>
                            {u.checkInStatus === 'not_required' && <option value="not_required">ไม่บังคับ</option>}
                          </select>
                        ) : (
                          <span className="badge" style={{ background: STATUS_COLORS[u.checkInStatus].bg, color: STATUS_COLORS[u.checkInStatus].col }}>
                            {STATUS_COLORS[u.checkInStatus].label}
                          </span>
                        )}
                      </td>
                      <td>
                        {u.photo ? (
                          <img src={transformGoogleDriveUrl(u.photo)} alt="selfie" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #e0e0e0' }} onClick={() => setViewPhotoUrl(transformGoogleDriveUrl(u.photo))} title="คลิกเพื่อดูรูปเต็ม" />
                        ) : (
                          <span style={{ fontSize: 11, color: '#bdbdbd' }}>- ไม่มีภาพ -</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clean Duty Check */}
      {activeTab === 'clean' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">ตรวจสอบเวรทำความสะอาดห้องสภา</span>
              <div style={{ fontSize: 12, color: '#757575' }}>ข้อมูลวันที่เลือก</div>
            </div>
            <div>
              <input 
                type="date" 
                className="input-field" 
                style={{ padding: '4px 8px', fontSize: 13 }}
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                max={todayStr}
              />
            </div>
          </div>
          {cleanDutyStartDate && selectedDate < cleanDutyStartDate && (
            <div style={{ background: '#e0f7fa', color: '#006064', padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 14px 16px', borderRadius: 8 }}>
              <span>ℹ️</span>
              <span><strong>วันที่เลือก อยู่ก่อนกำหนดวันเริ่มทำเวรจริง ({new Date(cleanDutyStartDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })})</strong> ทำให้ไม่มีการบังคับทำเวรหรือหักเงินในวันนี้</span>
            </div>
          )}
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr><th>#</th><th>สมาชิก</th><th>ฝ่าย</th><th>สถานะเวรทำความสะอาด</th><th>ภาพถ่ายยืนยัน</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const d = new Date(selectedDate);
                  const dayName = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'][d.getDay()];
                  const dutyForDay = cleanSchedules.find(s => s.day === dayName);
                  const dutyForDayData = dutyForDay?.data || {};
                  const dutyMembers = dutyForDayData.members || [];

                  if (dutyMembers.length === 0) {
                    return <tr><td colSpan="5" style={{ textAlign:'center', padding:40, color:'#9e9e9e' }}>ไม่มีเวรทำความสะอาดในวันนี้</td></tr>;
                  }

                  const usersOnDuty = dutyMembers.map(nickname => {
                    const found = users.find(u => u.nickname === nickname);
                    if (found) return found;
                    return {
                      id: nickname,
                      name: `สมาชิก (${nickname})`,
                      nickname: nickname,
                      deptId: null,
                      avatar: nickname.substring(0, 1),
                      avatarColor: '#9e9e9e'
                    };
                  });

                  return usersOnDuty.map((u, i) => {
                    const dept = DEPARTMENTS.find(dept => dept.id === u.deptId);
                    const realRec = dbCleanChecks.find(c => c.nickname === u.nickname);
                    const isExempt = dbExemptNicknames.includes(u.nickname);
                    const isBeforeStart = cleanDutyStartDate && selectedDate < cleanDutyStartDate;
                    let status = realRec ? realRec.status : (isExempt || isBeforeStart ? 'not_required' : 'missing');
                    let photo = realRec ? realRec.photo : null;
                    if (selectedDate === todayStr && user?.id === u.id && cleanDutyState?.photo) {
                      status = 'done';
                      photo = cleanDutyState.photo;
                    }
                    return (
                      <tr key={u.id}>
                        <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div className="avatar" style={{ width:28, height:28, fontSize:12, background: u.avatarColor+'22', color: u.avatarColor }}>{u.avatar}</div>
                            <div>
                              <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                              <div style={{ fontSize:11, color:'#9e9e9e' }}>"{u.nickname}"</div>
                            </div>
                          </div>
                        </td>
                        <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                        <td style={{ minWidth: 140 }}>
                          {canManage ? (
                            <select value={status} onChange={(e) => handleCleanCheck(u.nickname, e.target.value)}
                              style={{
                                background: status==='done'?'#e8f5e9':status==='not_required'?'#f9f9f9':'#ffebee',
                                color: status==='done'?'#2e7d32':status==='not_required'?'#9e9e9e':'#c62828',
                                border:`1px solid ${status==='done'?'#2e7d32':status==='not_required'?'#9e9e9e':'#c62828'}44`,
                                padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:600, outline:'none', cursor:'pointer', width:'100%'
                              }}
                            >
                              <option value="missing">เวร (ยังไม่ทำ)</option>
                              <option value="done">เวร (ทำแล้ว)</option>
                              {status === 'not_required' && <option value="not_required">ไม่บังคับ</option>}
                            </select>
                          ) : (
                            <span className="badge" style={{
                              background: status==='done'?'#e8f5e9':(status==='not_required' && isExempt)?'#e0f7fa':status==='not_required'?'#f9f9f9':'#ffebee',
                              color: status==='done'?'#2e7d32':(status==='not_required' && isExempt)?'#00838f':status==='not_required'?'#9e9e9e':'#c62828'
                            }}>
                              {status === 'done' ? 'ทำแล้ว' : status === 'not_required' ? (isExempt ? 'ทำกิจกรรม (ยกเว้น)' : 'ไม่บังคับ') : 'ยังไม่ทำ'}
                            </span>
                          )}
                        </td>
                        <td>
                          {photo ? (
                             <img src={transformGoogleDriveUrl(photo)} alt="clean-proof" style={{ width:36, height:36, objectFit:'cover', borderRadius:4, cursor:'pointer', border:'1px solid #e0e0e0' }} onClick={() => setViewPhotoUrl(transformGoogleDriveUrl(photo))} />
                          ) : (
                            <span style={{ fontSize:11, color:'#bdbdbd' }}>- ไม่มีภาพ -</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Greeting Duty Check */}
      {activeTab === 'greeting' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">ตรวจสอบการปฏิบัติหน้าที่เวรยืนไหว้</span>
              <div style={{ fontSize: 12, color: '#757575' }}>ข้อมูลวันที่เลือก</div>
            </div>
            <div>
              <input 
                type="date" 
                className="input-field" 
                style={{ padding: '4px 8px', fontSize: 13 }}
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                max={todayStr}
              />
            </div>
          </div>
          {greetingDutyStartDate && selectedDate < greetingDutyStartDate && (
            <div style={{ background: '#e0f7fa', color: '#006064', padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 14px 16px', borderRadius: 8 }}>
              <span>ℹ️</span>
              <span><strong>วันที่เลือก อยู่ก่อนกำหนดวันเริ่มเช็คเวรยืนไหว้จริง ({new Date(greetingDutyStartDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })})</strong> ทำให้ไม่มีการบังคับเวรหรือหักเงินในวันนี้</span>
            </div>
          )}
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>สมาชิก</th>
                  <th>ฝ่าย</th>
                  <th>ประตูที่ยืนเวร</th>
                  <th>เช็คชื่อเข้า รร.</th>
                  <th>สถานะส่งรายงานรูปเวร (ก่อน 07:10 น.)</th>
                  <th>ภาพถ่ายยืนเวร</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const d = new Date(selectedDate);
                  const dayName = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'][d.getDay()];
                  const dutyForDay = greetingSchedules.find(s => s.day === dayName);
                  const dutyForDayData = dutyForDay?.data || {};

                  // Flatten gate1, gate2, gate3 members
                  const dutyMembers = [];
                  ['gate1', 'gate2', 'gate3'].forEach(gate => {
                    const members = dutyForDayData[gate] || [];
                    members.forEach(nickname => {
                      if (nickname && nickname !== '–') {
                        const swap = dbDutySwaps.find(s => s.date === selectedDate && s.duty_type === `greeting_${gate}` && s.original_nickname === nickname);
                        if (swap) {
                          dutyMembers.push({ nickname: swap.substitute_nickname, gate, original: nickname });
                        } else {
                          dutyMembers.push({ nickname, gate });
                        }
                      }
                    });
                  });

                  if (dutyMembers.length === 0) {
                    return <tr><td colSpan="7" style={{ textAlign:'center', padding:40, color:'#9e9e9e' }}>ไม่มีเวรยืนไหว้ในวันนี้</td></tr>;
                  }

                  return dutyMembers.map((m, i) => {
                    const u = users.find(usr => usr.nickname === m.nickname);
                    const dept = u && u.deptId ? DEPARTMENTS.find(dept => dept.id === u.deptId) : null;
                    
                    // Match morning attendance
                    const attRec = dbAttendance.find(att => att.nickname === m.nickname || (u && String(att.user_id) === String(u.id)));
                    
                    // Match greeting check-in photo report
                    const greetRec = dbGreetingChecks.find(c => c.nickname === m.nickname);
                    
                    const isExempt = dbExemptNicknames.includes(m.nickname);
                    const isBeforeStart = greetingDutyStartDate && selectedDate < greetingDutyStartDate;
                    let greetStatus = greetRec ? greetRec.status : (isExempt || isBeforeStart ? 'not_required' : 'missing');
                    let greetPhoto = greetRec ? greetRec.photo : null;
                    
                    // Check if today and self check-in state is active
                    if (selectedDate === todayStr && user?.nickname === m.nickname && greetingDutyState?.photo) {
                      greetStatus = 'done';
                      greetPhoto = greetingDutyState.photo;
                    }

                    const gateLabels = { gate1: '🚪 ประตูไหมไทย', gate2: '🏛️ ประตูอำเภอ', gate3: '🏫 ประตูหน้า รร.' };
                    const gateLabel = gateLabels[m.gate] || 'ไม่ระบุ';

                    return (
                      <tr key={m.nickname}>
                        <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div className="avatar" style={{ width:28, height:28, fontSize:12, background: (u?.avatarColor || '#9e9e9e')+'22', color: u?.avatarColor || '#9e9e9e' }}>{u?.avatar || m.nickname.charAt(0)}</div>
                            <div>
                              <div style={{ fontWeight:600, fontSize:13 }}>{u?.name || `สมาชิก (${m.nickname})`}</div>
                              <div style={{ fontSize:11, color:'#9e9e9e' }}>"{m.nickname}" {m.original && <span style={{ color: '#f57f17' }}>(แทน {m.original})</span>}</div>
                            </div>
                          </div>
                        </td>
                        <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                        <td style={{ fontSize:13, fontWeight:600, color:'#00838f' }}>{gateLabel}</td>
                        <td>
                          {attRec ? (
                            <div style={{ fontSize:13 }}>
                              <span className="badge" style={{ background: STATUS_COLORS[attRec.status].bg, color: STATUS_COLORS[attRec.status].col, marginRight: 6 }}>
                                {STATUS_COLORS[attRec.status].label}
                              </span>
                              {attRec.time}
                            </div>
                          ) : (
                            <span style={{ fontSize:12, color:'#9e9e9e' }}>ยังไม่เช็คชื่อเข้า รร.</span>
                          )}
                        </td>
                        <td style={{ minWidth: 150 }}>
                          {canManage ? (
                            <select value={greetStatus} onChange={(e) => handleGreetingCheck(m.nickname, m.gate, e.target.value)}
                              style={{
                                background: greetStatus==='done'?'#e8f5e9':greetStatus==='not_required'?'#f9f9f9':'#ffebee',
                                color: greetStatus==='done'?'#2e7d32':greetStatus==='not_required'?'#9e9e9e':'#c62828',
                                border:`1px solid ${greetStatus==='done'?'#2e7d32':greetStatus==='not_required'?'#9e9e9e':'#c62828'}44`,
                                padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:600, outline:'none', cursor:'pointer', width:'100%'
                              }}
                            >
                              <option value="missing">ขาดเวร (ยังไม่ส่งรูป)</option>
                              <option value="done">ส่งแล้ว/ปฏิบัติหน้าที่</option>
                              <option value="reset">รีเซ็ต (ลบประวัติ)</option>
                              {greetStatus === 'not_required' && <option value="not_required">ไม่บังคับ</option>}
                            </select>
                          ) : (
                            <span className="badge" style={{
                              background: greetStatus==='done'?'#e8f5e9':(greetStatus==='not_required' && isExempt)?'#e0f7fa':greetStatus==='not_required'?'#f9f9f9':'#ffebee',
                              color: greetStatus==='done'?'#2e7d32':(greetStatus==='not_required' && isExempt)?'#00838f':greetStatus==='not_required'?'#9e9e9e':'#c62828'
                            }}>
                              {greetStatus === 'done' ? 'ส่งรายงานแล้ว' : greetStatus === 'not_required' ? (isExempt ? 'ทำกิจกรรม (ยกเว้น)' : 'ไม่บังคับ') : 'ขาดเวร (ปรับ 100)'}
                            </span>
                          )}
                        </td>
                        <td>
                          {greetPhoto ? (
                             <img src={transformGoogleDriveUrl(greetPhoto)} alt="greeting-proof" style={{ width:36, height:36, objectFit:'cover', borderRadius:4, cursor:'pointer', border:'1px solid #e0e0e0' }} onClick={() => setViewPhotoUrl(transformGoogleDriveUrl(greetPhoto))} />
                          ) : (
                            <span style={{ fontSize:11, color:'#bdbdbd' }}>- ไม่มีภาพ -</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary per person */}
      {activeTab === 'summary' && (
        <div className="card">
          <div className="card-header"><span className="card-title">สรุปยอดหักเงินรายบุคคล</span></div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr><th>#</th><th>สมาชิก</th><th>ฝ่าย</th><th>จำนวนครั้ง</th><th>ยอดรวม</th><th>ยังไม่ชำระ</th><th>ชำระแล้ว</th></tr>
              </thead>
              <tbody>
                {summary.map((u,i) => {
                  const dept = u.deptId ? DEPARTMENTS.find(d=>d.id===u.deptId) : null;
                  return (
                    <tr key={u.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div className="avatar" style={{ width:30, height:30, fontSize:12, background: u.avatarColor+'22', color: u.avatarColor }}>{u.avatar}</div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                            <div style={{ fontSize:11, color:'#9e9e9e' }}>"{u.nickname}"</div>
                          </div>
                        </div>
                      </td>
                      <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                      <td style={{ fontWeight:600 }}>{u.count} ครั้ง</td>
                      <td style={{ fontWeight:700, color:'#e53935' }}>{u.total} บาท</td>
                      <td>{u.unpaid > 0 ? <span className="badge badge-red">{u.unpaid} บาท</span> : <span style={{ color:'#9e9e9e', fontSize:12 }}>–</span>}</td>
                      <td><span className="badge badge-green">{u.total - u.unpaid} บาท</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {summary.length === 0 && (
            <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ยังไม่มีบันทึกความผิด 🎉</div>
          )}
        </div>
      )}

      {/* QR Payment Modal */}
      {paymentModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPaymentModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>💳 ชำระค่าปรับ - {paymentModal.violation}</span>
              <button onClick={()=>setPaymentModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>
              <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:8, padding:'12px 16px', width:'100%', fontSize:13, textAlign:'center' }}>
                ยอดชำระ: <strong style={{ fontSize:20, color:'#e65100' }}>{paymentModal.amount} บาท</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: 13, color: '#555', fontWeight: 600, marginBottom: 8 }}>QR Code ชำระเงิน PromptPay</div>
                <div style={{ background: '#ffffff', padding: 8, borderRadius: 12, border: '1px solid #e0e0e0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                  <img
                    src={`https://promptpay.io/${PROMPTPAY_ID}/${paymentModal.amount}`}
                    alt="PromptPay QR"
                    style={{ width: 180, height: 180, display: 'block' }}
                    onError={e => { e.target.style.display='none'; }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#757575' }}>PromptPay (เลขบัตรประชาชน): <strong>1-6398-00408-76-5</strong></div>
                <div style={{ fontSize: 13, color: '#006064', fontWeight: 700, marginTop: 4 }}>ชื่อบัญชี: {PROMPTPAY_NAME}</div>
              </div>
              <div style={{ width:'100%' }}>
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '16px 20px',
                  border: '2px dashed #00bcd4',
                  borderRadius: 12,
                  background: '#e0f7fa44',
                  color: '#00838f',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 14,
                  boxShadow: '0 2px 8px rgba(0, 188, 212, 0.08)'
                }}>
                  <span style={{ fontSize: 24 }}>📤</span>
                  <span>คลิกเพื่ออัปโหลดสลิปหลักฐาน</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#006064cc' }}>รองรับไฟล์รูปภาพสลิปทุกประเภท</span>
                  <input type="file" accept="image/*" onChange={e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const maxDim = 800;
                        if (width > maxDim || height > maxDim) {
                          if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                          } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                          }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        setSlipPreview(canvas.toDataURL('image/jpeg', 0.7));
                      };
                      img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                  }} style={{ display: 'none' }} />
                </label>
                {slipPreview && (
                  <div style={{ marginTop: 12, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                      <span>✅ โหลดรูปภาพสลิปเรียบร้อยแล้ว</span>
                    </div>
                    <img src={slipPreview} alt="slip" style={{ width:'100%', maxHeight:180, objectFit:'contain', borderRadius:8, border:'2px solid #a5d6a7' }} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setPaymentModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleUploadSlip} disabled={!slipPreview || submittingSlip}>
                {submittingSlip ? 'กำลังบันทึก...' : '📤 ส่งสลิปรอตรวจสอบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Violation Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:8 }}><AlertTriangle size={16} color="#e53935"/> บันทึกความผิด</span>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">สมาชิกที่ทำผิด *</label>
                <select className="select-field" value={form.userId} onChange={e=>handleUserChange(e.target.value)}>
                  <option value="">– เลือกสมาชิก –</option>
                  {users.filter(u => u.role !== 'admin' && u.nickname !== 'แอดมิน').map(u => <option key={u.id} value={u.id}>{u.name} ({u.nickname}) {u.deptId === 2 ? '👮‍♂️ สารวัตร' : ''}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
                <div>
                  <label className="form-label">ประเภทความผิด *</label>
                  <select className="select-field" value={form.violation} onChange={e=>handleViolationChange(e.target.value)}>
                    {VIOLATION_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">จำนวน (นาที/ข้าง/จุด)</label>
                  <input className="input-field" type="number" min="1" value={form.multiplier} onChange={e=>handleMultiplierChange(e.target.value)}/>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="form-label">รวมจำนวนเงิน (บาท) *</label>
                  <input className="input-field" type="number" min="0" value={form.amount} onChange={e=>setForm(p=>({...p, amount:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">วันที่เกิดเหตุ *</label>
                  <input className="input-field" type="date" value={form.date} onChange={e=>setForm(p=>({...p, date:e.target.value}))}/>
                </div>
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="input-field" placeholder="รายละเอียดเพิ่มเติม..." value={form.note} onChange={e=>setForm(p=>({...p, note:e.target.value}))}/>
              </div>
              {form.amount > 0 && form.userId && (
                <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'10px 14px', fontSize:13 }}>
                  ⚠️ จะหักเงิน <strong>{form.amount} บาท</strong> จาก <strong>{users.find(u=>String(u.id)===String(form.userId))?.name}</strong>
                  {users.find(u=>String(u.id)===String(form.userId))?.deptId === 2 && <span style={{ color:'#d32f2f', fontWeight:'bold' }}> (สารวัตรโดนปรับคูณ 2)</span>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={handleSave} disabled={!form.userId||!form.date}>
                <Save size={14}/> บันทึกความผิด
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Photo View Modal */}
      {viewPhotoUrl && (
        <div className="modal-overlay" onClick={() => setViewPhotoUrl(null)} style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: 500, padding: 10, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: 'none', padding: '5px 10px' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🔍 ดูภาพถ่ายหลักฐาน</span>
              <button onClick={() => setViewPhotoUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <img src={transformGoogleDriveUrl(viewPhotoUrl)} alt="expanded proof" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
