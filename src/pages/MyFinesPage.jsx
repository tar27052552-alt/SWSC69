import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Banknote, AlertTriangle, Eye, X, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function MyFinesPage() {
  const { user } = useAuth();
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState(null); // fine object being paid
  const [slipPreview, setSlipPreview] = useState(null);
  
  const PROMPTPAY_ID = '1639800408765'; // PromptPay ID ของสภา (สามารถเปลี่ยนได้)
  const PROMPTPAY_NAME = 'น.ส. ทิตติกรณ์ แสงหงษ์';

  const loadMyFines = async () => {
    if (!user) return;
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

  useEffect(() => {
    loadMyFines();
  }, [user]);

  const handleUploadSlip = async () => {
    if (!slipPreview || !paymentModal) return;
    try {
      const { error } = await supabase
        .from('discipline_fines')
        .update({ payment_status: 'slip_uploaded', payment_slip: slipPreview })
        .eq('id', paymentModal.id);
        
      if (error) throw error;
      
      setFines(prev => prev.map(f => f.id === paymentModal.id ? { ...f, paymentStatus: 'slip_uploaded', paymentSlip: slipPreview } : f));
      setPaymentModal(null);
      setSlipPreview(null);
      alert('อัปโหลดสลิปเรียบร้อยแล้ว! รอฝ่ายการเงินตรวจสอบครับ');
    } catch (err) {
      console.error('Error uploading slip:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดสลิป: ' + err.message);
    }
  };

  const totalFines = fines.reduce((sum, f) => sum + f.amount, 0);
  const unpaidFines = fines.filter(f => f.paymentStatus === 'unpaid').reduce((sum, f) => sum + f.amount, 0);
  const pendingFines = fines.filter(f => f.paymentStatus === 'slip_uploaded').reduce((sum, f) => sum + f.amount, 0);
  const paidFines = fines.filter(f => f.paymentStatus === 'paid').reduce((sum, f) => sum + f.amount, 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-title">💸 ค่าปรับของฉัน</div>
        <div className="page-subtitle">ตรวจสอบและชำระค่าปรับกรณีทำผิดระเบียบของสภานักเรียน</div>
      </div>

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
                    <img src={paymentModal.paymentSlip} alt="submitted slip" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 6, border: '1px solid #e0e0e0' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#9e9e9e', padding: '16px 0' }}>ไม่พบคลิปหลักฐาน</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setPaymentModal(null)}>ปิด</button>
              {paymentModal.paymentStatus === 'unpaid' && (
                <button className="btn btn-primary" onClick={handleUploadSlip} disabled={!slipPreview}>
                  📤 ส่งสลิปรอตรวจสอบ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
