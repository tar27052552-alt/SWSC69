import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS } from '../data/mockData';
import { Plus, X, Save, Search, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

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
  
  // Discipline fines
  const [dfines, setDfines] = useState([]);
  const [slipViewModal, setSlipViewModal] = useState(null); // fine object to view slip
  
  // สมาชิกตัวจริงที่ดึงจากระบบ
  const [usersList, setUsersList] = useState([]);
  const [feeSlipModal, setFeeSlipModal] = useState(null);

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
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const rejectFineSlip = async (fine) => {
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ payment_status: 'unpaid', payment_slip: null })
        .eq('id', fine.id);
      if (error) throw error;
      setDfines(prev => prev.map(f => f.id === fine.id ? { ...f, paymentStatus: 'unpaid', paymentSlip: null } : f));
      setSlipViewModal(null);
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
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">💰 ฝ่ายการเงินและพัสดุ</div>
          <div className="page-subtitle">ระบบเบิกจ่าย บัญชีสภา และพัสดุ</div>
        </div>
        <button className="btn btn-primary" onClick={()=>{ setForm(initForm); setModal(true); }}>
          <Plus size={14}/> ยื่นคำขอเบิกเงิน
        </button>
      </div>


      {/* Stats */}
      <div className="stats-row" style={{ marginBottom:16 }}>
        {[
          { label:'คำขอทั้งหมด', value: requests.length, bg:'#e3f2fd', color:'#1565c0', icon:'📋' },
          { label:'รออนุมัติ', value: requests.filter(r=>r.status==='pending').length, bg:'#fff8e1', color:'#f57f17', icon:'⏳' },
          { label:'อนุมัติแล้ว', value: requests.filter(r=>r.status==='approved').length, bg:'#e8f5e9', color:'#2e7d32', icon:'✅' },
          { label:'ไม่อนุมัติ', value: requests.filter(r=>r.status==='rejected').length, bg:'#fce4ec', color:'#c62828', icon:'❌' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background:s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24, display:'flex', gap:8, borderBottom:'1px solid #eee', paddingBottom:8 }}>
        <button onClick={()=>setTab('requests')} style={{ padding:'8px 16px', background:tab==='requests'?'#00bcd4':'#f5f5f5', color:tab==='requests'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer' }}>📋 คำขอเบิกเงิน</button>
        <button onClick={()=>setTab('fees')} style={{ padding:'8px 16px', background:tab==='fees'?'#00bcd4':'#f5f5f5', color:tab==='fees'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer' }}>💰 เก็บเงินสมาชิก</button>
        <button onClick={()=>setTab('fines')} style={{ padding:'8px 16px', background:tab==='fines'?'#00bcd4':'#f5f5f5', color:tab==='fines'?'#fff':'#757575', border:'none', borderRadius:20, fontWeight:600, cursor:'pointer' }}>
          💸 ค่าปรับ {dfines.filter(f=>f.paymentStatus==='slip_uploaded').length > 0 && <span style={{ background:'#e53935', color:'#fff', borderRadius:99, fontSize:11, padding:'1px 6px', marginLeft:4 }}>{dfines.filter(f=>f.paymentStatus==='slip_uploaded').length}</span>}
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
          <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span className="card-title">💰 รายการเก็บเงินสมาชิก</span>
            {isFinance && (
              <button className="btn btn-primary" onClick={() => { setFeeForm({ title:'', amount:'', date:'' }); setFeeModal(true); }}>
                <Plus size={14}/> สร้างรายการเก็บเงิน
              </button>
            )}
          </div>

          {fees.map(fee => {
            const members = usersList.filter(u => u.role !== 'admin');
            const paidCount = members.filter(u => {
              const p = fee.payments?.[u.id];
              if (!p) return false;
              if (typeof p === 'object') return p.paid === true;
              return p === true;
            }).length;
            const totalCollected = paidCount * fee.amount;
            const totalExpected = members.length * fee.amount;

            return (
              <div key={fee.id} style={{ borderBottom:'1px solid #f0f0f0', padding:'16px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fee.title}</div>
                    <div style={{ fontSize:12, color:'#9e9e9e' }}>จำนวน: {fee.amount} บาท/คน · วันที่: {fee.date}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2e7d32' }}>เก็บแล้ว {totalCollected.toLocaleString()} / {totalExpected.toLocaleString()} บาท</div>
                    <div style={{ fontSize:12, color:'#757575' }}>{paidCount}/{members.length} คน</div>
                  </div>
                </div>
                <div style={{ background:'#f0f0f0', borderRadius:99, height:6, overflow:'hidden', marginBottom:12 }}>
                  <div style={{ height:'100%', width:`${members.length > 0 ? (paidCount/members.length)*100 : 0}%`, background:'#00bcd4', borderRadius:99, transition:'width 0.4s' }}/>
                </div>

                {isFinance && (
                  <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setCollectModal(fee.id); setCollectMode('individual'); setCollectUserId(''); }}>
                      👤 เก็บรายบุคคล
                    </button>
                    <button className="btn btn-success btn-sm" onClick={() => { setCollectModal(fee.id); setCollectMode('all'); }}>
                      👥 เก็บทั้งหมด
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

      {tab === 'fines' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">💸 ตรวจสอบการชำระค่าปรับ</span>
            <div style={{ fontSize:12, color:'#757575' }}>รอตรวจสลิป: {dfines.filter(f=>f.paymentStatus==='slip_uploaded').length} รายการ</div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead>
                <tr><th>#</th><th>สมาชิก</th><th>ความผิด</th><th>ยอด</th><th>วันที่</th><th>สถานะ</th><th>สลิป</th>{isFinance && <th>ดำเนินการ</th>}</tr>
              </thead>
              <tbody>
                {dfines.map((f,i) => (
                  <tr key={f.id}>
                    <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:13 }}>{f.userName}</div>
                      <div style={{ fontSize:11, color:'#9e9e9e' }}>'{f.nickname}'</div>
                    </td>
                    <td style={{ fontSize:12 }}>{f.violation}</td>
                    <td><span className={`badge ${f.paymentStatus==='paid'?'badge-green':'badge-red'}`}>{f.amount} บาท</span></td>
                    <td style={{ fontSize:12 }}>{f.date}</td>
                    <td>
                      {f.paymentStatus === 'paid' && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                      {f.paymentStatus === 'slip_uploaded' && <span className="badge badge-yellow">⏳ รอตรวจสลิป</span>}
                      {f.paymentStatus === 'unpaid' && <span className="badge badge-red">ยังไม่ชำระ</span>}
                    </td>
                    <td>
                      {f.paymentStatus === 'slip_uploaded' || f.paymentStatus === 'paid'
                        ? <button className="btn btn-gray btn-sm" style={{ fontSize:11 }} onClick={() => viewSlip(f)}><Eye size={12}/> ดูสลิป</button>
                        : <span style={{ fontSize:11, color:'#bdbdbd' }}>-</span>}
                    </td>
                    {isFinance && (
                      <td>
                        {f.paymentStatus === 'slip_uploaded' && (
                          <div style={{ display:'flex', gap:5 }}>
                            <button className="btn btn-success btn-sm" style={{ fontSize:11 }} onClick={() => confirmFinePaid(f)}>✓ ยืนยัน</button>
                            <button className="btn btn-danger btn-sm" style={{ fontSize:11 }} onClick={() => rejectFineSlip(f)}>✕ ปฏิเสธ</button>
                          </div>
                        )}
                        {f.paymentStatus === 'unpaid' && (
                          <button className="btn btn-gray btn-sm" style={{ fontSize:11 }} onClick={() => markFineCash(f.id)}>💵 เงินสด</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dfines.length === 0 && <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ไม่มีรายการค่าปรับ</div>}
        </div>
      )}

      {/* Slip View Modal */}
      {slipViewModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSlipViewModal(null)}>
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
