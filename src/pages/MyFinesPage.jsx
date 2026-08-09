import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Banknote, AlertTriangle, Eye, X, Check, Camera, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { uploadFileToDrive, transformGoogleDriveUrl, verifySlipViaGAS } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import logoUrl from '../assets/logo.png';
import promptpayQrUrl from '../assets/promptpay_qr.png';

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
  
  const PROMPTPAY_ID = '0954181766';
  const PROMPTPAY_NAME = 'น.ส. จันทมณี จันทร์แก้วปง';

  const [selectedFineIds, setSelectedFineIds] = useState([]);
  const [bulkPaymentModal, setBulkPaymentModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadMyFines = async (isInitial = false) => {
    if (!user) return;
    if (user.role === 'admin') {
      setFines([]);
      setLoading(false);
      return;
    }
    try {
      if (isInitial) setLoading(true);
      const { data, error } = await supabase
        .from('discipline_fines')
        .select('*')
        .eq('user_id', String(user.id))
        .order('date', { ascending: false })
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
    loadMyFines(true);
    loadMyFees();

    const channel = supabase
      .channel('my-fines-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discipline_fines' }, (payload) => {
        const targetUserId = payload.new ? payload.new.user_id : (payload.old ? payload.old.user_id : null);
        if (targetUserId && String(targetUserId) === String(user.id)) {
          loadMyFines(false);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_fees' }, () => {
        loadMyFees();
      })
      .subscribe();

    return () => {
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

  const handleUploadBulkSlip = async () => {
    if (submitting) return;
    if (!slipPreview || selectedFineIds.length === 0) return;

    const selectedFinesList = fines.filter(f => selectedFineIds.includes(f.id));
    const totalAmount = selectedFinesList.reduce((sum, f) => sum + f.amount, 0);

    setSubmitting(true);
    setLoadingStatus('กำลังตรวจสอบความถูกต้องของสลิปกับธนาคาร...');
    try {
      const apiKey = import.meta.env.VITE_SLIPOK_API_KEY;
      const branchId = import.meta.env.VITE_SLIPOK_BRANCH_ID;

      if (!apiKey || !branchId) {
        throw new Error('ระบบตรวจสอบสลิปยังไม่ได้รับการตั้งค่า (Missing SlipOK API Keys)');
      }

      const slipOkResult = await verifySlipViaGAS(branchId, apiKey, slipPreview, "");

      if (!slipOkResult.success) {
        let errorMsg = slipOkResult.message || 'สลิปไม่ถูกต้อง';
        if (slipOkResult.code === 1012) errorMsg = 'สลิปนี้ถูกใช้งานไปแล้ว (สลิปซ้ำ)';
        else if (slipOkResult.code === 1013) errorMsg = `ยอดเงินในสลิปไม่ตรงกับยอดรวมค่าปรับ (${totalAmount} บาท)`;
        else if (slipOkResult.code === 1014) errorMsg = 'บัญชีผู้รับเงินไม่ถูกต้อง';
        
        alert('❌ ตรวจสอบสลิปไม่ผ่าน: ' + errorMsg);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      const slipAmount = slipOkResult.data?.amount || 0;
      if (slipAmount < totalAmount) {
        alert(`❌ ตรวจสอบสลิปไม่ผ่าน: ยอดเงินในสลิป (${slipAmount} บาท) ไม่เพียงพอสำหรับยอดรวมค่าปรับ (${totalAmount} บาท)`);
        setSubmitting(false);
        setLoadingStatus('');
        return;
      }

      setLoadingStatus('สลิปถูกต้อง! กำลังบันทึกข้อมูล...');
      let finalSlipUrl = slipPreview;
      if (slipPreview && slipPreview.startsWith('data:')) {
        try {
          const fileName = `bulk_slip_${user.id}_${Date.now()}.jpg`;
          const uploadResult = await uploadFileToDrive(slipPreview, fileName, 'slips');
          if (uploadResult && uploadResult.url) {
            finalSlipUrl = uploadResult.url;
          }
        } catch (uploadErr) {
          console.error("Failed to upload slip to Google Drive:", uploadErr);
        }
      }

      const { error } = await supabase
        .from('discipline_fines')
        .update({ payment_status: 'paid', paid: true, payment_slip: finalSlipUrl })
        .in('id', selectedFineIds);
        
      if (error) throw error;
      
      setFines(prev => prev.map(f => selectedFineIds.includes(f.id) ? { ...f, paymentStatus: 'paid', paid: true, paymentSlip: finalSlipUrl } : f));
      setSelectedFineIds([]);
      setBulkPaymentModal(false);
      setSlipPreview(null);
      alert(`✅ ชำระค่าปรับรวม ${selectedFinesList.length} รายการ (รวม ${totalAmount} บาท) เรียบร้อยแล้ว!`);

      const embedTitle = `✅ ชำระค่าปรับรวม ${selectedFinesList.length} รายการสำเร็จ - สภานักเรียน`;
      const embedDesc = `ระบบทำการตรวจสอบสลิปโอนเงินรวมแบบกลุ่มอนุมัติอัตโนมัติ`;
      const fields = [
        { name: '👤 ผู้ชำระ', value: `${user?.name} (${user?.nickname})`, inline: true },
        { name: '⚖️ รายการที่ชำระ', value: selectedFinesList.map(f => `• ${f.violation} (${f.amount} บ.)`).join('\n'), inline: false },
        { name: '💵 ยอดรวมสุทธิ', value: `${totalAmount} บาท`, inline: true }
      ];
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, finalSlipUrl, 'discipline_fines');
    } catch (err) {
      console.error('Error uploading bulk slip:', err);
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

  const handleExportPNG = () => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const isFines = activeTab === 'fines';
      const items = isFines ? fines : fees;

      const width = 800;
      const headerHeight = 255;
      const statsHeight = 120;
      const rowHeight = 55;
      const footerHeight = 80;
      const tableHeaderHeight = 50;
      const totalRows = items.length === 0 ? 1 : items.length;
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

      // Draw Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw Cyan Header Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#00acc1');
      gradient.addColorStop(1, '#00bcd4');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      // Decorative shapes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(width - 50, 50, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(50, headerHeight, 100, 0, Math.PI * 2);
      ctx.fill();

      // Draw real logo image
      ctx.drawImage(logoImg, 35, 35, 135, 135);

      // Title
      ctx.textAlign = 'left';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText('สภานักเรียนโรงเรียน', 190, 85);
      ctx.font = 'normal 13px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText('Student Council Financial Portal (SWSC69)', 190, 110);

      // Main Report Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Noto Sans Thai", sans-serif';
      const reportTitle = isFines ? 'รายงานสรุปยอดค้างชำระค่าปรับ' : 'รายงานการชำระเงินสะสมสภาฯ';
      ctx.fillText(reportTitle, 35, 220);

      // Profile details (No nickname)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(user?.name || 'ไม่ระบุ', width - 35, 85);
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      ctx.fillText(user?.position || 'สมาชิกสภานักเรียน', width - 35, 110);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.fillText(`ออกรายงานเมื่อ: ${dateStr} น.`, width - 35, 135);

      // Draw Stats Box
      const statsY = headerHeight + 20;
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      drawRoundRect(35, statsY, width - 70, 80, 10);
      ctx.stroke();
      ctx.fillStyle = '#fafafa';
      ctx.fill();

      const colW = (width - 70) / 3;
      if (isFines) {
        const stats = [
          { label: 'ยอดค้างชำระสะสม', val: `${unpaidFines} บาท`, col: '#c62828' },
          { label: 'รอการตรวจสอบ', val: `${pendingFines} บาท`, col: '#e65100' },
          { label: 'ชำระเสร็จสิ้น', val: `${paidFines} บาท`, col: '#2e7d32' }
        ];
        stats.forEach((s, idx) => {
          const startX = 35 + (idx * colW);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#757575';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(s.label, startX + colW/2, statsY + 32);
          ctx.fillStyle = s.col;
          ctx.font = 'bold 20px "Noto Sans Thai", sans-serif';
          ctx.fillText(s.val, startX + colW/2, statsY + 58);

          if (idx < 2) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(startX + colW, statsY + 18);
            ctx.lineTo(startX + colW, statsY + 62);
            ctx.stroke();
          }
        });
      } else {
        const stats = [
          { label: 'ยอดค้างชำระสะสม', val: `${unpaidFees} บาท`, col: '#c62828' },
          { label: 'ชำระสะสมแล้ว', val: `${paidFees} บาท`, col: '#2e7d32' },
          { label: 'จำนวนรายการสะสม', val: `${totalFeesCount} รายการ`, col: '#00838f' }
        ];
        stats.forEach((s, idx) => {
          const startX = 35 + (idx * colW);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#757575';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(s.label, startX + colW/2, statsY + 32);
          ctx.fillStyle = s.col;
          ctx.font = 'bold 20px "Noto Sans Thai", sans-serif';
          ctx.fillText(s.val, startX + colW/2, statsY + 58);

          if (idx < 2) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(startX + colW, statsY + 18);
            ctx.lineTo(startX + colW, statsY + 62);
            ctx.stroke();
          }
        });
      }

      // Table Headers
      const tableY = statsY + 110;
      ctx.fillStyle = '#f5f5f5';
      drawRoundRect(35, tableY, width - 70, tableHeaderHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#616161';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.textBaseline = 'middle';

      ctx.textAlign = 'left';
      ctx.fillText('#', 55, tableY + tableHeaderHeight/2);
      ctx.fillText(isFines ? 'ข้อหาความผิดวินัย' : 'รายการเรียกเก็บเงินสะสม', 95, tableY + tableHeaderHeight/2);
      ctx.textAlign = 'right';
      ctx.fillText(isFines ? 'ค่าปรับ' : 'จำนวนเงิน', 480, tableY + tableHeaderHeight/2);
      ctx.fillText('วันที่', 630, tableY + tableHeaderHeight/2);
      ctx.textAlign = 'center';
      ctx.fillText('สถานะ', 720, tableY + tableHeaderHeight/2);

      // Table Rows
      let currentY = tableY + tableHeaderHeight;
      ctx.textBaseline = 'middle';

      if (items.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9e9e9e';
        ctx.font = 'normal 14px "Noto Sans Thai", sans-serif';
        ctx.fillText('🎉 ไม่มีรายการบันทึกความค้างชำระใดๆ', width/2, currentY + rowHeight/2);
      } else {
        items.forEach((item, idx) => {
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
          const titleText = isFines ? item.violation : item.title;
          let displayTitle = titleText || '';
          if (displayTitle && ctx.measureText(displayTitle).width > 340) {
            while (displayTitle.length > 0 && ctx.measureText(displayTitle + '...').width > 340) {
              displayTitle = displayTitle.slice(0, -1);
            }
            displayTitle += '...';
          }
          ctx.fillText(displayTitle, 95, currentY + rowHeight/2 - (isFines && item.note ? 8 : 0));

          if (isFines && item.note) {
            ctx.fillStyle = '#757575';
            ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
            ctx.fillText(`หมายเหตุ: ${item.note}`, 95, currentY + rowHeight/2 + 10);
          }

          ctx.textAlign = 'right';
          ctx.fillStyle = '#212121';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.fillText(`${item.amount} บ.`, 480, currentY + rowHeight/2);

          ctx.fillStyle = '#616161';
          ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
          ctx.fillText(item.date, 630, currentY + rowHeight/2);

          ctx.textAlign = 'center';
          const statusInfo = isFines ? item.paymentStatus : getFeeStatusInfo(item).status;

          let badgeColor = '#ffebee';
          let textColor = '#c62828';
          let statusLabel = 'ยังไม่ชำระ';

          if (statusInfo === 'paid') {
            badgeColor = '#e8f5e9';
            textColor = '#2e7d32';
            statusLabel = 'ชำระแล้ว';
          } else if (statusInfo === 'slip_uploaded') {
            badgeColor = '#fff8e1';
            textColor = '#f57f17';
            statusLabel = 'รอตรวจ';
          }

          ctx.fillStyle = badgeColor;
          drawRoundRect(670, currentY + rowHeight/2 - 12, 100, 24, 12);
          ctx.fill();

          ctx.fillStyle = textColor;
          ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
          ctx.fillText(statusLabel, 720, currentY + rowHeight/2);

          currentY += rowHeight;
        });
      }

      // Footer Watermark
      const footerY = height - 50;
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(35, footerY - 15);
      ctx.lineTo(width - 35, footerY - 15);
      ctx.stroke();

      ctx.fillStyle = '#9e9e9e';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน | Student Council Portal SWSC69', 35, footerY + 10);

      ctx.textAlign = 'right';
      ctx.fillText('ข้อมูลการเงินเป็นความลับภายในสภาฯ ห้ามแผยแพร่ภายนอกโดยไม่ได้รับอนุญาต', width - 35, footerY + 10);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${isFines ? 'fines' : 'fees'}_summary_${user?.nickname || 'member'}.png`;
      link.href = dataUrl;
      link.click();
    };
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">💸 ชำระเงิน / ค่าปรับ</div>
          <div className="page-subtitle">ตรวจสอบและชำระค่าธรรมเนียม เงินสะสม หรือค่าปรับของสภานักเรียน</div>
        </div>
        <button className="btn btn-outline" onClick={handleExportPNG} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 12px' }}>
          <Camera size={15} /> 📸 บันทึกสรุปเป็นรูปภาพ (PNG)
        </button>
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

          {/* Multi-Select Floating Action Banner */}
          {selectedFineIds.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              borderRadius: 16,
              padding: '14px 20px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 8px 24px rgba(79, 70, 229, 0.3)',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>💳</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    เลือกชำระเงินรวม {selectedFineIds.length} รายการ
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>
                    ยอดชำระรวมทั้งสิ้น: <strong style={{ fontSize: 16, color: '#fef08a' }}>
                      {fines.filter(f => selectedFineIds.includes(f.id)).reduce((sum, f) => sum + f.amount, 0)} บาท
                    </strong>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn"
                  onClick={() => setSelectedFineIds([])}
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700 }}
                >
                  ยกเลิกเลือก
                </button>
                <button
                  className="btn"
                  onClick={() => { setSlipPreview(null); setBulkPaymentModal(true); }}
                  style={{ background: '#ffffff', color: '#4f46e5', fontWeight: 800, borderRadius: 10, padding: '8px 18px', fontSize: 13, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                >
                  💳 สแกนจ่ายรวมทีเดียว ({fines.filter(f => selectedFineIds.includes(f.id)).reduce((sum, f) => sum + f.amount, 0)} บ.)
                </button>
              </div>
            </div>
          )}

          {/* Main Card */}
          <div className="card">
            {/* Search & Status Filters Bar */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', borderRadius: '16px 16px 0 0' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="ค้นหาข้อหา, วันที่ หรือหมายเหตุ..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    paddingLeft: 36,
                    paddingRight: 12,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'unpaid', label: 'ค้างชำระ' },
                  { id: 'slip_uploaded', label: 'รอตรวจ' },
                  { id: 'paid', label: 'ชำระแล้ว' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding: '6px 14px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      borderRadius: 20,
                      border: '1px solid ' + (statusFilter === f.id ? '#6366f1' : '#e2e8f0'),
                      background: statusFilter === f.id ? '#f3e8ff' : '#ffffff',
                      color: statusFilter === f.id ? '#6b21a8' : '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="card-title">ประวัติการโดนปรับทั้งหมด</span>
                <div style={{ fontSize: 12, color: '#757575' }}>โดนปรับทั้งหมด {fines.length} ครั้ง (รวม {totalFines} บาท)</div>
              </div>

              {fines.filter(f => f.paymentStatus === 'unpaid').length > 0 && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const unpaidList = fines.filter(f => f.paymentStatus === 'unpaid');
                    if (selectedFineIds.length === unpaidList.length) {
                      setSelectedFineIds([]);
                    } else {
                      setSelectedFineIds(unpaidList.map(f => f.id));
                    }
                  }}
                  style={{ fontSize: 12, borderRadius: 8, padding: '4px 10px' }}
                >
                  {selectedFineIds.length === fines.filter(f => f.paymentStatus === 'unpaid').length ? '☑️ ยกเลิกเลือกทั้งหมด' : '☑️ เลือกค้างชำระทั้งหมด'}
                </button>
              )}
            </div>

            {(() => {
              const filteredFines = fines.filter(f => {
                const matchesSearch = !searchQuery || 
                  f.violation.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (f.note && f.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  (f.date && f.date.includes(searchQuery));
                const matchesStatus = statusFilter === 'all' || f.paymentStatus === statusFilter;
                return matchesSearch && matchesStatus;
              });

              if (loading) {
                return (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                    <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    กำลังโหลดข้อมูลค่าปรับ...
                  </div>
                );
              }
              if (fines.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#9e9e9e' }}>
                    🎉 ยอดเยี่ยม! คุณไม่มีประวัติการโดนปรับเลย
                  </div>
                );
              }
              if (filteredFines.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🔍</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>ไม่พบรายการค่าปรับตามเงื่อนไขที่ค้นหา</div>
                  </div>
                );
              }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40, textAlign: 'center' }}>
                          {filteredFines.filter(f => f.paymentStatus === 'unpaid').length > 0 && (
                            <input
                              type="checkbox"
                              checked={selectedFineIds.length === filteredFines.filter(f => f.paymentStatus === 'unpaid').length && selectedFineIds.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedFineIds(filteredFines.filter(f => f.paymentStatus === 'unpaid').map(f => f.id));
                                } else {
                                  setSelectedFineIds([]);
                                }
                              }}
                              style={{ cursor: 'pointer', width: 16, height: 16 }}
                              title="เลือกค้างชำระทั้งหมด"
                            />
                          )}
                        </th>
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
                      {filteredFines.map((f, i) => {
                      const ps = f.paymentStatus;
                      return (
                        <tr key={f.id} style={{ background: selectedFineIds.includes(f.id) ? '#f0fdf4' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            {ps === 'unpaid' ? (
                              <input
                                type="checkbox"
                                checked={selectedFineIds.includes(f.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedFineIds(prev => [...prev, f.id]);
                                  } else {
                                    setSelectedFineIds(prev => prev.filter(id => id !== f.id));
                                  }
                                }}
                                style={{ cursor: 'pointer', width: 16, height: 16 }}
                              />
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>–</span>
                            )}
                          </td>
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
                                💳 จ่ายแยก
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
              );
            })()}
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
                    <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 8 }}>QR Code ชำระเงิน PromptPay (ระบุยอดเงินให้อัตโนมัติ)</div>
                    <div style={{ background: '#ffffff', padding: 12, borderRadius: 18, border: '1.5px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                      <img
                        src={`https://promptpay.io/${PROMPTPAY_ID}/${paymentModal.amount}`}
                        alt="Dynamic PromptPay QR"
                        style={{ width: 210, height: 210, display: 'block', borderRadius: 8 }}
                        onError={e => { e.target.src = promptpayQrUrl; }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>พร้อมเพย์ (PromptPay): <strong style={{ color: '#0f172a' }}>095-418-1766</strong></div>
                    <div style={{ fontSize: 13.5, color: '#0f172a', fontWeight: 800, marginTop: 2 }}>ชื่อบัญชี: {PROMPTPAY_NAME}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>ธนาคารกรุงไทย (Krungthai Bank)</div>
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
                    <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 8 }}>QR Code ชำระเงิน PromptPay (ระบุยอดเงินให้อัตโนมัติ)</div>
                    <div style={{ background: '#ffffff', padding: 12, borderRadius: 18, border: '1.5px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                      <img
                        src={`https://promptpay.io/${PROMPTPAY_ID}/${feePaymentModal.amount}`}
                        alt="Dynamic PromptPay QR"
                        style={{ width: 210, height: 210, display: 'block', borderRadius: 8 }}
                        onError={e => { e.target.src = promptpayQrUrl; }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>พร้อมเพย์ (PromptPay): <strong style={{ color: '#0f172a' }}>095-418-1766</strong></div>
                    <div style={{ fontSize: 13.5, color: '#0f172a', fontWeight: 800, marginTop: 2 }}>ชื่อบัญชี: {PROMPTPAY_NAME}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>ธนาคารกรุงไทย (Krungthai Bank)</div>
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

      {/* Bulk Payment Modal */}
      {bulkPaymentModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBulkPaymentModal(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 16 }}>💳 ชำระเงินรวม ({selectedFineIds.length} รายการ)</span>
              <button onClick={() => setBulkPaymentModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
              {/* Summary List */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', width: '100%', fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>📋 รายการค่าปรับที่เลือก:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
                  {fines.filter(f => selectedFineIds.includes(f.id)).map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>{idx + 1}. {item.violation} ({item.date})</span>
                      <strong style={{ color: '#dc2626' }}>{item.amount} บ.</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Banner */}
              <div style={{ background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>ยอดชำระสุทธิรวมทั้งสิ้น</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#b45309' }}>
                  {fines.filter(f => selectedFineIds.includes(f.id)).reduce((sum, f) => sum + f.amount, 0)} บาท
                </div>
              </div>

              {/* Dynamic QR */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 8 }}>
                  QR Code ชำระเงินรวม (ระบุยอดเงินให้อัตโนมัติ)
                </div>
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 18, border: '1.5px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                  <img
                    src={`https://promptpay.io/${PROMPTPAY_ID}/${fines.filter(f => selectedFineIds.includes(f.id)).reduce((sum, f) => sum + f.amount, 0)}`}
                    alt="Bulk Dynamic PromptPay QR"
                    style={{ width: 210, height: 210, display: 'block', borderRadius: 8 }}
                    onError={e => { e.target.src = promptpayQrUrl; }}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>พร้อมเพย์ (PromptPay): <strong style={{ color: '#0f172a' }}>095-418-1766</strong></div>
                <div style={{ fontSize: 13.5, color: '#0f172a', fontWeight: 800, marginTop: 2 }}>ชื่อบัญชี: {PROMPTPAY_NAME}</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>ธนาคารกรุงไทย (Krungthai Bank)</div>
              </div>

              {/* Upload Input */}
              <div style={{ width: '100%' }}>
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '16px 20px',
                  border: '2px dashed #6366f1',
                  borderRadius: 14,
                  background: '#f5f3ff',
                  color: '#4f46e5',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 14
                }}>
                  <span style={{ fontSize: 24 }}>📤</span>
                  <span>คลิกเพื่ออัปโหลดสลิปใบเดียวจ่ายรวม</span>
                  <span style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.8 }}>สแน็ปสลิปที่โอนยอดรวม {fines.filter(f => selectedFineIds.includes(f.id)).reduce((sum, f) => sum + f.amount, 0)} บาท</span>
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
                      <span>✅ แนบสลิปเรียบร้อยแล้ว</span>
                    </div>
                    <img src={slipPreview} alt="bulk slip preview" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '2px solid #a5d6a7' }} />
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setBulkPaymentModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleUploadBulkSlip} disabled={!slipPreview || submitting}>
                {submitting ? (loadingStatus || 'กำลังตรวจสอบ...') : '📤 อัปโหลดและตรวจสลิปจ่ายรวม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
