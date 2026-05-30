import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Banknote, AlertTriangle, Eye, X, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { uploadFileToDrive, transformGoogleDriveUrl, verifySlipViaGAS } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

export default function MyFinesPage() {
  const { user } = useAuth();
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState(null); // fine object being paid
  const [slipPreview, setSlipPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const [activeTab, setActiveTab] = useState('fines');
  const [fees, setFees] = useState([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [feePaymentModal, setFeePaymentModal] = useState(null); // fee object being paid
  
  const PROMPTPAY_ID = '1639800408765'; // PromptPay ID ของสภา (สามารถเปลี่ยนได้)
  const PROMPTPAY_NAME = 'น.ส. ทิตติกรณ์ แสงหงษ์';

  const loadMyFines = async () => {
    if (!user) return;
    if (user.role === 'admin') {
      setFines([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('discipline_fines')
        .select('*')
        .eq('user_id', String(user.id))
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data) {
        setFines(data.map(d => ({
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
        })));
      }
    } catch (err) {
      console.error('Error loading my fines:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMyFees = async () => {
    if (!user) return;
    if (user.role === 'admin') {
      setFees([]);
      setLoadingFees(false);
      return;
    }
    try {
      setLoadingFees(true);
      const { data, error } = await supabase
        .from('finance_fees')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setFees(data);
      }
    } catch (err) {
      console.error('Error loading my fees:', err);
    } finally {
      setLoadingFees(false);
    }
  };

  const getFeeStatusInfo = (fee) => {
    const p = fee.payments?.[user.id];
    if (!p) return { status: 'unpaid', paid: false, slip: null, date: null };
    if (typeof p === 'object') {
      return {
        status: p.status || (p.paid ? 'paid' : 'unpaid'),
        paid: p.paid === true,
        slip: p.slip || null,
        date: p.date || null
      };
    }
    return {
      status: p === true ? 'paid' : 'unpaid',
      paid: p === true,
      slip: null,
      date: null
    };
  };

  useEffect(() => {
    if (!user) return;
    loadMyFines();
    loadMyFees();

    const interval = setInterval(() => {
      loadMyFines();
      loadMyFees();
    }, 10000);

    const channel = supabase
      .channel('my-fines-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discipline_fines' }, (payload) => {
        const targetUserId = payload.new ? payload.new.user_id : (payload.old ? payload.old.user_id : null);
        if (targetUserId && String(targetUserId) === String(user.id)) {
          loadMyFines();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_fees' }, () => {
        loadMyFees();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleUploadSlip = async () => {
    if (submitting) return;
    if (!slipPreview || !paymentModal) return;
    setSubmitting(true);
    setLoadingStatus('กำลังตรวจสอบความถูกต้องของสลิปกับธนาคาร...');
    try {
      // 1. Verify slip via GAS Proxy to bypass CORS
      const apiKey = import.meta.env.VITE_SLIPOK_API_KEY;
      const branchId = import.meta.env.VITE_SLIPOK_BRANCH_ID;

      if (!apiKey || !branchId) {
        throw new Error('ระบบตรวจสอบสลิปยังไม่ได้รับการตั้งค่า (Missing SlipOK API Keys)');
      }

      const slipOkResult = await verifySlipViaGAS(branchId, apiKey, slipPreview, "");

      if (!slipOkResult.success) {
        let errorMsg = slipOkResult.message || 'สลิปไม่ถูกต้อง';
        if (slipOkResult.code === 1012) errorMsg = 'สลิปนี้ถูกใช้งานไปแล้ว (สลิปซ้ำ)';
        else if (slipOkResult.code === 1013) errorMsg = `ยอดเงินในสลิปไม่ตรงกับค่าปรับ (${paymentModal.amount} บาท)`;
        else if (slipOkResult.code === 1014) errorMsg = 'บัญชีผู้รับเงินไม่ถูกต้อง';
        
        alert('❌ ตรวจสอบสลิปไม่ผ่าน: ' + errorMsg);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      // ตรวจสอบยอดเงินด้วยตัวเอง (ป้องกันปัญหา SlipOK เทียบทศนิยมไม่ตรง)
      const slipAmount = slipOkResult.data?.amount || 0;
      if (slipAmount < paymentModal.amount) {
        alert(`❌ ตรวจสอบสลิปไม่ผ่าน: ยอดเงินในสลิป (${slipAmount} บาท) ไม่เพียงพอสำหรับค่าปรับ (${paymentModal.amount} บาท)`);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      // 2. Upload to Google Drive if valid
      setLoadingStatus('สลิปถูกต้อง! กำลังบันทึกข้อมูล...');
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

      // 3. Mark as paid automatically
      const { error } = await supabase
        .from('discipline_fines')
        .update({ payment_status: 'paid', paid: true, payment_slip: finalSlipUrl })
        .eq('id', paymentModal.id);
        
      if (error) throw error;
      
      setFines(prev => prev.map(f => f.id === paymentModal.id ? { ...f, paymentStatus: 'paid', paid: true, paymentSlip: finalSlipUrl } : f));
      const paidFine = paymentModal;
      setPaymentModal(null);
      setSlipPreview(null);
      alert('✅ ชำระค่าปรับเรียบร้อยแล้ว ระบบตรวจสอบและอนุมัติอัตโนมัติ!');

      // Send Discord embed notification
      const embedTitle = `✅ ชำระค่าปรับสำเร็จ - สภานักเรียน`;
      const embedDesc = `ระบบทำการตรวจสอบและผ่านการอนุมัติสลิปโอนเงินอัตโนมัติ`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${user?.name} (${user?.nickname})`, inline: true },
        { name: '⚖️ ชำระค่าปรับ', value: paidFine.violation, inline: true },
        { name: '💵 จำนวนเงิน', value: `${paidFine.amount} บาท`, inline: true }
      ];
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, finalSlipUrl, 'discipline_fines'); // สีเขียวสำหรับสำเร็จ พร้อมพรีวิวสลิป (ค่าปรับ)
    } catch (err) {
      console.error('Error uploading slip:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
      setLoadingStatus('');
    }
  };

  const handleUploadFeeSlip = async () => {
    if (submitting) return;
    if (!slipPreview || !feePaymentModal) return;
    setSubmitting(true);
    setLoadingStatus('กำลังตรวจสอบความถูกต้องของสลิปกับธนาคาร...');
    try {
      // 1. Verify slip via GAS Proxy to bypass CORS
      const apiKey = import.meta.env.VITE_SLIPOK_API_KEY;
      const branchId = import.meta.env.VITE_SLIPOK_BRANCH_ID;

      if (!apiKey || !branchId) {
        throw new Error('ระบบตรวจสอบสลิปยังไม่ได้รับการตั้งค่า (Missing SlipOK API Keys)');
      }

      const slipOkResult = await verifySlipViaGAS(branchId, apiKey, slipPreview, "");

      if (!slipOkResult.success) {
        let errorMsg = slipOkResult.message || 'สลิปไม่ถูกต้อง';
        if (slipOkResult.code === 1012) errorMsg = 'สลิปนี้ถูกใช้งานไปแล้ว (สลิปซ้ำ)';
        else if (slipOkResult.code === 1013) errorMsg = `ยอดเงินในสลิปไม่ตรงกับค่าใช้จ่าย (${feePaymentModal.amount} บาท)`;
        else if (slipOkResult.code === 1014) errorMsg = 'บัญชีผู้รับเงินไม่ถูกต้อง';
        
        alert('❌ ตรวจสอบสลิปไม่ผ่าน: ' + errorMsg);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      // ตรวจสอบยอดเงินด้วยตัวเอง (ป้องกันปัญหา SlipOK เทียบทศนิยมไม่ตรง)
      const slipAmount = slipOkResult.data?.amount || 0;
      if (slipAmount < feePaymentModal.amount) {
        alert(`❌ ตรวจสอบสลิปไม่ผ่าน: ยอดเงินในสลิป (${slipAmount} บาท) ไม่เพียงพอสำหรับค่าใช้จ่าย (${feePaymentModal.amount} บาท)`);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      // 2. Upload to Google Drive if valid
      setLoadingStatus('สลิปถูกต้อง! กำลังบันทึกข้อมูล...');
      let finalSlipUrl = slipPreview;
      if (slipPreview && slipPreview.startsWith('data:')) {
        try {
          const fileName = `fee_slip_${feePaymentModal.id}_${user.id}_${Date.now()}.jpg`;
          const uploadResult = await uploadFileToDrive(slipPreview, fileName, 'slips');
          if (uploadResult && uploadResult.url) {
            finalSlipUrl = uploadResult.url;
          }
        } catch (uploadErr) {
          console.error("Failed to upload slip to Google Drive. Storing locally as Base64 fallback:", uploadErr);
        }
      }

      // 3. Mark as paid automatically in finance_fees
      const targetFee = fees.find(f => f.id === feePaymentModal.id);
      if (!targetFee) throw new Error('ไม่พบข้อมูลรายการเก็บเงิน');

      const nextPayments = {
        ...(targetFee.payments || {}),
        [user.id]: {
          paid: true,
          status: 'paid',
          slip: finalSlipUrl,
          date: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from('finance_fees')
        .update({ payments: nextPayments })
        .eq('id', feePaymentModal.id);
        
      if (error) throw error;
      
      setFees(prev => prev.map(f => f.id === feePaymentModal.id ? { ...f, payments: nextPayments } : f));
      const paidFee = feePaymentModal;
      setFeePaymentModal(null);
      setSlipPreview(null);
      alert('✅ ชำระค่าธรรมเนียมเรียบร้อยแล้ว ระบบตรวจสอบและอนุมัติอัตโนมัติ!');

      // Send Discord embed notification
      const embedTitle = `✅ ชำระค่าธรรมเนียมสำเร็จ - สภานักเรียน`;
      const embedDesc = `ระบบทำการตรวจสอบและผ่านการอนุมัติสลิปโอนเงินอัตโนมัติ`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${user?.name} (${user?.nickname})`, inline: true },
        { name: '📋 ชำระค่าธรรมเนียม', value: paidFee.title, inline: true },
        { name: '💵 จำนวนเงิน', value: `${paidFee.amount} บาท`, inline: true }
      ];
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, finalSlipUrl, 'discipline_fines'); // สีเขียวสำหรับสำเร็จ พร้อมพรีวิวสลิป
    } catch (err) {
      console.error('Error uploading fee slip:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
      setLoadingStatus('');
    }
  };

  const totalFines = fines.reduce((sum, f) => sum + f.amount, 0);
  const unpaidFines = fines.filter(f => f.paymentStatus === 'unpaid').reduce((sum, f) => sum + f.amount, 0);
  const pendingFines = fines.filter(f => f.paymentStatus === 'slip_uploaded').reduce((sum, f) => sum + f.amount, 0);
  const paidFines = fines.filter(f => f.paymentStatus === 'paid').reduce((sum, f) => sum + f.amount, 0);

  const unpaidFees = fees.filter(f => !getFeeStatusInfo(f).paid).reduce((sum, f) => sum + f.amount, 0);
  const paidFees = fees.filter(f => getFeeStatusInfo(f).paid).reduce((sum, f) => sum + f.amount, 0);
  const totalFeesCount = fees.length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-title">💸 ชำระเงิน / ค่าปรับ</div>
        <div className="page-subtitle">ตรวจสอบและชำระค่าธรรมเนียม เงินสะสม หรือค่าปรับของสภานักเรียน</div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20, display: 'flex', gap: 8, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
        <button
          onClick={() => { setActiveTab('fines'); setSlipPreview(null); }}
          style={{
            padding: '8px 16px',
            background: activeTab === 'fines' ? '#00bcd4' : '#f5f5f5',
            color: activeTab === 'fines' ? '#fff' : '#757575',
            border: 'none',
            borderRadius: 20,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          💸 ค่าปรับของฉัน {unpaidFines > 0 && <span style={{ background: '#e53935', color: '#fff', borderRadius: 99, fontSize: 11, padding: '1px 6px', marginLeft: 4 }}>{unpaidFines} บ.</span>}
        </button>
        <button
          onClick={() => { setActiveTab('fees'); setSlipPreview(null); }}
          style={{
            padding: '8px 16px',
            background: activeTab === 'fees' ? '#00bcd4' : '#f5f5f5',
            color: activeTab === 'fees' ? '#fff' : '#757575',
            border: 'none',
            borderRadius: 20,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          💰 เงินสะสม / ค่าเก็บเงินสภา {fees.filter(f => !getFeeStatusInfo(f).paid).length > 0 && <span style={{ background: '#e53935', color: '#fff', borderRadius: 99, fontSize: 11, padding: '1px 6px', marginLeft: 4 }}>{fees.filter(f => !getFeeStatusInfo(f).paid).length} รายการ</span>}
        </button>
      </div>

      {activeTab === 'fines' && (
        <>
          {/* Summary Cards */}
          <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef5350', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#ffebee', color: '#c62828', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9e9e9e', fontWeight: 500 }}>ยอดค้างชำระ</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c62828' }}>{unpaidFines} บาท</div>
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ffb74d', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#fff3e0', color: '#e65100', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Banknote size={24} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9e9e9e', fontWeight: 500 }}>รอการตรวจสอบ</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#e65100' }}>{pendingFines} บาท</div>
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #66bb6a', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={24} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9e9e9e', fontWeight: 500 }}>ชำระแล้ว</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2e7d32' }}>{paidFines} บาท</div>
              </div>
            </div>
          </div>

          {/* Main Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">ประวัติการโดนปรับทั้งหมด</span>
              <div style={{ fontSize: 12, color: '#757575' }}>โดนปรับทั้งหมด {fines.length} ครั้ง (รวม {totalFines} บาท)</div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                กำลังโหลดข้อมูลค่าปรับ...
              </div>
            ) : fines.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                🎉 ยอดเยี่ยม! คุณไม่มีประวัติการโดนปรับเลย
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>ความผิด</th>
                      <th>จำนวนเงิน</th>
                      <th>วันที่โดนปรับ</th>
                      <th>หมายเหตุ</th>
                      <th>บันทึกโดย</th>
                      <th>สถานะ</th>
                      <th style={{ textAlign: 'center' }}>การชำระเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fines.map((f, i) => {
                      const ps = f.paymentStatus;
                      return (
                        <tr key={f.id}>
                          <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{f.violation}</td>
                          <td>
                            <span className={`badge ${ps === 'paid' ? 'badge-green' : 'badge-red'}`} style={{ fontWeight: 700 }}>
                              {f.amount} บาท
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{f.date}</td>
                          <td style={{ fontSize: 12, color: '#757575' }}>{f.note || '–'}</td>
                          <td style={{ fontSize: 12, color: '#9e9e9e' }}>{f.by}</td>
                          <td>
                            {ps === 'paid' && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                            {ps === 'slip_uploaded' && <span className="badge badge-yellow">⏳ รอตรวจสลิป</span>}
                            {ps === 'unpaid' && <span className="badge badge-red">ยังไม่ชำระ</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {ps === 'unpaid' && (
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => { setPaymentModal(f); setSlipPreview(null); }}
                              >
                                💳 จ่ายเงิน
                              </button>
                            )}
                            {ps === 'slip_uploaded' && (
                              <button
                                className="btn btn-gray btn-sm"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => { setPaymentModal(f); setSlipPreview(f.paymentSlip); }}
                              >
                                <Eye size={12} style={{ marginRight: 4 }} /> ดูสลิปที่ส่ง
                              </button>
                            )}
                            {ps === 'paid' && (
                              <span style={{ fontSize: 12, color: '#4caf50', fontWeight: 600 }}>สำเร็จ</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'fees' && (
        <>
          {/* Fee Summary Cards */}
          <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef5350', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#ffebee', color: '#c62828', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9e9e9e', fontWeight: 500 }}>ค้างชำระสะสม</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c62828' }}>{unpaidFees} บาท</div>
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #66bb6a', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={24} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9e9e9e', fontWeight: 500 }}>ชำระแล้วทั้งหมด</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2e7d32' }}>{paidFees} บาท</div>
              </div>
            </div>
          </div>

          {/* Fee List Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">รายการเก็บเงินของสภาทั้งหมด</span>
              <div style={{ fontSize: 12, color: '#757575' }}>มีทั้งหมด {totalFeesCount} รายการ</div>
            </div>

            {loadingFees ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                กำลังโหลดข้อมูลรายการเก็บเงิน...
              </div>
            ) : fees.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                🎉 ยอดเยี่ยม! ไม่พบรายการเรียกเก็บเงินสมาชิกสภา
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>รายการเก็บเงิน</th>
                      <th>จำนวนเงิน</th>
                      <th>วันที่เรียกเก็บ</th>
                      <th>สถานะ</th>
                      <th style={{ textAlign: 'center' }}>การชำระเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f, i) => {
                      const inf = getFeeStatusInfo(f);
                      return (
                        <tr key={f.id}>
                          <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{f.title}</td>
                          <td>
                            <span className={`badge ${inf.paid ? 'badge-green' : 'badge-red'}`} style={{ fontWeight: 700 }}>
                              {f.amount} บาท
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{f.date}</td>
                          <td>
                            {inf.paid && <span className="badge badge-green">✓ ชำระแล้ว</span>}
                            {!inf.paid && <span className="badge badge-red">ยังไม่ชำระ</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!inf.paid ? (
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => { setFeePaymentModal(f); setSlipPreview(null); }}
                              >
                                💳 จ่ายเงิน
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: '#4caf50', fontWeight: 600 }}>สำเร็จ</span>
                                {inf.slip && (
                                  <button
                                    className="btn btn-gray btn-sm"
                                    style={{ padding: '2px 6px', fontSize: 11 }}
                                    onClick={() => { setFeePaymentModal(f); setSlipPreview(inf.slip); }}
                                  >
                                    ดูสลิป
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* QR Payment Modal */}
      {paymentModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPaymentModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>💳 ชำระค่าปรับ - {paymentModal.violation}</span>
              <button onClick={() => setPaymentModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px', width: '100%', fontSize: 13, textAlign: 'center' }}>
                ยอดชำระ: <strong style={{ fontSize: 20, color: '#e65100' }}>{paymentModal.amount} บาท</strong>
              </div>
              
              {paymentModal.paymentStatus === 'unpaid' ? (
                <>
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
                  <div style={{ width: '100%' }}>
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
                        <img src={slipPreview} alt="slip preview" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '2px solid #a5d6a7' }} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>สลิปหลักฐานการโอนเงินที่ส่งแล้ว</div>
                  {paymentModal.paymentSlip ? (
                    <img src={transformGoogleDriveUrl(paymentModal.paymentSlip)} alt="submitted slip" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 6, border: '1px solid #e0e0e0' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '16px 0' }}>ไม่พบรูปหลักฐาน</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setPaymentModal(null)}>ปิด</button>
              {paymentModal.paymentStatus === 'unpaid' && (
                <button className="btn btn-primary" onClick={handleUploadSlip} disabled={!slipPreview || submitting}>
                  {submitting ? (loadingStatus || 'กำลังตรวจสอบ...') : '📤 อัปโหลดและตรวจสอบสลิป'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Payment Modal for Fees */}
      {feePaymentModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setFeePaymentModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>💳 ชำระเงิน - {feePaymentModal.title}</span>
              <button onClick={() => setFeePaymentModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px', width: '100%', fontSize: 13, textAlign: 'center' }}>
                ยอดชำระ: <strong style={{ fontSize: 20, color: '#e65100' }}>{feePaymentModal.amount} บาท</strong>
              </div>
              
              {!getFeeStatusInfo(feePaymentModal).paid ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
                    <div style={{ fontSize: 13, color: '#555', fontWeight: 600, marginBottom: 8 }}>QR Code ชำระเงิน PromptPay</div>
                    <div style={{ background: '#ffffff', padding: 8, borderRadius: 12, border: '1px solid #e0e0e0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                      <img
                        src={`https://promptpay.io/${PROMPTPAY_ID}/${feePaymentModal.amount}`}
                        alt="PromptPay QR"
                        style={{ width: 180, height: 180, display: 'block' }}
                        onError={e => { e.target.style.display='none'; }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: '#757575' }}>PromptPay (เลขบัตรประชาชน): <strong>1-6398-00408-76-5</strong></div>
                    <div style={{ fontSize: 13, color: '#006064', fontWeight: 700, marginTop: 4 }}>ชื่อบัญชี: {PROMPTPAY_NAME}</div>
                  </div>
                  <div style={{ width: '100%' }}>
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
                        <img src={slipPreview} alt="slip preview" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '2px solid #a5d6a7' }} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>สลิปหลักฐานการโอนเงินที่ส่งแล้ว</div>
                  {slipPreview ? (
                    <img src={transformGoogleDriveUrl(slipPreview)} alt="submitted slip" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 6, border: '1px solid #e0e0e0' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '16px 0' }}>ไม่พบรูปหลักฐาน</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setFeePaymentModal(null)}>ปิด</button>
              {!getFeeStatusInfo(feePaymentModal).paid && (
                <button className="btn btn-primary" onClick={handleUploadFeeSlip} disabled={!slipPreview || submitting}>
                  {submitting ? (loadingStatus || 'กำลังตรวจสอบ...') : '📤 อัปโหลดและตรวจสอบสลิป'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
