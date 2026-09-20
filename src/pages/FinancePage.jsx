import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS } from '../data/mockData';
import { Plus, X, Save, Search, CheckCircle, Clock, XCircle, Eye, Camera, ChevronDown, ChevronUp, Download, Users, ListFilter, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import logoUrl from '../assets/logo.png';


const EXPENSE_CATEGORIES = [
  'ค่าวัสดุอุปกรณ์', 'ค่าอาหารและเครื่องดื่ม', 'ค่าสถานที่',
  'ค่าพาหนะ', 'ค่าตกแต่ง', 'ค่าของที่ระลึก', 'อื่นๆ',
];

const STATUS_STYLE = {
  pending:  { label: 'รอดำเนินการ', badge: 'badge-yellow', icon: <Clock size={12}/> },
  approved: { label: 'อนุมัติแล้ว',  badge: 'badge-green',  icon: <CheckCircle size={12}/> },
  rejected: { label: 'ไม่อนุมัติ',   badge: 'badge-red',    icon: <XCircle size={12}/> },
};

const BUDGET_TOTAL = 15000;

export default function FinancePage() {
  const { user, isAdmin, isDeptHead, isPresident } = useAuth();
  const isFinance = user?.deptId === 1 || isAdmin;
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('requests');
  const [modal, setModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const initForm = { title:'', category: EXPENSE_CATEGORIES[0], amount:'', note:'' };
  const [form, setForm] = useState(initForm);

  // Fee collection system
  const [fees, setFees] = useState([]);
  const [feeModal, setFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState({ title:'', amount:'', date:'' });
  const [collectModal, setCollectModal] = useState(null);
  const [collectMode, setCollectMode] = useState('individual');
  const [collectUserId, setCollectUserId] = useState('');
  const [expandedFeeIds, setExpandedFeeIds] = useState({});

  const toggleFeeExpand = (feeId) => {
    setExpandedFeeIds(prev => ({
      ...prev,
      [feeId]: prev[feeId] === undefined ? false : !prev[feeId]
    }));
  };

  const expandAllFees = () => {
    const allMap = {};
    fees.forEach(f => { allMap[f.id] = true; });
    setExpandedFeeIds(allMap);
  };

  const collapseAllFees = () => {
    const allMap = {};
    fees.forEach(f => { allMap[f.id] = false; });
    setExpandedFeeIds(allMap);
  };
  
  // Discipline fines
  const [dfines, setDfines] = useState([]);
  const [slipViewModal, setSlipViewModal] = useState(null); // fine object to view slip
  const [fineSubView, setFineSubView] = useState('list'); // 'list' | 'summary'
  const [memberFineModal, setMemberFineModal] = useState(null); // selected member object for fine details
  const [memberFineSearch, setMemberFineSearch] = useState('');
  const [memberFineFilter, setMemberFineFilter] = useState('all'); // 'all' | 'unpaid' | 'paid' | 'zero'
  const [fineListSearch, setFineListSearch] = useState('');
  
  // สมาชิกตัวจริงที่ดึงจากระบบ
  const [usersList, setUsersList] = useState([]);
  const [feeSlipModal, setFeeSlipModal] = useState(null);

  // ฟังก์ชันจับคู่ค่าปรับกับสมาชิกแต่ละคน (รองรับทั้ง userId, nickname, และ fullName)
  const getUserFines = (userObj) => {
    if (!userObj) return [];
    const uid = String(userObj.id);
    const nick = (userObj.nickname || '').trim().toLowerCase();
    const name = (userObj.name || '').trim().toLowerCase();
    return dfines.filter(f => {
      if (f.userId && String(f.userId) === uid) return true;
      if (f.nickname && nick && f.nickname.trim().toLowerCase() === nick) return true;
      if (f.userName && name && f.userName.trim().toLowerCase() === name) return true;
      return false;
    });
  };

  const loadFinanceData = async () => {
    try {
      // โหลดสมาชิกจริง - ปรับแต่งลดปริมาณข้อมูล (หลีกเลี่ยงโหลดรูปโปรไฟล์)
      const { data: uData, error: uErr } = await supabase
        .from('users')
        .select('id, name, nickname, student_id, phone, role, dept_id, position, avatar_color');
      if (!uErr && uData) {
        setUsersList(uData);
      }

      // โหลดคำขอเบิกเงิน
      const { data: reqData, error: reqErr } = await supabase
        .from('finance_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!reqErr && reqData) {
        const mappedReqs = reqData.map(r => ({
          id: r.id,
          title: r.title,
          category: r.category,
          amount: r.amount,
          requester: r.requester,
          deptId: r.dept_id,
          date: r.date,
          status: r.status,
          note: r.note,
          approvedBy: r.approved_by
        }));
        setRequests(mappedReqs);
      }

      // โหลดรายการเก็บเงิน
      const { data: feesData, error: feesErr } = await supabase
        .from('finance_fees')
        .select('*')
        .order('created_at', { ascending: false });
      if (!feesErr && feesData) {
        setFees(feesData);
      }

      // โหลดค่าปรับ - หลีกเลี่ยงโหลดรูปสลิปทันทีเพื่อเพิ่มความเร็วในการโหลด 100 เท่า!
      const { data: finesData } = await supabase
        .from('discipline_fines')
        .select('id, user_id, user_name, nickname, violation, amount, date, note, by, paid, payment_status')
        .order('created_at', { ascending: false });
      if (finesData) {
        setDfines(finesData.map(d => ({
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
          paymentSlip: null, // จะโหลดทางออนไลน์เฉพาะเมื่อคลิก
        })));
      }
    } catch (err) {
      console.error('Error loading finance data:', err);
    }
  };

  useEffect(() => {
    loadFinanceData();

    const interval = setInterval(() => {
      loadFinanceData();
    }, 10000);

    const channel = supabase
      .channel('finance-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_requests' }, () => {
        loadFinanceData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_fees' }, () => {
        loadFinanceData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discipline_fines' }, () => {
        loadFinanceData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = requests.filter(r => {
    const ms = r.title.toLowerCase().includes(search.toLowerCase()) || 
               r.requester.toLowerCase().includes(search.toLowerCase()) || 
               r.category.toLowerCase().includes(search.toLowerCase());
    const mf = filterStatus === 'all' || r.status === filterStatus;
    return ms && mf;
  });

  const handleSubmit = async () => {
    if (!form.title || !form.amount) return;
    const newRequest = {
      title: form.title,
      category: form.category,
      amount: parseInt(form.amount),
      requester: user.nickname,
      dept_id: user.deptId,
      date: new Date().toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }),
      status: 'pending',
      note: form.note,
      approved_by: '',
    };

    try {
      const { data, error } = await supabase
        .from('finance_requests')
        .insert(newRequest)
        .select();
      if (error) throw error;
      if (data && data[0]) {
        const inserted = {
          id: data[0].id,
          title: data[0].title,
          category: data[0].category,
          amount: data[0].amount,
          requester: data[0].requester,
          deptId: data[0].dept_id,
          date: data[0].date,
          status: data[0].status,
          note: data[0].note,
          approvedBy: data[0].approved_by
        };
        setRequests(prev => [inserted, ...prev]);

        // Send Discord notification for new withdrawal request
        const dept = inserted.deptId ? (() => { const DEPTS = [{id:'finance',short:'การเงิน'},{id:'academic',short:'วิชาการ'},{id:'pr',short:'ประชาสัมพันธ์'},{id:'discipline',short:'กิจการ'},{id:'secretary',short:'เลขาฯ'},{id:'av',short:'โสตฯ'},{id:'facilities',short:'อาคารฯ'}]; return DEPTS.find(d=>d.id===inserted.deptId)?.short || inserted.deptId; })() : 'ไม่ระบุ';
        const embedTitle = `📋 คำขอเบิกเงินสภานักเรียนใหม่`;
        const embedDesc = `มีสมาชิกยื่นคำขอเบิกเงินเข้ามาในระบบ กรุณาตรวจสอบและดำเนินการ`;
        const embedFields = [
          { name: '📄 รายการ', value: inserted.title, inline: true },
          { name: '📂 หมวด', value: inserted.category, inline: true },
          { name: '💵 จำนวนเงิน', value: `${inserted.amount.toLocaleString()} บาท`, inline: true },
          { name: '👤 ผู้ขอ', value: inserted.requester, inline: true },
          { name: '🏛️ ฝ่าย', value: dept, inline: true },
          { name: '📝 หมายเหตุ', value: inserted.note || 'ไม่มี', inline: false }
        ];
        const financeUserIds = usersList
          .filter(u => u.dept_id === 1 || u.deptId === 1 || u.role === 'admin')
          .map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15105570, embedFields, null, 'finance', financeUserIds.length > 0 ? financeUserIds : null); // สีส้มสำหรับคำขอใหม่
      }
    } catch (err) {
      console.error('Error inserting finance request:', err);
      alert('เกิดข้อผิดพลาดในการส่งคำขอ: ' + err.message);
    }
    setModal(false); setForm(initForm);
  };

  const approve = async (id) => {
    try {
      const { error } = await supabase
        .from('finance_requests')
        .update({ status: 'approved', approved_by: user.nickname })
        .eq('id', id);
      if (error) throw error;
      const target = requests.find(r => r.id === id);
      setRequests(prev => prev.map(r => r.id===id ? { ...r, status:'approved', approvedBy: user.nickname } : r));

      // Send Discord notification for approval
      if (target) {
        const embedTitle = `✅ อนุมัติคำขอเบิกเงินสภานักเรียน`;
        const embedDesc = `คำขอเบิกเงิน **${target.title}** ได้รับการอนุมัติเรียบร้อยแล้ว`;
        const embedFields = [
          { name: '📄 รายการ', value: target.title, inline: true },
          { name: '💵 จำนวน', value: `${target.amount.toLocaleString()} บาท`, inline: true },
          { name: '👤 ผู้ขอ', value: target.requester, inline: true },
          { name: '✍️ อนุมัติโดย', value: user.nickname, inline: true }
        ];
        
        const requesterUser = usersList.find(u => u.nickname === target.requester);
        const targetUserId = requesterUser ? String(requesterUser.id) : null;
        
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, embedFields, null, 'finance', targetUserId ? [targetUserId] : null); // สีเขียวสำหรับอนุมัติ
      }
    } catch (err) {
      console.error('Error approving request:', err);
      alert('เกิดข้อผิดพลาดในการอนุมัติคำขอ: ' + err.message);
    }
  };

  const reject = async (id, note) => {
    try {
      const { error } = await supabase
        .from('finance_requests')
        .update({ status: 'rejected', note: note })
        .eq('id', id);
      if (error) throw error;
      const target = requests.find(r => r.id === id);
      setRequests(prev => prev.map(r => r.id===id ? { ...r, status:'rejected', note } : r));

      // Send Discord notification for rejection
      if (target) {
        const embedTitle = `❌ ปฏิเสธคำขอเบิกเงินสภานักเรียน`;
        const embedDesc = `คำขอเบิกเงิน **${target.title}** ไม่ได้รับการอนุมัติ`;
        const embedFields = [
          { name: '📄 รายการ', value: target.title, inline: true },
          { name: '💵 จำนวน', value: `${target.amount.toLocaleString()} บาท`, inline: true },
          { name: '👤 ผู้ขอ', value: target.requester, inline: true },
          { name: '📝 เหตุผลการปฏิเสธ', value: note || 'ไม่ระบุ', inline: false }
        ];
        
        const requesterUser = usersList.find(u => u.nickname === target.requester);
        const targetUserId = requesterUser ? String(requesterUser.id) : null;
        
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, embedFields, null, 'finance', targetUserId ? [targetUserId] : null); // สีแดงสำหรับปฏิเสธ
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('เกิดข้อผิดพลาดในการปฏิเสธคำขอ: ' + err.message);
    }
    setRejectModal(null); setRejectNote('');
  };

  const totalApproved = requests.filter(r=>r.status==='approved').reduce((s,r)=>s+r.amount,0);
  const totalPending  = requests.filter(r=>r.status==='pending').reduce((s,r)=>s+r.amount,0);
  const budgetLeft = BUDGET_TOTAL - totalApproved;

  const viewSlip = async (fine) => {
    if (fine.paymentSlip) {
      setSlipViewModal(fine);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('discipline_fines')
        .select('payment_slip')
        .eq('id', fine.id)
        .single();
      if (error) throw error;
      const updatedFine = { ...fine, paymentSlip: data.payment_slip };
      setSlipViewModal(updatedFine);
      setDfines(prev => prev.map(f => f.id === fine.id ? updatedFine : f));
    } catch (err) {
      console.error('Error fetching slip:', err);
      alert('ไม่สามารถโหลดภาพสลิปการโอนเงินได้ครับ: ' + err.message);
    }
  };

  const confirmFinePaid = async (fine) => {
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ paid: true, payment_status: 'paid' })
        .eq('id', fine.id);
      if (error) throw error;
      setDfines(prev => prev.map(f => f.id === fine.id ? { ...f, paid: true, paymentStatus: 'paid' } : f));
      setSlipViewModal(null);

      // ส่งการแจ้งเตือน
      const embedTitle = `✅ อนุมัติการชำระค่าปรับสำเร็จ - สภานักเรียน`;
      const embedDesc = `การชำระค่าปรับข้อหา **${fine.violation}** ได้รับการยืนยันแล้ว`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${fine.userName || 'ไม่ระบุ'} (${fine.nickname || ''})`, inline: true },
        { name: '⚖️ ข้อหาความผิด', value: fine.violation, inline: true },
        { name: '💵 ยอดเงิน', value: `${fine.amount} บาท`, inline: true },
        { name: '✍️ ยืนยันโดย', value: user?.nickname || 'ฝ่ายการเงิน', inline: true }
      ];
      const targetUserId = fine.userId ? String(fine.userId) : null;
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'discipline_fines', targetUserId ? [targetUserId] : null);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const rejectFineSlip = async (fine) => {
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ paid: false, payment_status: 'unpaid', payment_slip: null })
        .eq('id', fine.id);
      if (error) throw error;
      setDfines(prev => prev.map(f => f.id === fine.id ? { ...f, paid: false, paymentStatus: 'unpaid', paymentSlip: null } : f));
      setSlipViewModal(null);

      // ส่งการแจ้งเตือน
      const embedTitle = `❌ ปฏิเสธสลิปการชำระค่าปรับ - สภานักเรียน`;
      const embedDesc = `สลิปที่อัปโหลดสำหรับค่าปรับข้อหา **${fine.violation}** ไม่ถูกต้อง กรุณาอัปโหลดสลิปที่ถูกต้องอีกครั้ง`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${fine.userName || 'ไม่ระบุ'} (${fine.nickname || ''})`, inline: true },
        { name: '⚖️ ข้อหาความผิด', value: fine.violation, inline: true },
        { name: '💵 ยอดเงิน', value: `${fine.amount} บาท`, inline: true },
        { name: '✍️ ตรวจสอบโดย', value: user?.nickname || 'ฝ่ายการเงิน', inline: true }
      ];
      const targetUserId = fine.userId ? String(fine.userId) : null;
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, fields, null, 'discipline_fines', targetUserId ? [targetUserId] : null);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const revertFineUnpaid = async (fine) => {
    if (!confirm('ต้องการเปลี่ยนสถานะรายการนี้เป็น "ยังไม่ชำระเงิน" ใช่หรือไม่? (หลักฐานการชำระเงิน/สลิปจะถูกลบ)')) return;
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ paid: false, payment_status: 'unpaid', payment_slip: null })
        .eq('id', fine.id);
      if (error) throw error;
      setDfines(prev => prev.map(f => f.id === fine.id ? { ...f, paid: false, paymentStatus: 'unpaid', paymentSlip: null } : f));

      // ส่งการแจ้งเตือน
      const embedTitle = `⚠️ ปรับสถานะค่าปรับกลับเป็นยังไม่ชำระ - สภานักเรียน`;
      const embedDesc = `ค่าปรับข้อหา **${fine.violation}** ถูกปรับสถานะกลับเป็น **ยังไม่ชำระเงิน**`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${fine.userName || 'ไม่ระบุ'} (${fine.nickname || ''})`, inline: true },
        { name: '⚖️ ข้อหาความผิด', value: fine.violation, inline: true },
        { name: '💵 ยอดเงิน', value: `${fine.amount} บาท`, inline: true },
        { name: '✍️ ดำเนินการโดย', value: user?.nickname || 'ฝ่ายการเงิน', inline: true }
      ];
      const targetUserId = fine.userId ? String(fine.userId) : null;
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, fields, null, 'discipline_fines', targetUserId ? [targetUserId] : null);
      alert('เปลี่ยนสถานะเป็นยังไม่ชำระเงินสำเร็จ');
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const markFineCash = async (fineId) => {
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ paid: true, payment_status: 'paid' })
        .eq('id', fineId);
      if (error) throw error;
      setDfines(prev => prev.map(f => f.id === fineId ? { ...f, paid: true, paymentStatus: 'paid' } : f));

      // ส่งการแจ้งเตือน
      const fine = dfines.find(f => f.id === fineId);
      if (fine) {
        const embedTitle = `💵 ชำระค่าปรับด้วยเงินสดสำเร็จ - สภานักเรียน`;
        const embedDesc = `ได้รับการบันทึกยืนยันชำระค่าปรับด้วยเงินสดข้อหา **${fine.violation}** เรียบร้อยแล้ว`;
        const fields = [
          { name: '👤 ผู้ชำระ', value: `${fine.userName || 'ไม่ระบุ'} (${fine.nickname || ''})`, inline: true },
          { name: '⚖️ ข้อหาความผิด', value: fine.violation, inline: true },
          { name: '💵 ยอดเงิน', value: `${fine.amount} บาท`, inline: true },
          { name: '✍️ บันทึกโดย', value: user?.nickname || 'ฝ่ายการเงิน', inline: true }
        ];
        const targetUserId = fine.userId ? String(fine.userId) : null;
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'discipline_fines', targetUserId ? [targetUserId] : null);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const exportFeeSummaryPNG = (fee) => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const members = usersList.filter(u => u.role !== 'admin');
      
      const paidCount = members.filter(u => {
        const p = fee.payments?.[u.id];
        if (!p) return false;
        if (typeof p === 'object') return p.paid === true;
        return p === true;
      }).length;
      const totalCollected = paidCount * fee.amount;
      const totalExpected = members.length * fee.amount;
      const percent = members.length > 0 ? Math.round((paidCount / members.length) * 100) : 0;

      const width = 800;
      const headerHeight = 255;
      const statsHeight = 110;
      const progressHeight = 60;
      const tableHeaderHeight = 50;
      const rowHeight = 50;
      const footerHeight = 80;
      const totalRows = members.length === 0 ? 1 : members.length;
      const height = headerHeight + statsHeight + progressHeight + tableHeaderHeight + (totalRows * rowHeight) + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#00838f');
      gradient.addColorStop(1, '#0097a7');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath(); ctx.arc(width - 50, 50, 150, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, headerHeight, 100, 0, Math.PI * 2); ctx.fill();

      // App Logo circle (Replace with real logo)
      ctx.drawImage(logoImg, 35, 35, 135, 135);

      ctx.textAlign = 'left';
      ctx.font = 'bold 20px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('สภานักเรียนโรงเรียน (ฝ่ายการเงิน)', 190, 85);
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText('รายงานติดตามสถานะการชำระเงินสะสม / ค่าเก็บเงินสภาฯ', 190, 110);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText(fee.title, 35, 220);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 14px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`จำนวนเงินที่เรียกเก็บ: ${fee.amount} บาท/คน`, width - 35, 85);
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      ctx.fillText(`กำหนดส่งวันที่: ${fee.date}`, width - 35, 110);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.fillText(`ออกรายงาน ณ: ${dateStr} น.`, width - 35, 135);

      const statsY = headerHeight + 15;
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      drawRoundRect(35, statsY, width - 70, 75, 10);
      ctx.stroke();
      ctx.fillStyle = '#fafafa';
      ctx.fill();

      const colW = (width - 70) / 3;
      const stats = [
        { label: 'เก็บเงินสะสมได้แล้ว', val: `${totalCollected.toLocaleString()} บ.`, col: '#2e7d32' },
        { label: 'ยอดรอการเก็บ (ค้างชำระ)', val: `${(totalExpected - totalCollected).toLocaleString()} บ.`, col: '#c62828' },
        { label: 'จำนวนผู้ชำระเงินแล้ว', val: `${paidCount} / ${members.length} คน`, col: '#00838f' }
      ];
      stats.forEach((s, idx) => {
        const startX = 35 + (idx * colW);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#757575';
        ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
        ctx.fillText(s.label, startX + colW/2, statsY + 30);
        ctx.fillStyle = s.col;
        ctx.font = 'bold 18px "Noto Sans Thai", sans-serif';
        ctx.fillText(s.val, startX + colW/2, statsY + 54);

        if (idx < 2) {
          ctx.strokeStyle = '#e0e0e0';
          ctx.beginPath();
          ctx.moveTo(startX + colW, statsY + 15);
          ctx.lineTo(startX + colW, statsY + 60);
          ctx.stroke();
        }
      });

      const progY = statsY + 90;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#616161';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.fillText(`ความคืบหน้าการเก็บเงินสะสม: ${percent}%`, 35, progY + 12);
      
      ctx.fillStyle = '#f0f0f0';
      drawRoundRect(35, progY + 24, width - 70, 16, 8);
      ctx.fill();
      
      if (percent > 0) {
        ctx.fillStyle = '#00bcd4';
        drawRoundRect(35, progY + 24, (width - 70) * (percent / 100), 16, 8);
        ctx.fill();
      }

      const tableY = progY + 60;
      ctx.fillStyle = '#f5f5f5';
      drawRoundRect(35, tableY, width - 70, tableHeaderHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#616161';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.textBaseline = 'middle';

      ctx.textAlign = 'left';
      ctx.fillText('#', 55, tableY + tableHeaderHeight/2);
      ctx.fillText('รายชื่อสมาชิกสภานักเรียน', 95, tableY + tableHeaderHeight/2);
      ctx.fillText('ฝ่ายงาน', 450, tableY + tableHeaderHeight/2);
      ctx.textAlign = 'center';
      ctx.fillText('สถานะการชำระเงิน', 680, tableY + tableHeaderHeight/2);

      let currentY = tableY + tableHeaderHeight;
      ctx.textBaseline = 'middle';

      members.forEach((u, idx) => {
        const dept = DEPARTMENTS.find(d => d.id === u.deptId);
        const paymentInfo = fee.payments?.[u.id];
        const paid = typeof paymentInfo === 'object' ? paymentInfo.paid : !!paymentInfo;

        if (idx % 2 === 1) {
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(35, currentY, width - 70, rowHeight);
        }

        ctx.strokeStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.moveTo(35, currentY + rowHeight);
        ctx.lineTo(width - 35, currentY + rowHeight);
        ctx.stroke();

        ctx.fillStyle = '#757575';
        ctx.textAlign = 'left';
        ctx.font = 'normal 13px "Noto Sans Thai", sans-serif';
        ctx.fillText(`${idx + 1}`, 55, currentY + rowHeight/2);

        ctx.fillStyle = '#212121';
        ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
        ctx.fillText(u.name || '', 95, currentY + rowHeight/2);

        ctx.fillStyle = '#616161';
        ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
        ctx.fillText(dept ? dept.name : '–', 450, currentY + rowHeight/2);

        ctx.textAlign = 'center';
        ctx.fillStyle = paid ? '#e8f5e9' : '#ffebee';
        drawRoundRect(630, currentY + rowHeight/2 - 12, 100, 24, 12);
        ctx.fill();

        ctx.fillStyle = paid ? '#2e7d32' : '#c62828';
        ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
        ctx.fillText(paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย', 680, currentY + rowHeight/2);

        currentY += rowHeight;
      });

      const footerY = height - 50;
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath(); ctx.moveTo(35, footerY - 15); ctx.lineTo(width - 35, footerY - 15); ctx.stroke();

      ctx.fillStyle = '#9e9e9e';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน | Student Council Portal SWSC69', 35, footerY + 10);
      ctx.textAlign = 'right';
      ctx.fillText('เอกสารฝ่ายการเงิน - ใช้เพื่อตรวจสอบภายในสภาฯ เท่านั้น', width - 35, footerY + 10);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `fee_summary_${fee.title.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    };
  };

  const exportAllUnpaidFinesPNG = () => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const unpaidList = dfines.filter(f => f.paymentStatus !== 'paid');
      const totalAmount = unpaidList.reduce((sum, f) => sum + f.amount, 0);

      const width = 800;
      const headerHeight = 255;
      const statsHeight = 110;
      const tableHeaderHeight = 50;
      const rowHeight = 55;
      const footerHeight = 80;
      const totalRows = unpaidList.length === 0 ? 1 : unpaidList.length;
      const height = headerHeight + statsHeight + tableHeaderHeight + (totalRows * rowHeight) + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#e53935');
      gradient.addColorStop(1, '#ef5350');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath(); ctx.arc(width - 50, 50, 150, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, headerHeight, 100, 0, Math.PI * 2); ctx.fill();

      // App Logo circle (Replace with real logo)
      ctx.drawImage(logoImg, 35, 35, 135, 135);

      ctx.textAlign = 'left';
      ctx.font = 'bold 20px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('สภานักเรียนโรงเรียน (ฝ่ายปกครอง/ฝ่ายการเงิน)', 190, 85);
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText('รายงานติดตามทวงถามยอดค้างชำระค่าปรับวินัยสภานักเรียน', 190, 110);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText('รายงานรวมยอดค้างชำระค่าปรับรายบุคคล', 35, 220);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'right';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.fillText(`ออกรายงาน ณ: ${dateStr} น.`, width - 35, 220);

      const statsY = headerHeight + 15;
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      drawRoundRect(35, statsY, width - 70, 75, 10);
      ctx.stroke();
      ctx.fillStyle = '#fafafa';
      ctx.fill();

      const colW = (width - 70) / 3;
      const stats = [
        { label: 'ยอดเงินค้างชำระรวม', val: `${totalAmount.toLocaleString()} บาท`, col: '#c62828' },
        { label: 'จำนวนรายการที่ค้าง', val: `${unpaidList.length} รายการ`, col: '#e65100' },
        { label: 'จำนวนผู้มีประวัติค้าง', val: `${new Set(unpaidList.map(x=>x.userId)).size} คน`, col: '#00838f' }
      ];
      stats.forEach((s, idx) => {
        const startX = 35 + (idx * colW);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#757575';
        ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
        ctx.fillText(s.label, startX + colW/2, statsY + 30);
        ctx.fillStyle = s.col;
        ctx.font = 'bold 18px "Noto Sans Thai", sans-serif';
        ctx.fillText(s.val, startX + colW/2, statsY + 54);

        if (idx < 2) {
          ctx.strokeStyle = '#e0e0e0';
          ctx.beginPath();
          ctx.moveTo(startX + colW, statsY + 15);
          ctx.lineTo(startX + colW, statsY + 60);
          ctx.stroke();
        }
      });

      const tableY = statsY + 105;
      ctx.fillStyle = '#f5f5f5';
      drawRoundRect(35, tableY, width - 70, tableHeaderHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#616161';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.textBaseline = 'middle';

      ctx.textAlign = 'left';
      ctx.fillText('#', 55, tableY + tableHeaderHeight/2);
      ctx.fillText('ชื่อสมาชิก', 95, tableY + tableHeaderHeight/2);
      ctx.fillText('ข้อหาความผิดวินัยสภาฯ', 300, tableY + tableHeaderHeight/2);
      ctx.textAlign = 'right';
      ctx.fillText('ยอดเงินค่าปรับ', 560, tableY + tableHeaderHeight/2);
      ctx.fillText('วันที่แจ้งเตือน', 670, tableY + tableHeaderHeight/2);
      ctx.textAlign = 'center';
      ctx.fillText('สถานะ', 740, tableY + tableHeaderHeight/2);

      let currentY = tableY + tableHeaderHeight;
      ctx.textBaseline = 'middle';

      if (unpaidList.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2e7d32';
        ctx.font = 'bold 14px "Noto Sans Thai", sans-serif';
        ctx.fillText('🎉 ยินดีด้วย! ไม่มีสมาชิกคนใดค้างชำระค่าปรับเลยในขณะนี้', width/2, currentY + rowHeight/2);
      } else {
        unpaidList.forEach((item, idx) => {
          if (idx % 2 === 1) {
            ctx.fillStyle = '#fafafa';
            ctx.fillRect(35, currentY, width - 70, rowHeight);
          }

          ctx.strokeStyle = '#f0f0f0';
          ctx.beginPath();
          ctx.moveTo(35, currentY + rowHeight);
          ctx.lineTo(width - 35, currentY + rowHeight);
          ctx.stroke();

          ctx.fillStyle = '#757575';
          ctx.textAlign = 'left';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(`${idx + 1}`, 55, currentY + rowHeight/2);

          ctx.fillStyle = '#212121';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.fillText(item.userName || '', 95, currentY + rowHeight/2);

          ctx.fillStyle = '#e53935';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          let displayViolation = item.violation || '';
          if (displayViolation && ctx.measureText(displayViolation).width > 240) {
            while (displayViolation.length > 0 && ctx.measureText(displayViolation + '...').width > 240) {
              displayViolation = displayViolation.slice(0, -1);
            }
            displayViolation += '...';
          }
          ctx.fillText(displayViolation, 300, currentY + rowHeight/2);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#c62828';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.fillText(`${item.amount} บ.`, 560, currentY + rowHeight/2);

          ctx.fillStyle = '#616161';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(item.date, 670, currentY + rowHeight/2);

          ctx.textAlign = 'center';
          const isSlip = item.paymentStatus === 'slip_uploaded';
          ctx.fillStyle = isSlip ? '#fff8e1' : '#ffebee';
          drawRoundRect(705, currentY + rowHeight/2 - 11, 70, 22, 11);
          ctx.fill();

          ctx.fillStyle = isSlip ? '#f57f17' : '#c62828';
          ctx.font = 'bold 10px "Noto Sans Thai", sans-serif';
          ctx.fillText(isSlip ? 'รอตรวจสลิป' : 'ค้างชำระ', 740, currentY + rowHeight/2);

          currentY += rowHeight;
        });
      }

      const footerY = height - 50;
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath(); ctx.moveTo(35, footerY - 15); ctx.lineTo(width - 35, footerY - 15); ctx.stroke();

      ctx.fillStyle = '#9e9e9e';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน | Student Council Portal SWSC69', 35, footerY + 10);
      ctx.textAlign = 'right';
      ctx.fillText('บิลนี้เป็นความลับใช้แจ้งทวงภายในกลุ่มปฏิบัติการสภาฯ เท่านั้น', width - 35, footerY + 10);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `unpaid_fines_summary_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    };
  };

  // ส่งออกใบสรุปค่าปรับรายบุคคลเป็นภาพ PNG สำหรับส่งแชท / LINE
  const exportMemberFinesPNG = (member) => {
    if (!member) return;
    const mFines = getUserFines(member);
    const totalAmount = mFines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const unpaidAmount = mFines.filter(f => f.paymentStatus !== 'paid' && !f.paid).reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const paidAmount = totalAmount - unpaidAmount;
    const dept = DEPARTMENTS.find(d => d.id === (member.dept_id || member.deptId));

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const width = 800;
      const headerHeight = 220;
      const profileCardHeight = 110;
      const tableHeaderHeight = 45;
      const rowHeight = 52;
      const footerHeight = 90;
      const totalRows = mFines.length === 0 ? 1 : mFines.length;
      const height = headerHeight + profileCardHeight + tableHeaderHeight + (totalRows * rowHeight) + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // พื้นหลังสีขาว
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // เฮดเดอร์แบบ Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      // ลวดลายวงกลมประดับ
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath(); ctx.arc(width - 40, 30, 130, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(40, headerHeight, 90, 0, Math.PI * 2); ctx.fill();

      // ตราสัญลักษณ์สภา
      try {
        ctx.drawImage(logoImg, 35, 30, 120, 120);
      } catch (err) {
        console.warn('Canvas logo draw error:', err);
      }

      // ข้อความส่วนหัว
      ctx.textAlign = 'left';
      ctx.font = 'bold 20px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('สภานักเรียนโรงเรียน (ฝ่ายการเงินและพัสดุ)', 175, 70);
      ctx.font = 'normal 13px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText('ใบแจ้งยอดสรุปประวัติค่าปรับวินัยสภานักเรียน (รายบุคคล)', 175, 96);

      // ชื่อสมาชิก
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText(`สรุปข้อมูล: ${member.name} (${member.nickname ? `"${member.nickname}"` : '-'})`, 35, 190);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'right';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.fillText(`ข้อมูล ณ: ${dateStr} น.`, width - 35, 190);

      // การ์ดข้อมูลส่วนตัว & สถิติ
      const profileY = headerHeight + 15;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      drawRoundRect(35, profileY, width - 70, 80, 10);
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // ข้อมูลสมาชิกฝั่งซ้าย
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      ctx.fillText(`ฝ่าย: ${dept ? dept.name : 'สภานักเรียน'}  |  ตำแหน่ง: ${member.position || 'กรรมการสภานักเรียน'}`, 55, profileY + 28);
      ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`บันทึกความผิดทั้งหมด: ${mFines.length} รายการ`, 55, profileY + 54);

      // 3 Stat Pills ฝั่งขวา
      const statColW = 120;
      const statsStartX = width - 35 - (statColW * 3) - 20;

      // Stat 1: ยอดรวม
      drawRoundRect(statsStartX, profileY + 12, statColW, 56, 8);
      ctx.fillStyle = '#eff6ff';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.fillText('ยอดปรับรวม', statsStartX + statColW / 2, profileY + 30);
      ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
      ctx.fillText(`${totalAmount.toLocaleString()} บ.`, statsStartX + statColW / 2, profileY + 52);

      // Stat 2: ชำระแล้ว
      drawRoundRect(statsStartX + statColW + 10, profileY + 12, statColW, 56, 8);
      ctx.fillStyle = '#f0fdf4';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#16a34a';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.fillText('ชำระแล้ว', statsStartX + statColW + 10 + statColW / 2, profileY + 30);
      ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
      ctx.fillText(`${paidAmount.toLocaleString()} บ.`, statsStartX + statColW + 10 + statColW / 2, profileY + 52);

      // Stat 3: ค้างชำระ
      drawRoundRect(statsStartX + (statColW * 2) + 20, profileY + 12, statColW, 56, 8);
      ctx.fillStyle = unpaidAmount > 0 ? '#fef2f2' : '#f8fafc';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = unpaidAmount > 0 ? '#dc2626' : '#64748b';
      ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
      ctx.fillText('ค้างชำระ', statsStartX + (statColW * 2) + 20 + statColW / 2, profileY + 30);
      ctx.font = 'bold 16px "Noto Sans Thai", sans-serif';
      ctx.fillText(`${unpaidAmount.toLocaleString()} บ.`, statsStartX + (statColW * 2) + 20 + statColW / 2, profileY + 52);

      // หัวตาราง
      const tableY = profileY + 98;
      drawRoundRect(35, tableY, width - 70, tableHeaderHeight, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('#', 55, tableY + tableHeaderHeight / 2 + 4);
      ctx.fillText('วันที่', 95, tableY + tableHeaderHeight / 2 + 4);
      ctx.fillText('ข้อหาความผิดวินัยสภาฯ', 220, tableY + tableHeaderHeight / 2 + 4);
      ctx.textAlign = 'right';
      ctx.fillText('ยอดปรับ', 580, tableY + tableHeaderHeight / 2 + 4);
      ctx.textAlign = 'center';
      ctx.fillText('สถานะ', 710, tableY + tableHeaderHeight / 2 + 4);

      let currentY = tableY + tableHeaderHeight;

      if (mFines.length === 0) {
        ctx.fillStyle = '#16a34a';
        ctx.font = 'bold 14px "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 ยอดเยี่ยมมาก! สมาชิกท่านนี้ไม่มีประวัติการโดนปรับวินัยสภาฯ เลย', width / 2, currentY + rowHeight / 2 + 5);
      } else {
        mFines.forEach((item, idx) => {
          if (idx % 2 === 1) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(35, currentY, width - 70, rowHeight);
          }

          ctx.strokeStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.moveTo(35, currentY + rowHeight);
          ctx.lineTo(width - 35, currentY + rowHeight);
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'left';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(`${idx + 1}`, 55, currentY + rowHeight / 2 + 4);

          ctx.fillStyle = '#334155';
          ctx.fillText(item.date || '-', 95, currentY + rowHeight / 2 + 4);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
          let displayViolation = item.violation || '';
          if (displayViolation && ctx.measureText(displayViolation).width > 320) {
            while (displayViolation.length > 0 && ctx.measureText(displayViolation + '...').width > 320) {
              displayViolation = displayViolation.slice(0, -1);
            }
            displayViolation += '...';
          }
          ctx.fillText(displayViolation, 220, currentY + rowHeight / 2 + 4);

          ctx.textAlign = 'right';
          ctx.fillStyle = item.paymentStatus === 'paid' ? '#16a34a' : '#dc2626';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.fillText(`${item.amount} บ.`, 580, currentY + rowHeight / 2 + 4);

          ctx.textAlign = 'center';
          const isPaid = item.paymentStatus === 'paid';
          const isSlip = item.paymentStatus === 'slip_uploaded';
          ctx.fillStyle = isPaid ? '#dcfce7' : (isSlip ? '#fef3c7' : '#fee2e2');
          drawRoundRect(670, currentY + rowHeight / 2 - 12, 80, 24, 12);
          ctx.fill();

          ctx.fillStyle = isPaid ? '#16a34a' : (isSlip ? '#d97706' : '#dc2626');
          ctx.font = 'bold 10px "Noto Sans Thai", sans-serif';
          ctx.fillText(isPaid ? '✓ ชำระแล้ว' : (isSlip ? '⏳ รอตรวจ' : '✕ ยังไม่ชำระ'), 710, currentY + rowHeight / 2 + 4);

          currentY += rowHeight;
        });
      }

      const footerY = height - 50;
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath(); ctx.moveTo(35, footerY - 15); ctx.lineTo(width - 35, footerY - 15); ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน | ติดต่อชำระเงินที่ฝ่ายการเงิน หรือโอนผ่านระบบสภาฯ', 35, footerY + 10);
      ctx.textAlign = 'right';
      ctx.fillText('ใช้สำหรับแจ้งเตือนและติดตามการชำระเงินภายในเท่านั้น', width - 35, footerY + 10);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `fine_summary_${member.nickname || member.name}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    };
  };
  
  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── PAGE HEADER ── */}
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16, marginBottom:24 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
            }}>
              💰
            </div>
            <div>
              <span style={{ fontSize: 22, fontWeight: 800 }}>ฝ่ายการเงินและพัสดุ</span>
              <div className="page-subtitle" style={{ fontSize: 13, marginTop: 2 }}>
                ระบบเบิกจ่าย บัญชีสภานักเรียน การเก็บเงินสมาชิก และตรวจสอบสลิปค่าปรับ
              </div>
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={()=>{ setForm(initForm); setModal(true); }} style={{ display:'inline-flex', alignItems:'center', gap:8, fontSize:13, borderRadius: 10 }}>
          <Plus size={16}/> <span>ยื่นคำขอเบิกเงิน</span>
        </button>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="stats-row" style={{ marginBottom:24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label:'คำขอทั้งหมด', value: requests.length, bg:'#eff6ff', color:'#2563eb', icon:'📋' },
          { label:'รออนุมัติ', value: requests.filter(r=>r.status==='pending').length, bg:'#fefce8', color:'#ca8a04', icon:'⏳' },
          { label:'อนุมัติแล้ว', value: requests.filter(r=>r.status==='approved').length, bg:'#f0fdf4', color:'#16a34a', icon:'✅' },
          { label:'ไม่อนุมัติ', value: requests.filter(r=>r.status==='rejected').length, bg:'#fef2f2', color:'#dc2626', icon:'❌' },
        ].map(s => (
          <div key={s.label} className="stat-box" style={{ padding: '16px 20px', borderRadius: 16 }}>
            <div className="stat-icon-box" style={{ background: s.bg, color: s.color, width: 44, height: 44, fontSize: 20, borderRadius: 12 }}>
              {s.icon}
            </div>
            <div>
              <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
              <div className="stat-label" style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button className={`tab-btn${tab==='requests'?' active':''}`} onClick={()=>setTab('requests')}>📋 คำขอเบิกเงิน</button>
        <button className={`tab-btn${tab==='fees'?' active':''}`} onClick={()=>setTab('fees')}>💰 เก็บเงินสมาชิก</button>
        <button className={`tab-btn${tab==='fines'?' active':''}`} onClick={()=>setTab('fines')}>
          💸 ค่าปรับ 
          {dfines.filter(f=>f.paymentStatus==='slip_uploaded').length > 0 && 
            <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 10, padding: '2px 8px' }}>
              {dfines.filter(f=>f.paymentStatus==='slip_uploaded').length}
            </span>
          }
        </button>
      </div>

      {tab === 'requests' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">รายการคำขอเบิกเงิน</span>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ position:'relative' }}>
                <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#bdbdbd' }}/>
                <input className="input-field" placeholder="ค้นหา..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:28, padding:'6px 8px 6px 28px', fontSize:12, width:180 }}/>
              </div>
              <select className="select-field" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:140, padding:'6px 8px', fontSize:12 }}>
                <option value="all">ทุกสถานะ</option>
                <option value="pending">รออนุมัติ</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ไม่อนุมัติ</option>
              </select>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr><th>#</th><th>รายการ</th><th>หมวด</th><th>จำนวน</th><th>ผู้ขอ</th><th>ฝ่าย</th><th>วันที่</th><th>สถานะ</th>{isFinance && <th>ดำเนินการ</th>}</tr>
              </thead>
              <tbody>
                {filtered.map((r,i) => {
                  const dept = r.deptId ? DEPARTMENTS.find(d=>d.id===r.deptId) : null;
                  const s = STATUS_STYLE[r.status];
                  return (
                    <tr key={r.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.title}</div>
                        {r.note && <div style={{ fontSize:11, color:'#e53935' }}>หมายเหตุ: {r.note}</div>}
                      </td>
                      <td><span className="badge badge-gray">{r.category}</span></td>
                      <td style={{ fontWeight:700, color: r.status==='approved'?'#2e7d32': r.status==='rejected'?'#9e9e9e':'#212121' }}>
                        {r.amount.toLocaleString()} บาท
                      </td>
                      <td style={{ fontSize:13 }}>{r.requester}</td>
                      <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                      <td style={{ fontSize:12 }}>{r.date}</td>
                      <td>
                        <span className={`badge ${s.badge}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          {s.icon} {s.label}
                        </span>
                        {r.approvedBy && <div style={{ fontSize:10, color:'#9e9e9e', marginTop:2 }}>โดย: {r.approvedBy}</div>}
                      </td>
                      {isFinance && (
                        <td>
                          {r.status === 'pending' && (
                            <div style={{ display:'flex', gap:5 }}>
                              <button onClick={()=>approve(r.id)} className="btn btn-success btn-sm" style={{ fontSize:11 }}>✓ อนุมัติ</button>
                              <button onClick={()=>setRejectModal(r.id)} className="btn btn-danger btn-sm" style={{ fontSize:11 }}>✕ ไม่อนุมัติ</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length===0 && <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ไม่พบคำขอ</div>}
        </div>
      )}

      {/* Fee Collection Tab */}
      {tab === 'fees' && (
        <div className="card">
          <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap: 'wrap', gap: 10 }}>
            <span className="card-title">💰 รายการเก็บเงินสมาชิก</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {fees.length > 0 && (
                <>
                  <button
                    className="btn btn-gray btn-sm"
                    onClick={collapseAllFees}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ChevronUp size={14} /> ย่อทั้งหมด
                  </button>
                  <button
                    className="btn btn-gray btn-sm"
                    onClick={expandAllFees}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ChevronDown size={14} /> ขยายทั้งหมด
                  </button>
                </>
              )}
              {isFinance && (
                <button className="btn btn-primary" onClick={() => { setFeeForm({ title:'', amount:'', date:'' }); setFeeModal(true); }}>
                  <Plus size={14}/> สร้างรายการเก็บเงิน
                </button>
              )}
            </div>
          </div>

          {fees.map((fee, idx) => {
            const members = usersList.filter(u => u.role !== 'admin');
            const paidCount = members.filter(u => {
              const p = fee.payments?.[u.id];
              if (!p) return false;
              if (typeof p === 'object') return p.paid === true;
              return p === true;
            }).length;
            const totalCollected = paidCount * fee.amount;
            const totalExpected = members.length * fee.amount;
            const isExpanded = expandedFeeIds[fee.id] ?? (idx === 0);

            return (
              <div key={fee.id} style={{ borderBottom:'1px solid #f0f0f0', padding:'16px 20px', transition: 'background 0.2s' }}>
                <div 
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleFeeExpand(fee.id)}
                >
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color: '#00838f', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{fee.title}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: isExpanded ? '#e0f7fa' : '#f1f5f9', color: isExpanded ? '#00838f' : '#64748b', fontWeight: 600 }}>
                        {isExpanded ? 'ขยายอยู่' : 'ย่อเก็บอยู่'}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'#9e9e9e', marginTop: 2 }}>จำนวน: {fee.amount} บาท/คน · วันที่: {fee.date}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2e7d32' }}>เก็บแล้ว {totalCollected.toLocaleString()} / {totalExpected.toLocaleString()} บาท</div>
                      <div style={{ fontSize:12, color:'#757575' }}>{paidCount}/{members.length} คน</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFeeExpand(fee.id); }}
                      className="btn btn-gray btn-sm"
                      style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      title={isExpanded ? 'ย่อตารางสมาชิก' : 'ขยายตารางสมาชิก'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ background:'#f0f0f0', borderRadius:99, height:6, overflow:'hidden', marginTop: 10, marginBottom: isExpanded ? 12 : 0 }}>
                  <div style={{ height:'100%', width:`${members.length > 0 ? (paidCount/members.length)*100 : 0}%`, background:'#00bcd4', borderRadius:99, transition:'width 0.4s' }}/>
                </div>

                {/* Collapsible Member Table & Action Buttons */}
                {isExpanded && (
                  <div style={{ marginTop: 14 }}>
                    {isFinance && (
                      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => { setCollectModal(fee.id); setCollectMode('individual'); setCollectUserId(''); }}>
                          👤 เก็บรายบุคคล
                        </button>
                        <button className="btn btn-success btn-sm" onClick={() => { setCollectModal(fee.id); setCollectMode('all'); }}>
                          👥 เก็บทั้งหมด
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => exportFeeSummaryPNG(fee)} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          <Camera size={12} /> 📸 สรุปภาพรวม (PNG)
                        </button>
                      </div>
                    )}

                    <div style={{ overflowX:'auto' }}>
                      <table className="simple-table">
                        <thead>
                          <tr><th>#</th><th>สมาชิก</th><th>ฝ่าย</th><th>สถานะ</th><th>หลักฐาน</th></tr>
                        </thead>
                        <tbody>
                          {members.map((u, i) => {
                            const dept = DEPARTMENTS.find(d => d.id === u.deptId);
                            const paymentInfo = fee.payments?.[u.id];
                            const paid = typeof paymentInfo === 'object' ? paymentInfo.paid : !!paymentInfo;
                            const slip = typeof paymentInfo === 'object' ? paymentInfo.slip : null;
                            return (
                              <tr key={u.id}>
                                <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                                <td>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div className="avatar" style={{ width:28, height:28, fontSize:12, background: (u.avatarColor || '#00bcd4')+'22', color: u.avatarColor || '#00bcd4' }}>{u.avatar || u.nickname?.slice(0,1)}</div>
                                    <div>
                                      <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                                      <div style={{ fontSize:11, color:'#9e9e9e' }}>"{u.nickname}"</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{dept ? <span className="badge" style={{ background:dept.bg, color:dept.color, borderRadius:3 }}>{dept.short}</span> : '–'}</td>
                                <td style={{ width:120 }}>
                                  {isFinance ? (
                                    <select
                                      value={paid ? 'paid' : 'unpaid'}
                                      onChange={async (e) => {
                                        const val = e.target.value === 'paid';
                                        try {
                                          let nextPayments = { ...(fee.payments || {}) };
                                          if (val) {
                                            if (typeof nextPayments[u.id] === 'object') {
                                              nextPayments[u.id] = { ...nextPayments[u.id], paid: true, status: 'paid' };
                                            } else {
                                              nextPayments[u.id] = true;
                                            }
                                          } else {
                                            delete nextPayments[u.id];
                                          }
                                          const { error } = await supabase
                                            .from('finance_fees')
                                            .update({ payments: nextPayments })
                                            .eq('id', fee.id);
                                          if (error) throw error;
                                          setFees(prev => prev.map(f => f.id === fee.id ? { ...f, payments: nextPayments } : f));
                                        } catch (err) {
                                          console.error('Error updating fee payment:', err);
                                          alert('เกิดข้อผิดพลาดในการบันทึกการชำระเงิน: ' + err.message);
                                        }
                                      }}
                                      style={{
                                        background: paid ? '#e8f5e9' : '#ffebee',
                                        color: paid ? '#2e7d32' : '#c62828',
                                        border: `1px solid ${paid ? '#2e7d32' : '#c62828'}44`,
                                        padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:600, outline:'none', cursor:'pointer', width:'100%'
                                      }}
                                    >
                                      <option value="unpaid">ยังไม่จ่าย</option>
                                      <option value="paid">จ่ายแล้ว</option>
                                    </select>
                                  ) : (
                                    <span className="badge" style={{ background: paid ? '#e8f5e9' : '#ffebee', color: paid ? '#2e7d32' : '#c62828' }}>
                                      {paid ? '✅ จ่ายแล้ว' : '❌ ยังไม่จ่าย'}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {slip ? (
                                    <button
                                      className="btn btn-gray btn-sm"
                                      style={{ fontSize:11, padding:'4px 8px', display:'inline-flex', alignItems:'center', gap:4 }}
                                      onClick={() => setFeeSlipModal({ userName: u.name, title: fee.title, amount: fee.amount, date: fee.date, slip })}
                                    >
                                      <Eye size={12}/> ดูสลิป
                                    </button>
                                  ) : (
                                    <span style={{ color:'#bdbdbd', fontSize:11 }}>-</span>
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
              </div>
            );
          })}
          {fees.length === 0 && <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ยังไม่มีรายการเก็บเงิน</div>}
        </div>
      )}

      {/* Collect Modal */}
      {collectModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setCollectModal(null)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>{collectMode === 'all' ? '👥 เก็บเงินทั้งหมด' : '👤 เก็บเงินรายบุคคล'}</span>
              <button onClick={() => setCollectModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {collectMode === 'individual' && (
                <div>
                  <label className="form-label">เลือกสมาชิก *</label>
                  <select className="select-field" value={collectUserId} onChange={e => setCollectUserId(e.target.value)}>
                    <option value="">– เลือกสมาชิก –</option>
                    {usersList.filter(u => u.role !== 'admin').map(u => {
                      const fee = fees.find(f => f.id === collectModal);
                      const paid = fee?.payments && fee.payments[u.id];
                      return <option key={u.id} value={u.id}>{u.name} ({u.nickname}) {paid ? '✅' : ''}</option>;
                    })}
                  </select>
                </div>
              )}
              {collectMode === 'all' && (
                <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'10px 14px', fontSize:13 }}>
                  ⚠️ จะเปลี่ยนสถานะสมาชิก<strong>ทั้งหมด</strong>เป็น "จ่ายแล้ว"
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setCollectModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  const targetFee = fees.find(f => f.id === collectModal);
                  if (!targetFee) return;

                  let nextPayments = { ...(targetFee.payments || {}) };

                  if (collectMode === 'all') {
                    usersList.filter(u => u.role !== 'admin').forEach(u => {
                      nextPayments[u.id] = true;
                    });
                  } else if (collectUserId) {
                    nextPayments[collectUserId] = true;
                  }

                  const { error } = await supabase
                    .from('finance_fees')
                    .update({ payments: nextPayments })
                    .eq('id', collectModal);
                  if (error) throw error;

                  setFees(prev => prev.map(f => f.id === collectModal ? { ...f, payments: nextPayments } : f));
                } catch (err) {
                  console.error('Error confirming fee payments:', err);
                  alert('เกิดข้อผิดพลาดในการบันทึกการชำระเงิน: ' + err.message);
                }
                setCollectModal(null);
              }} disabled={collectMode === 'individual' && !collectUserId}>
                <Save size={14}/> ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Fee Modal */}
      {feeModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setFeeModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>💰 สร้างรายการเก็บเงินใหม่</span>
              <button onClick={() => setFeeModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">ชื่อรายการ *</label>
                <input className="input-field" placeholder="เช่น ค่าสมาชิกสภา เดือน มิ.ย. 68" value={feeForm.title} onChange={e => setFeeForm(p => ({...p, title:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="form-label">จำนวนเงินต่อคน (บาท) *</label>
                  <input className="input-field" type="number" min="0" placeholder="0" value={feeForm.amount} onChange={e => setFeeForm(p => ({...p, amount:e.target.value}))} />
                </div>
                <div>
                  <label className="form-label">วันที่เก็บ *</label>
                  <input className="input-field" type="date" value={feeForm.date} onChange={e => setFeeForm(p => ({...p, date:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setFeeModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={async () => {
                if (!feeForm.title || !feeForm.amount) return;
                const newFee = {
                  title: feeForm.title,
                  amount: parseInt(feeForm.amount),
                  date: feeForm.date || new Date().toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }),
                  payments: {},
                };

                try {
                  const { data, error } = await supabase
                    .from('finance_fees')
                    .insert(newFee)
                    .select();
                  if (error) throw error;
                  if (data && data[0]) {
                    setFees(prev => [data[0], ...prev]);
                    
                    // Send Discord embed notification
                    const embedTitle = `💰 ประกาศเรียกเก็บเงินสภานักเรียน`;
                    const embedDesc = `ฝ่ายการเงินได้ออกรายการเรียกเก็บเงินใหม่ในระบบ`;
                    const fields = [
                      { name: '📋 รายการเรียกเก็บ', value: data[0].title, inline: true },
                      { name: '💵 ยอดเงินเรียกเก็บ', value: `${data[0].amount} บาท`, inline: true },
                      { name: '📅 กำหนดส่ง', value: data[0].date, inline: true },
                      { name: '💡 คำแนะนำ', value: 'กรุณาเข้าระบบ SWSC69 เพื่อสแกน QR Code ชำระเงินด้วย PromptPay และอัปโหลดสลิป', inline: false }
                    ];
                    sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'finance'); // สีน้ำเงินสำหรับฝ่ายการเงิน
                  }
                } catch (err) {
                  console.error('Error creating fee payment collection:', err);
                  alert('เกิดข้อผิดพลาดในการสร้างรายการเก็บเงิน: ' + err.message);
                }
                setFeeModal(false);
              }} disabled={!feeForm.title || !feeForm.amount}>
                <Save size={14}/> สร้างรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'fines' && (() => {
        const councilMembers = usersList.filter(u => u.role !== 'admin');
        const memberSummaries = councilMembers.map(u => {
          const mFines = getUserFines(u);
          const count = mFines.length;
          const total = mFines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
          const unpaid = mFines.filter(f => f.paymentStatus !== 'paid' && !f.paid).reduce((sum, f) => sum + Number(f.amount || 0), 0);
          const paid = total - unpaid;
          const pendingSlip = mFines.filter(f => f.paymentStatus === 'slip_uploaded').length;
          return {
            ...u,
            fines: mFines,
            count,
            total,
            unpaid,
            paid,
            pendingSlip,
          };
        });

        // เรียงลำดับสำหรับมุมมองสรุปรายบุคคล (ค้างชำระมากสุดก่อน -> ยอดรวม -> ชื่อเล่น)
        const sortedMembers = [...memberSummaries].sort((a, b) => {
          if (b.unpaid !== a.unpaid) return b.unpaid - a.unpaid;
          if (b.total !== a.total) return b.total - a.total;
          return (a.nickname || '').localeCompare(b.nickname || '', 'th');
        });

        const filteredMembers = sortedMembers.filter(m => {
          const s = memberFineSearch.toLowerCase().trim();
          const matchSearch = !s || 
            (m.name || '').toLowerCase().includes(s) || 
            (m.nickname || '').toLowerCase().includes(s);
          if (!matchSearch) return false;

          if (memberFineFilter === 'unpaid') return m.unpaid > 0;
          if (memberFineFilter === 'paid') return m.count > 0 && m.unpaid === 0;
          if (memberFineFilter === 'zero') return m.count === 0;
          return true; // 'all'
        });

        // การคำนวณสถิติภาพรวม
        const totalFineSum = dfines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
        const totalUnpaidSum = dfines.filter(f => f.paymentStatus !== 'paid' && !f.paid).reduce((sum, f) => sum + Number(f.amount || 0), 0);
        const unpaidMemberCount = memberSummaries.filter(m => m.unpaid > 0).length;

        // การกรองสำหรับมุมมองรายการทั้งหมด
        const filteredDfines = dfines.filter(f => {
          const s = fineListSearch.toLowerCase().trim();
          if (!s) return true;
          return (f.userName || '').toLowerCase().includes(s) || 
                 (f.nickname || '').toLowerCase().includes(s) || 
                 (f.violation || '').toLowerCase().includes(s);
        });

        return (
          <div className="card">
            {/* ส่วนหัวพร้อมปุ่มสลับมุมมอง Segmented Control */}
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="card-title" style={{ margin: 0 }}>💸 การจัดการค่าปรับวินัย</span>
                <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 8, gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setFineSubView('list')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: fineSubView === 'list' ? 700 : 500,
                      background: fineSubView === 'list' ? '#00bcd4' : 'transparent',
                      color: fineSubView === 'list' ? '#ffffff' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease',
                      boxShadow: fineSubView === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <FileText size={14} /> 📋 รายการค่าปรับทั้งหมด ({dfines.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFineSubView('summary')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: fineSubView === 'summary' ? 700 : 500,
                      background: fineSubView === 'summary' ? '#00bcd4' : 'transparent',
                      color: fineSubView === 'summary' ? '#ffffff' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease',
                      boxShadow: fineSubView === 'summary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <Users size={14} /> 📊 สรุปรายบุคคล ({councilMembers.length})
                  </button>
                </div>
              </div>

              {/* ปุ่มดำเนินการฝั่งขวา */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={exportAllUnpaidFinesPNG} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Camera size={13} /> 📸 สรุปยอดค้างชำระสภาฯ (PNG)
                </button>
                <div style={{ fontSize: 12, color: '#757575', padding: '4px 8px', background: '#f5f5f5', borderRadius: 6 }}>
                  รอตรวจสลิป: <strong style={{ color: '#f57f17' }}>{dfines.filter(f=>f.paymentStatus==='slip_uploaded').length}</strong> รายการ
                </div>
              </div>
            </div>

            {/* มุมมองที่ 1: รายการค่าปรับทั้งหมดตามลำดับเวลา (Default) */}
            {fineSubView === 'list' && (
              <div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ position: 'relative', minWidth: 260, maxWidth: 360, flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      className="input-field"
                      placeholder="ค้นหาชื่อสมาชิก หรือข้อหาความผิด..."
                      value={fineListSearch}
                      onChange={e => setFineListSearch(e.target.value)}
                      style={{ paddingLeft: 32, fontSize: 12, height: 34 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    แสดงผล {filteredDfines.length} จาก {dfines.length} รายการ
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead>
                      <tr><th>#</th><th>สมาชิก</th><th>ความผิด</th><th>ยอด</th><th>วันที่</th><th>สถานะ</th><th>สลิป</th>{isFinance && <th>ดำเนินการ</th>}</tr>
                    </thead>
                    <tbody>
                      {filteredDfines.map((f, i) => (
                        <tr key={f.id}>
                          <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{f.userName}</div>
                            <div style={{ fontSize: 11, color: '#9e9e9e' }}>'{f.nickname}'</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{f.violation}</td>
                          <td><span className={`badge ${f.paymentStatus === 'paid' ? 'badge-green' : 'badge-red'}`}>{f.amount} บาท</span></td>
                          <td style={{ fontSize: 12 }}>{f.date}</td>
                          <td>
                            {f.paymentStatus === 'paid' && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                            {f.paymentStatus === 'slip_uploaded' && <span className="badge badge-yellow">⏳ รอตรวจสลิป</span>}
                            {f.paymentStatus === 'unpaid' && <span className="badge badge-red">ยังไม่ชำระ</span>}
                          </td>
                          <td>
                            {f.paymentStatus === 'slip_uploaded' || f.paymentStatus === 'paid'
                              ? <button className="btn btn-gray btn-sm" style={{ fontSize: 11 }} onClick={() => viewSlip(f)}><Eye size={12} /> ดูสลิป</button>
                              : <span style={{ fontSize: 11, color: '#bdbdbd' }}>-</span>}
                          </td>
                          {isFinance && (
                            <td>
                              {f.paymentStatus === 'slip_uploaded' && (
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <button className="btn btn-success btn-sm" style={{ fontSize: 11 }} onClick={() => confirmFinePaid(f)}>✓ ยืนยัน</button>
                                  <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => rejectFineSlip(f)}>✕ ปฏิเสธ</button>
                                </div>
                              )}
                              {f.paymentStatus === 'unpaid' && (
                                <button className="btn btn-gray btn-sm" style={{ fontSize: 11 }} onClick={() => markFineCash(f.id)}>💵 เงินสด</button>
                              )}
                              {f.paymentStatus === 'paid' && (
                                <button className="btn btn-gray btn-sm" style={{ fontSize: 11, color: '#d32f2f' }} onClick={() => revertFineUnpaid(f)}>💵 ยังไม่ชำระ</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredDfines.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#9e9e9e' }}>
                    {fineListSearch ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ไม่มีรายการค่าปรับ'}
                  </div>
                )}
              </div>
            )}

            {/* มุมมองที่ 2: สรุปยอดค่าปรับรายบุคคล (Per-Member Summary) */}
            {fineSubView === 'summary' && (
              <div>
                {/* กล่องสรุปสถิติภาพรวม */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>👥 สมาชิกสภาทั้งหมด</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{councilMembers.length} คน</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>รวมทุกฝ่ายงานในสภาฯ</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>⚠️ ผู้ที่มียอดค้างชำระ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: unpaidMemberCount > 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>{unpaidMemberCount} คน</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{unpaidMemberCount === 0 ? 'ชำระครบทุกคนแล้ว' : 'ยังมียอดค้างชำระ'}</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>💸 ยอดปรับรวมทั้งหมด</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0284c7', marginTop: 4 }}>{totalFineSum.toLocaleString()} บาท</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{dfines.length} รายการที่บันทึก</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #fee2e2' }}>
                    <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>🚨 ยอดค้างชำระรวม</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>{totalUnpaidSum.toLocaleString()} บาท</div>
                    <div style={{ fontSize: 11, color: '#dc2626' }}>ชำระแล้ว {(totalFineSum - totalUnpaidSum).toLocaleString()} บาท</div>
                  </div>
                </div>

                {/* แถบเครื่องมือค้นหาและฟิลเตอร์ */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ position: 'relative', minWidth: 260, maxWidth: 360, flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      className="input-field"
                      placeholder="ค้นหาชื่อ หรือชื่อเล่นสมาชิก..."
                      value={memberFineSearch}
                      onChange={e => setMemberFineSearch(e.target.value)}
                      style={{ paddingLeft: 32, fontSize: 12, height: 34 }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${memberFineFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setMemberFineFilter('all')}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 16 }}
                    >
                      ทั้งหมด ({memberSummaries.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${memberFineFilter === 'unpaid' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setMemberFineFilter('unpaid')}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 16, color: memberFineFilter === 'unpaid' ? '#fff' : '#dc2626' }}
                    >
                      ⚠️ ค้างชำระ ({memberSummaries.filter(m => m.unpaid > 0).length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${memberFineFilter === 'paid' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setMemberFineFilter('paid')}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 16, color: memberFineFilter === 'paid' ? '#fff' : '#16a34a' }}
                    >
                      ✅ ชำระครบแล้ว ({memberSummaries.filter(m => m.count > 0 && m.unpaid === 0).length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${memberFineFilter === 'zero' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setMemberFineFilter('zero')}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 16, color: memberFineFilter === 'zero' ? '#fff' : '#64748b' }}
                    >
                      ✨ ไม่มีค่าปรับ ({memberSummaries.filter(m => m.count === 0).length})
                    </button>
                  </div>
                </div>

                {/* ตารางสรุปรายบุคคล (แสดงสมาชิกสภาทุกคน) */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>สมาชิก</th>
                        <th>ฝ่ายงาน</th>
                        <th style={{ textAlign: 'center' }}>ประวัติโดนปรับ</th>
                        <th style={{ textAlign: 'right' }}>ยอดรวม</th>
                        <th style={{ textAlign: 'right' }}>ค้างชำระ</th>
                        <th style={{ textAlign: 'right' }}>ชำระแล้ว</th>
                        <th style={{ textAlign: 'center' }}>สถานะสลิป</th>
                        <th style={{ textAlign: 'center' }}>การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m, i) => {
                        const dept = DEPARTMENTS.find(d => d.id === (m.dept_id || m.deptId));
                        const avatarBg = (m.avatar_color || m.avatarColor || '#00bcd4') + '22';
                        const avatarText = m.avatar_color || m.avatarColor || '#00bcd4';

                        return (
                          <tr key={m.id} style={{ background: m.unpaid > 0 ? '#fffbfb' : 'transparent' }}>
                            <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                  className="avatar"
                                  style={{
                                    width: 32,
                                    height: 32,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: avatarBg,
                                    color: avatarText,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  {m.avatar || m.nickname?.slice(0, 1) || m.name?.slice(0, 1) || '?'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                                    {m.name}
                                    {m.nickname && <span style={{ color: '#0284c7', marginLeft: 6 }}>"{m.nickname}"</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                    {m.position || 'กรรมการสภานักเรียน'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              {dept ? (
                                <span className="badge" style={{ background: dept.bg, color: dept.color, fontSize: 11, fontWeight: 600 }}>
                                  {dept.short}
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: 12 }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {m.count > 0 ? (
                                <span style={{ fontWeight: 600, fontSize: 12, color: '#334155' }}>{m.count} ครั้ง</span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 11 }}>0 ครั้ง</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: m.total > 0 ? '#0f172a' : '#94a3b8' }}>
                              {m.total > 0 ? `${m.total.toLocaleString()} บ.` : '0 บ.'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {m.unpaid > 0 ? (
                                <span className="badge badge-red" style={{ fontWeight: 700 }}>
                                  {m.unpaid.toLocaleString()} บาท
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {m.paid > 0 ? (
                                <span className="badge badge-green">
                                  {m.paid.toLocaleString()} บาท
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {m.pendingSlip > 0 ? (
                                <span className="badge badge-yellow" style={{ fontSize: 10 }}>
                                  ⏳ รอตรวจ {m.pendingSlip}
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: 11 }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setMemberFineModal(m)}
                                style={{
                                  fontSize: 11,
                                  padding: '4px 10px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: m.unpaid > 0 ? '#dc2626' : '#0284c7',
                                  borderColor: m.unpaid > 0 ? '#fca5a5' : '#bae6fd'
                                }}
                              >
                                <Eye size={12} /> ดูประวัติ
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredMembers.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    ไม่พบรายชื่อสมาชิกที่ตรงกับเงื่อนไขการค้นหา
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Member Fine Details Modal (ป๊อปอัปดูประวัติค่าปรับเฉพาะบุคคล) */}
      {memberFineModal && (() => {
        const memberFines = getUserFines(memberFineModal);
        const total = memberFines.reduce((s, f) => s + Number(f.amount || 0), 0);
        const unpaid = memberFines.filter(f => f.paymentStatus !== 'paid' && !f.paid).reduce((s, f) => s + Number(f.amount || 0), 0);
        const paid = total - unpaid;
        const dept = DEPARTMENTS.find(d => d.id === (memberFineModal.dept_id || memberFineModal.deptId));
        const avatarBg = (memberFineModal.avatar_color || memberFineModal.avatarColor || '#00bcd4') + '22';
        const avatarText = memberFineModal.avatar_color || memberFineModal.avatarColor || '#00bcd4';

        return (
          <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={e => e.target === e.currentTarget && setMemberFineModal(null)}>
            <div className="modal-box" style={{ maxWidth: 760, width: '95%' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    className="avatar"
                    style={{
                      width: 40,
                      height: 40,
                      fontSize: 16,
                      fontWeight: 700,
                      background: avatarBg,
                      color: avatarText,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {memberFineModal.avatar || memberFineModal.nickname?.slice(0, 1) || memberFineModal.name?.slice(0, 1) || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                      {memberFineModal.name} {memberFineModal.nickname && <span style={{ color: '#0284c7' }}>"{memberFineModal.nickname}"</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {dept && <span className="badge" style={{ background: dept.bg, color: dept.color, fontSize: 10 }}>{dept.name}</span>}
                      <span>{memberFineModal.position || 'กรรมการสภานักเรียน'}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setMemberFineModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* การ์ดสถิติย่อย 3 รายการ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ยอดปรับรวมสะสม</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0284c7', marginTop: 2 }}>{total.toLocaleString()} บาท</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>บันทึก {memberFines.length} ครั้ง</div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '12px 14px', borderRadius: 8, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>ชำระแล้ว</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>{paid.toLocaleString()} บาท</div>
                    <div style={{ fontSize: 11, color: '#86efac' }}>เรียบร้อยแล้ว</div>
                  </div>
                  <div style={{ background: unpaid > 0 ? '#fef2f2' : '#f8fafc', padding: '12px 14px', borderRadius: 8, border: unpaid > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: unpaid > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>ยอดค้างชำระ</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: unpaid > 0 ? '#b91c1c' : '#64748b', marginTop: 2 }}>{unpaid.toLocaleString()} บาท</div>
                    <div style={{ fontSize: 11, color: unpaid > 0 ? '#f87171' : '#94a3b8' }}>{unpaid > 0 ? 'ต้องชำระ' : 'ไม่มีค้างชำระ 🎉'}</div>
                  </div>
                </div>

                {/* แถบเครื่องมือและปุ่มดาวน์โหลด PNG */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    📋 ประวัติรายการความผิดทั้งหมด ({memberFines.length} รายการ)
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => exportMemberFinesPNG(memberFineModal)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                  >
                    <Camera size={13} /> 📸 ดาวน์โหลดสรุปยอดของคนนี้ (PNG)
                  </button>
                </div>

                {/* ตารางรายการค่าปรับของคนนี้ */}
                {memberFines.length > 0 ? (
                  <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
                    <table className="simple-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>วันที่</th>
                          <th>ข้อหาความผิด</th>
                          <th>ยอดเงิน</th>
                          <th>สถานะ</th>
                          <th>สลิป</th>
                          {isFinance && <th>ดำเนินการ</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {memberFines.map((f, idx) => (
                          <tr key={f.id}>
                            <td style={{ color: '#9e9e9e', fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ fontSize: 12 }}>{f.date}</td>
                            <td style={{ fontSize: 13 }}>
                              <div style={{ fontWeight: 600 }}>{f.violation}</div>
                              {f.note && <div style={{ fontSize: 11, color: '#94a3b8' }}>หมายเหตุ: {f.note}</div>}
                            </td>
                            <td>
                              <span className={`badge ${f.paymentStatus === 'paid' ? 'badge-green' : 'badge-red'}`}>
                                {f.amount} บาท
                              </span>
                            </td>
                            <td>
                              {f.paymentStatus === 'paid' && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                              {f.paymentStatus === 'slip_uploaded' && <span className="badge badge-yellow">⏳ รอตรวจสลิป</span>}
                              {f.paymentStatus === 'unpaid' && <span className="badge badge-red">ยังไม่ชำระ</span>}
                            </td>
                            <td>
                              {f.paymentStatus === 'slip_uploaded' || f.paymentStatus === 'paid' ? (
                                <button className="btn btn-gray btn-sm" style={{ fontSize: 11 }} onClick={() => viewSlip(f)}>
                                  <Eye size={12} /> ดูสลิป
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: '#cbd5e1' }}>-</span>
                              )}
                            </td>
                            {isFinance && (
                              <td>
                                {f.paymentStatus === 'slip_uploaded' && (
                                  <div style={{ display: 'flex', gap: 5 }}>
                                    <button className="btn btn-success btn-sm" style={{ fontSize: 11 }} onClick={() => confirmFinePaid(f)}>✓ ยืนยัน</button>
                                    <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => rejectFineSlip(f)}>✕ ปฏิเสธ</button>
                                  </div>
                                )}
                                {f.paymentStatus === 'unpaid' && (
                                  <button className="btn btn-gray btn-sm" style={{ fontSize: 11 }} onClick={() => markFineCash(f.id)}>💵 รับเงินสด</button>
                                )}
                                {f.paymentStatus === 'paid' && (
                                  <button className="btn btn-gray btn-sm" style={{ fontSize: 11, color: '#d32f2f' }} onClick={() => revertFineUnpaid(f)}>🔄 ยกเลิกเป็นยังไม่ชำระ</button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px 16px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 14 }}>ไม่มีประวัติการโดนปรับวินัยสภาฯ</div>
                    <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>สมาชิกท่านนี้ปฏิบัติตามกฎระเบียบและเวรของสภานักเรียนอย่างเคร่งครัด</div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setMemberFineModal(null)}>ปิดหน้าต่าง</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Slip View Modal */}
      {slipViewModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={e=>e.target===e.currentTarget&&setSlipViewModal(null)}>
          <div className="modal-box" style={{ maxWidth:480 }}>
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>📤 สลิปการโอนเงิน - {slipViewModal.userName}</span>
              <button onClick={()=>setSlipViewModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ background:'#f9f9f9', borderRadius:6, padding:'10px 14px', marginBottom:12, fontSize:13 }}>
                <div>ความผิด: <strong>{slipViewModal.violation}</strong></div>
                <div>ยอดชำระ: <strong style={{ color:'#e65100' }}>{slipViewModal.amount} บาท</strong></div>
                <div>วันที่: {slipViewModal.date}</div>
              </div>
              {slipViewModal.paymentSlip && (
                <img src={transformGoogleDriveUrl(slipViewModal.paymentSlip)} alt="payment slip" style={{ width:'100%', borderRadius:8, border:'1px solid #e0e0e0' }} />
              )}
            </div>
            {isFinance && slipViewModal.paymentStatus === 'slip_uploaded' && (
              <div className="modal-footer">
                <button className="btn btn-danger" onClick={() => rejectFineSlip(slipViewModal)}>✕ สลิปไม่ถูกต้อง</button>
                <button className="btn btn-success" onClick={() => confirmFinePaid(slipViewModal)}>✓ ยืนยันการชำระ</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fee Slip View Modal */}
      {feeSlipModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setFeeSlipModal(null)}>
          <div className="modal-box" style={{ maxWidth:480 }}>
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>📤 สลิปหลักฐานการชำระเงิน - {feeSlipModal.userName}</span>
              <button onClick={()=>setFeeSlipModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ background:'#f9f9f9', borderRadius:6, padding:'10px 14px', marginBottom:12, fontSize:13 }}>
                <div>รายการเก็บเงิน: <strong>{feeSlipModal.title}</strong></div>
                <div>ยอดชำระ: <strong style={{ color:'#e65100' }}>{feeSlipModal.amount} บาท</strong></div>
                <div>วันที่เรียกเก็บ: {feeSlipModal.date}</div>
              </div>
              {feeSlipModal.slip && (
                <img src={transformGoogleDriveUrl(feeSlipModal.slip)} alt="fee payment slip" style={{ width:'100%', borderRadius:8, border:'1px solid #e0e0e0' }} />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setFeeSlipModal(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}


      {/* Request modal */}
      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>📝 ยื่นคำขอเบิกเงิน</span>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">รายการที่ขอเบิก *</label>
                <input className="input-field" placeholder="เช่น ซื้อกระดาษ A4 สำหรับพิมพ์เอกสาร" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="form-label">หมวดหมู่ *</label>
                  <select className="select-field" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                    {EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">จำนวนเงิน (บาท) *</label>
                  <input className="input-field" type="number" min="0" placeholder="0" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/>
                </div>
              </div>
              <div>
                <label className="form-label">หมายเหตุ / รายละเอียดเพิ่มเติม</label>
                <input className="input-field" placeholder="รายละเอียดเพิ่มเติม..." value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.title||!form.amount}>
                <Save size={14}/> ส่งคำขอ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setRejectModal(null)}>
          <div className="modal-box" style={{ maxWidth:380 }}>
            <div className="modal-header"><span style={{ fontWeight:700 }}>❌ ระบุเหตุผลที่ไม่อนุมัติ</span></div>
            <div className="modal-body">
              <label className="form-label">เหตุผล</label>
              <input className="input-field" placeholder="เช่น เกินงบประมาณ, เอกสารไม่ครบ..." value={rejectNote} onChange={e=>setRejectNote(e.target.value)}/>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setRejectModal(null)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={()=>reject(rejectModal, rejectNote)}>ยืนยันไม่อนุมัติ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
