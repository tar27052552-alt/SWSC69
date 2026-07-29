  const [cleanSchedules, setCleanSchedules] = useState([]);
  const [greetingSchedules, setGreetingSchedules] = useState([]);
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  const [dbDutySwaps, setDbDutySwaps] = useState([]);
  const [dbExemptNicknames, setDbExemptNicknames] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [conflictModal, setConflictModal] = useState(null);
  const [selectedSub, setSelectedSub] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [
          settingsRes,
          cleanRes,
          greetingRes
        ] = await Promise.all([
          supabase.from('attendance_settings').select('*'),
          supabase.from('schedules').select('*').eq('type', 'clean_room'),
          supabase.from('schedules').select('*').eq('type', 'greeting')
        ]);

        if (settingsRes.error) throw settingsRes.error;
        
        if (settingsRes.data) {
          const days = settingsRes.data.find(d => d.key === 'enabled_days')?.value;
          const dates = settingsRes.data.find(d => d.key === 'disabled_dates')?.value;
          const startD = settingsRes.data.find(d => d.key === 'start_date')?.value;
          const cleanStartD = settingsRes.data.find(d => d.key === 'clean_duty_start_date')?.value;
          const greetingStartD = settingsRes.data.find(d => d.key === 'greeting_duty_start_date')?.value;
          const checkInAct = settingsRes.data.find(d => d.key === 'check_in_active')?.value;
          const greetingAct = settingsRes.data.find(d => d.key === 'greeting_duty_active')?.value;
          const cleanAct = settingsRes.data.find(d => d.key === 'clean_duty_active')?.value;

          if (days) setEnabledDays(days);
          if (dates) setDisabledDates(dates);
          if (startD) setStartDate(startD);
          if (cleanStartD) setCleanDutyStartDate(cleanStartD);
          if (greetingStartD) setGreetingDutyStartDate(greetingStartD);
          if (checkInAct !== undefined) setCheckInActive(checkInAct !== 'false');
          if (greetingAct !== undefined) setGreetingActive(greetingAct !== 'false');
          if (cleanAct !== undefined) setCleanActive(cleanAct !== 'false');
        }

        if (!cleanRes.error && cleanRes.data) {
          setCleanSchedules(cleanRes.data);
        }
        if (!greetingRes.error && greetingRes.data) {
          setGreetingSchedules(greetingRes.data);
        }
      } catch (err) {
        console.error('Error loading settings/schedules:', err);
      }
    }
    loadData();
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

  const toggleCheckInActive = async () => {
    const nextVal = !checkInActive;
    setCheckInActive(nextVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'check_in_active', value: String(nextVal) }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error toggling check-in active state:', err);
    }
  };

  const toggleGreetingActive = async () => {
    const nextVal = !greetingActive;
    setGreetingActive(nextVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'greeting_duty_active', value: String(nextVal) }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error toggling greeting active state:', err);
    }
  };

  const toggleCleanActive = async () => {
    const nextVal = !cleanActive;
    setCleanActive(nextVal);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert([{ key: 'clean_duty_active', value: String(nextVal) }], { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('Error toggling clean active state:', err);
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
    loadExemptionsAndSwaps();

    const interval = setInterval(() => {
      loadAttendance();
      loadCleanChecks();
      loadGreetingChecks();
      loadExemptionsAndSwaps();
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

  useEffect(() => {
    if (isAdmin) loadConflictsData();
  }, [isAdmin]);

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
    const isExempt = dbExemptNicknames.includes(u.nickname);

    // 1. Check in database record
    const realRec = dbAttendance.find(d => String(d.user_id) === String(u.id) || d.nickname === u.nickname);
    if (realRec) {
      return {
        ...u,
        checkInStatus: (isExempt && realRec.status === 'missing') ? 'activity' : realRec.status,
        time: (isExempt && realRec.status === 'missing') ? 'ทำกิจกรรม' : realRec.time,
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
    if (isExempt) {
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

  const initForm = () => {
    setForm({ userId:'', violation: VIOLATION_TYPES[0], multiplier: 1, amount:20, date: todayStr, note:'' });
    setEditingFineId(null);
  };

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

    if (editingFineId) {
      const updatedFine = {
        user_id: String(member.id),
        user_name: member.name,
        nickname: member.nickname,
        violation: form.violation,
        amount: parseInt(form.amount),
        date: form.date,
        note: form.note,
        by: user?.nickname || 'ไม่ระบุ'
      };
      try {
        const { data, error } = await supabase
          .from('discipline_fines')
          .update(updatedFine)
          .eq('id', editingFineId)
          .select();
        if (error) throw error;
        if (data && data[0]) {
          const updated = {
            id: data[0].id,
            userId: data[0].user_id,
            userName: data[0].user_name,
            nickname: data[0].nickname,
            violation: data[0].violation,
            amount: data[0].amount,
            date: data[0].date,
            note: data[0].note,
            by: data[0].by,
            paid: data[0].paid,
            paymentStatus: data[0].payment_status || (data[0].paid ? 'paid' : 'unpaid'),
            paymentSlip: data[0].payment_slip || null
          };
          setFines(prev => prev.map(f => f.id === editingFineId ? updated : f));
          alert('แก้ไขข้อมูลค่าปรับเรียบร้อยแล้ว!');
        }
      } catch (err) {
        console.error('Error updating fine:', err);
        alert('เกิดข้อผิดพลาดในการแก้ไขความผิด: ' + err.message);
      }
      setModal(false);
      initForm();
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
          paid: data[0].paid,
          paymentStatus: data[0].payment_status || (data[0].paid ? 'paid' : 'unpaid'),
          paymentSlip: data[0].payment_slip || null
        };
        setFines(prev => [inserted, ...prev]);

        // Insert into notifications
        await supabase
          .from('notifications')
          .insert([{
            type: 'fine',
            message: `💸 บันทึกค่าปรับใหม่: "${inserted.userName} (${inserted.nickname})" - ${inserted.violation} จำนวน ${inserted.amount} บาท`
          }]);

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
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, fields, null, 'discipline_fines', [inserted.userId]); // สีแดงสำหรับค่าปรับ
      }
    } catch (err) {
      console.error('Error saving fine:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกความผิด: ' + err.message);
    }
    setModal(false); initForm();
  };

  const handleEditClick = (f) => {
    setEditingFineId(f.id);
    setForm({
      userId: f.userId,
      violation: f.violation,
      multiplier: 1,
      amount: f.amount,
      date: f.date,
      note: f.note || ''
    });
    setModal(true);
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