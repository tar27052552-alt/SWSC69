import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Award, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Download, ExternalLink, Eye, FileText, Plus, Printer, RefreshCw,
  RotateCcw, Save, Search, Settings, ShieldCheck, Trash2, Users, X, XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canManageDepartment } from '../lib/councilPermissions';
import { callRecruitment } from '../apply/recruitmentApi';
import ApplicationFormPrint from '../apply/ApplicationFormPrint';
import { LoadingOverlay, LoadingScreen } from '../apply/LoadingState';
import { loadMemberAttachmentPages } from '../apply/docPageRenderer';
import { calculateAge, formatThaiBirthDate } from '../apply/thaiDateUtils';
import {
  ACADEMIC_YEAR,
  CLASSROOMS,
  CLAUSE_14_ITEMS,
  DEFAULT_MIN_GPAX,
  DEFAULT_TARGET_MEMBERS,
  MEMBER_STATUS_META,
  PARTY_STATUS_META,
  REQUIRED_DOCS,
  getMemberCompleteness,
  hasOnlineGuardianConsent,
  validatePartySubmission,
} from '../apply/recruitmentConfig';
import './RecruitmentAdminPage.css';

function statusBadgeStyle(tone) {
  const map = {
    slate: { background: '#f1f5f9', color: '#475569' },
    amber: { background: '#fef3c7', color: '#b45309' },
    emerald: { background: '#d1fae5', color: '#047857' },
    rose: { background: '#ffe4e6', color: '#be123c' },
    red: { background: '#fee2e2', color: '#b91c1c' },
    purple: { background: '#f3e8ff', color: '#6b21a8' },
  };
  return {
    ...(map[tone] || map.slate),
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RecruitmentAdminPage() {
  const { isAdmin, user } = useAuth();
  const canManageRecruitment = isAdmin || canManageDepartment(user, 3);
  const [tab, setTab] = useState('parties'); // 'parties' | 'applicants' | 'settings'
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const [settings, setSettings] = useState(null);
  const [parties, setParties] = useState([]);
  const [members, setMembers] = useState([]);

  // Party tab state
  const [statusFilter, setStatusFilter] = useState('all');
  const [partySearch, setPartySearch] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState(null);
  const [memberFilter, setMemberFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'incomplete'
  const [partyReviewNote, setPartyReviewNote] = useState('');
  const [partyNumberInput, setPartyNumberInput] = useState('');

  // Applicants tab state
  const [appSearch, setAppSearch] = useState('');
  const [appRoom, setAppRoom] = useState('all');
  const [appStatus, setAppStatus] = useState('all');

  // Review Modal state
  const [reviewCtx, setReviewCtx] = useState(null); // { memberId, partyId, listIds }
  const [reviewDocKey, setReviewDocKey] = useState('grade');
  const [reviewDocUrls, setReviewDocUrls] = useState({}); // { grade: url, conduct: url, consent: url }
  const [reviewDocLoading, setReviewDocLoading] = useState(false);
  const [reviewPhoto, setReviewPhoto] = useState(null);
  const [reviewNoteDraft, setReviewNoteDraft] = useState('');
  const [clause14Draft, setClause14Draft] = useState({});

  // Official A4 Print state (reuses exact .docx template!)
  const [printApp, setPrintApp] = useState(null);
  const [printBusy, setPrintBusy] = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState(null);

  const applyOverviewData = useCallback((data) => {
    setSettings(data.settings);
    setParties(data.parties || []);
    setMembers(data.members || []);
    setSettingsForm({
      is_open: Boolean(data.settings?.is_open),
      allow_council_test: Boolean(data.settings?.allow_council_test),
      target_member_count: data.settings?.target_member_count ?? DEFAULT_TARGET_MEMBERS,
      min_gpax: data.settings?.min_gpax ?? DEFAULT_MIN_GPAX,
      max_per_special_room: data.settings?.max_per_special_room ?? '',
      max_per_classroom: data.settings?.max_per_classroom ?? '',
      open_at: toDatetimeLocal(data.settings?.open_at),
      deadline_at: toDatetimeLocal(data.settings?.deadline_at),
      publish_approved_parties: Boolean(data.settings?.publish_approved_parties),
      consent_template_url: data.settings?.consent_template_url || '',
      announcement_note: data.settings?.announcement_note || '',
      timeline: Array.isArray(data.settings?.timeline) ? data.settings.timeline : [],
    });
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callRecruitment({ action: 'admin_overview' });
      applyOverviewData(data);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [applyOverviewData]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    callRecruitment({ action: 'admin_overview' })
      .then((data) => {
        if (active) applyOverviewData(data);
      })
      .catch((err) => {
        if (active) setNotice({ type: 'error', text: err.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isAdmin, applyOverviewData]);

  const targetCount = Number(settings?.target_member_count || DEFAULT_TARGET_MEMBERS);
  const minGpax = Number(settings?.min_gpax ?? DEFAULT_MIN_GPAX);

  const partyById = useMemo(
    () => Object.fromEntries(parties.map((p) => [p.id, p])),
    [parties],
  );

  const membersByParty = useMemo(() => {
    const map = {};
    for (const m of members) {
      map[m.party_id] = map[m.party_id] || [];
      map[m.party_id].push(m);
    }
    return map;
  }, [members]);

  const kpi = useMemo(() => ({
    totalParties: parties.length,
    submittedParties: parties.filter((p) => p.status === 'submitted').length,
    approvedParties: parties.filter((p) => p.status === 'approved').length,
    totalMembers: members.length,
  }), [parties, members]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    return parties.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(p.party_name || '').toLowerCase().includes(q)
        || String(p.invite_code || '').toLowerCase().includes(q)
        || String(p.leader_email || '').toLowerCase().includes(q)
      );
    });
  }, [parties, statusFilter, partySearch]);

  const selectedParty = useMemo(
    () => parties.find((p) => p.id === selectedPartyId) || null,
    [parties, selectedPartyId],
  );
  const selectedMembers = useMemo(
    () => (selectedParty ? membersByParty[selectedParty.id] || [] : []),
    [selectedParty, membersByParty],
  );
  const selectedValidation = useMemo(
    () => (selectedParty ? validatePartySubmission(selectedParty, selectedMembers, settings || {}) : null),
    [selectedParty, selectedMembers, settings],
  );

  const filteredSelectedMembers = useMemo(() => {
    if (memberFilter === 'all') return selectedMembers;
    if (memberFilter === 'pending') return selectedMembers.filter((m) => m.member_status !== 'approved');
    if (memberFilter === 'approved') return selectedMembers.filter((m) => m.member_status === 'approved');
    if (memberFilter === 'incomplete') return selectedMembers.filter((m) => !getMemberCompleteness(m, minGpax).complete);
    return selectedMembers;
  }, [selectedMembers, memberFilter, minGpax]);

  const filteredApplicants = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (appRoom !== 'all' && m.classroom !== appRoom) return false;
      if (appStatus !== 'all' && m.member_status !== appStatus) return false;
      if (!q) return true;
      const partyName = partyById[m.party_id]?.party_name || '';
      return (
        String(m.full_name || '').toLowerCase().includes(q)
        || String(m.nickname || '').toLowerCase().includes(q)
        || String(m.student_id || '').toLowerCase().includes(q)
        || String(m.email || '').toLowerCase().includes(q)
        || partyName.toLowerCase().includes(q)
      );
    });
  }, [members, appSearch, appRoom, appStatus, partyById]);

  const selectParty = (party) => {
    setSelectedPartyId(party.id);
    setPartyReviewNote(party.review_note || '');
    setPartyNumberInput(party.party_number ?? '');
    setMemberFilter('all');
  };

  // Open All-in-One Member Review Modal
  const openReviewModal = useCallback((member, list = []) => {
    const listIds = list.length > 0 ? list.map((x) => x.id) : [member.id];
    setReviewDocLoading(true);
    setReviewDocUrls({});
    setReviewPhoto(null);
    setReviewCtx({ memberId: member.id, partyId: member.party_id, listIds });
    setReviewNoteDraft(member.review_note || '');
    setClause14Draft(member.clause14_checks && typeof member.clause14_checks === 'object' ? { ...member.clause14_checks } : {});
    setReviewDocKey('grade');
  }, []);

  const activeReviewMember = useMemo(
    () => (reviewCtx ? members.find((m) => m.id === reviewCtx.memberId) || null : null),
    [reviewCtx, members],
  );
  const activeReviewParty = useMemo(
    () => (activeReviewMember ? partyById[activeReviewMember.party_id] || null : null),
    [activeReviewMember, partyById],
  );

  // Auto-load 3 signed doc URLs & 1.5" student photo when Review Modal switches member
  useEffect(() => {
    if (!activeReviewMember) return undefined;
    let alive = true;

    const fetchDocs = Promise.all(
      REQUIRED_DOCS.map(async (doc) => {
        const path = activeReviewMember[doc.field];
        if (!path) return [doc.key, null];
        try {
          const res = await callRecruitment({ action: 'admin_get_doc_url', path });
          return [doc.key, res.signedUrl || null];
        } catch {
          return [doc.key, null];
        }
      }),
    );

    const fetchPhoto = callRecruitment({
      action: 'admin_get_student_photo',
      student_id: activeReviewMember.student_id,
      classroom: activeReviewMember.classroom,
      photo_path: activeReviewMember.photo_path || null,
    }).catch(() => ({ found: false }));

    Promise.all([fetchDocs, fetchPhoto]).then(([docEntries, photo]) => {
      if (!alive) return;
      setReviewDocUrls(Object.fromEntries(docEntries));
      setReviewPhoto(photo);
      setReviewDocLoading(false);
    });

    return () => { alive = false; };
  }, [activeReviewMember]);

  const navigateReview = (delta) => {
    if (!reviewCtx) return;
    const idx = reviewCtx.listIds.indexOf(reviewCtx.memberId);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= reviewCtx.listIds.length) return;
    const nextId = reviewCtx.listIds[nextIdx];
    const nextMember = members.find((m) => m.id === nextId);
    if (!nextMember) return;
    setReviewDocLoading(true);
    setReviewDocUrls({});
    setReviewPhoto(null);
    setReviewCtx({ ...reviewCtx, memberId: nextId, partyId: nextMember.party_id });
    setReviewNoteDraft(nextMember.review_note || '');
    setClause14Draft(nextMember.clause14_checks && typeof nextMember.clause14_checks === 'object' ? { ...nextMember.clause14_checks } : {});
  };

  const handleReviewMember = async (member, patch, { advanceNext = false } = {}) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await callRecruitment({
        action: 'admin_review_member',
        memberId: member.id,
        review_note: patch.review_note !== undefined ? patch.review_note : member.review_note || '',
        ...patch,
      });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? res.member : m)));
      setNotice({ type: 'success', text: `บันทึกผลการตรวจของ "${member.full_name || member.email}" แล้ว` });
      if (advanceNext) {
        navigateReview(1);
      }
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleBulkApproveMembers = async () => {
    if (!selectedParty) return;
    if (!window.confirm(`ยืนยันอนุมัติเอกสารและสถานะ "ผ่าน" ให้สมาชิกทั้ง ${selectedMembers.length} คนในพรรค "${selectedParty.party_name}" ใช่หรือไม่?`)) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await callRecruitment({ action: 'admin_bulk_approve_members', partyId: selectedParty.id });
      const updatedMap = Object.fromEntries((res.members || []).map((m) => [m.id, m]));
      setMembers((prev) => prev.map((m) => updatedMap[m.id] || m));
      setNotice({ type: 'success', text: `อนุมัติเอกสารผ่านครบทั้ง ${selectedMembers.length} คนในพรรค "${selectedParty.party_name}" แล้ว` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReviewParty = async (status) => {
    if (!selectedParty) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await callRecruitment({
        action: 'admin_review_party',
        partyId: selectedParty.id,
        status,
        review_note: partyReviewNote,
        party_number: partyNumberInput === '' ? null : Number(partyNumberInput),
      });
      setParties((prev) => prev.map((p) => (p.id === selectedParty.id ? res.party : p)));
      setNotice({ type: 'success', text: `อัปเดตสถานะพรรค "${selectedParty.party_name}" เป็น "${PARTY_STATUS_META[status]?.label || status}" แล้ว` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteParty = async (party) => {
    const count = (membersByParty[party.id] || []).length;
    if (!window.confirm(`ยืนยันลบพรรค "${party.party_name}" (สมาชิก ${count} คน) ออกจากระบบถาวรใช่หรือไม่?\nการลบไม่สามารถกู้คืนได้`)) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({ action: 'admin_delete_party', partyId: party.id });
      setParties((prev) => prev.filter((p) => p.id !== party.id));
      setMembers((prev) => prev.filter((m) => m.party_id !== party.id));
      if (selectedPartyId === party.id) setSelectedPartyId(null);
      setNotice({ type: 'info', text: `ลบพรรค "${party.party_name}" ออกจากระบบเรียบร้อยแล้ว` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Official A4 Printing (Application Form -> ปพ.6 -> ใบรับรองความประพฤติ)
  const handlePrintMember = async (member, party) => {
    setPrintBusy(member.id);
    try {
      const [photo, attachments] = await Promise.all([
        callRecruitment({
          action: 'admin_get_student_photo',
          student_id: member.student_id,
          classroom: member.classroom,
          photo_path: member.photo_path || null,
        }).catch(() => ({ found: false })),
        loadMemberAttachmentPages(member, { isAdmin: true }).catch(() => []),
      ]);
      setPrintApp({ mode: 'single', member, party, photoData: photo, attachments });
    } finally {
      setPrintBusy('');
    }
  };

  const handlePrintRoster = (party, list) => {
    setPrintApp({ mode: 'roster', party, members: list, targetCount });
  };

  const handlePrintBundle = async (party, list) => {
    setPrintBusy('bundle');
    try {
      const photoMap = {};
      const attachmentsMap = {};
      const chunkSize = 5;
      for (let i = 0; i < list.length; i += chunkSize) {
        const batch = list.slice(i, i + chunkSize);
        const results = await Promise.all(
          batch.map((m) =>
            Promise.all([
              callRecruitment({
                action: 'admin_get_student_photo',
                student_id: m.student_id,
                classroom: m.classroom,
                photo_path: m.photo_path || null,
              }).catch(() => ({ found: false })),
              loadMemberAttachmentPages(m, { isAdmin: true }).catch(() => []),
            ]),
          ),
        );
        batch.forEach((m, idx) => {
          photoMap[m.id] = results[idx][0];
          attachmentsMap[m.id] = results[idx][1];
        });
      }
      setPrintApp({ mode: 'bundle', party, members: list, photoMap, attachmentsMap, targetCount });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setPrintBusy('');
    }
  };

  const exportCsv = (targetParties = parties, filename = `recruitment_${ACADEMIC_YEAR}_all.csv`) => {
    const headers = [
      'หมายเลขพรรค', 'ชื่อพรรค', 'สถานะพรรค', 'ลำดับ', 'คำนำหน้า', 'ชื่อ-นามสกุล', 'ชื่อเล่น',
      'เลขประจำตัว', 'อีเมล', 'ห้องเรียน', 'แผนการเรียน', 'ห้องเรียนพิเศษ/ชมรม', 'GPAX',
      'ตำแหน่ง', 'เบอร์โทร', 'สถานะสมาชิก', 'หมายเหตุ คณะกรรมการสภานักเรียน',
    ];
    const rows = [];
    for (const p of targetParties) {
      const list = membersByParty[p.id] || [];
      list.forEach((m, idx) => {
        rows.push([
          p.party_number || '',
          p.party_name,
          PARTY_STATUS_META[p.status]?.label || p.status,
          idx + 1,
          m.prefix,
          m.full_name,
          m.nickname || '',
          m.student_id,
          m.email,
          m.classroom,
          m.study_plan || '',
          m.is_special_room ? (m.special_room_or_club || 'ห้องเรียนพิเศษ') : '-',
          m.gpax ?? '',
          m.position_label,
          m.phone,
          MEMBER_STATUS_META[m.member_status]?.label || m.member_status,
          m.review_note || '',
        ]);
      });
    }
    const csv = '\uFEFF' + [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settingsForm) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await callRecruitment({
        action: 'admin_update_settings',
        ...settingsForm,
        target_member_count: Number(settingsForm.target_member_count),
        min_gpax: Number(settingsForm.min_gpax),
        max_per_special_room: settingsForm.max_per_special_room === '' ? null : Number(settingsForm.max_per_special_room),
        max_per_classroom: settingsForm.max_per_classroom === '' ? null : Number(settingsForm.max_per_classroom),
        open_at: settingsForm.open_at ? new Date(settingsForm.open_at).toISOString() : null,
        deadline_at: settingsForm.deadline_at ? new Date(settingsForm.deadline_at).toISOString() : null,
      });
      setSettings(res.settings);
      setNotice({ type: 'success', text: 'บันทึกการตั้งค่าระบบรับสมัครเรียบร้อยแล้ว' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!canManageRecruitment) {
    return (
      <div className="rec-card" style={{ textAlign: 'center', padding: 48 }}>
        <AlertCircle size={38} color="#be123c" />
        <h2 style={{ margin: '12px 0 6px' }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
        <p style={{ color: '#64748b' }}>เฉพาะผู้ดูแลระบบ ประธานสภาฯ หรือฝ่ายวิชาการ เท่านั้นที่สามารถตรวจสอบใบสมัครและตั้งค่าระบบรับสมัครได้</p>
      </div>
    );
  }

  return (
    <div className="rec-admin">
      {/* Header */}
      <div className="rec-header">
        <div>
          <h1><ShieldCheck size={24} color="#6b21a8" /> ระบบจัดการรับสมัครคณะกรรมการสภานักเรียน ปี {ACADEMIC_YEAR}</h1>
          <p>คณะกรรมการสภานักเรียน • ตรวจเอกสาร 3 รายการ • อนุมัติรับรองพรรค • พิมพ์ใบสมัคร</p>
        </div>
        <div className="rec-header-actions">
          <button type="button" className="rec-btn rec-btn-outline" onClick={loadOverview} disabled={loading || busy}>
            <RefreshCw size={14} /> รีเฟรชข้อมูล
          </button>
          <button type="button" className="rec-btn rec-btn-gold" onClick={() => exportCsv(parties)} disabled={parties.length === 0}>
            <Download size={14} /> ส่งออก CSV ทั้งหมด
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="rec-kpi-grid">
        <div className="rec-kpi-card">
          <div>
            <div className="rec-kpi-val">{kpi.totalParties}</div>
            <div className="rec-kpi-lbl">พรรคทั้งหมดในระบบ</div>
          </div>
          <div className="rec-kpi-icon" style={{ background: '#f3e8ff', color: '#6b21a8' }}><Award size={20} /></div>
        </div>
        <div className="rec-kpi-card">
          <div>
            <div className="rec-kpi-val" style={{ color: '#d97706' }}>{kpi.submittedParties}</div>
            <div className="rec-kpi-lbl">รอ คณะกรรมการสภานักเรียน ตรวจรับรอง</div>
          </div>
          <div className="rec-kpi-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Clock size={20} /></div>
        </div>
        <div className="rec-kpi-card">
          <div>
            <div className="rec-kpi-val" style={{ color: '#059669' }}>{kpi.approvedParties}</div>
            <div className="rec-kpi-lbl">ผ่านการรับรองแล้ว</div>
          </div>
          <div className="rec-kpi-icon" style={{ background: '#d1fae5', color: '#047857' }}><CheckCircle2 size={20} /></div>
        </div>
        <div className="rec-kpi-card">
          <div>
            <div className="rec-kpi-val">{kpi.totalMembers}</div>
            <div className="rec-kpi-lbl">ผู้สมัครรวมทั้งหมด (คน)</div>
          </div>
          <div className="rec-kpi-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}><Users size={20} /></div>
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div className={`rec-notice rec-notice-${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3 Clear Tabs */}
      <div className="rec-tabs">
        <button type="button" className={`rec-tab ${tab === 'parties' ? 'active' : ''}`} onClick={() => setTab('parties')}>
          <Award size={15} /> 1. ตรวจพรรคผู้สมัคร ({parties.length})
        </button>
        <button type="button" className={`rec-tab ${tab === 'applicants' ? 'active' : ''}`} onClick={() => setTab('applicants')}>
          <Users size={15} /> 2. ค้นหานักเรียนทั้งหมด ({members.length})
        </button>
        <button type="button" className={`rec-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          <Settings size={15} /> 3. ตั้งค่าระบบ & ปฏิทินรับสมัคร
        </button>
      </div>

      {loading ? (
        <LoadingScreen
          title="กำลังโหลดข้อมูลระบบรับสมัคร..."
          subtitle="กำลังดึงรายชื่อพรรค สมาชิก และสถานะการตรวจสอบจากฐานข้อมูล"
          onRetry={loadOverview}
        />
      ) : (
        <>
          {/* ── TAB 1: PARTIES REVIEW ── */}
          {tab === 'parties' && (
            <div className="rec-split">
              {/* Left: Search & Party List */}
              <div className="rec-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      className="rec-input"
                      style={{ width: '100%', paddingLeft: 34 }}
                      placeholder="ค้นหาชื่อพรรค / รหัสเชิญ / อีเมลหัวหน้า..."
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                    />
                  </div>
                  <select className="rec-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">ทุกสถานะ ({parties.length})</option>
                    {Object.entries(PARTY_STATUS_META).map(([k, meta]) => (
                      <option key={k} value={k}>
                        {meta.label} ({parties.filter((p) => p.status === k).length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rec-party-list">
                  {filteredParties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13.5 }}>ไม่พบพรรคตามเงื่อนไข</div>
                  ) : filteredParties.map((p) => {
                    const list = membersByParty[p.id] || [];
                    const approvedCount = list.filter((m) => m.member_status === 'approved').length;
                    const meta = PARTY_STATUS_META[p.status] || { label: p.status, tone: 'slate' };
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`rec-party-item ${selectedPartyId === p.id ? 'active' : ''}`}
                        onClick={() => selectParty(p)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <strong style={{ fontSize: 14.5, color: '#1e0a2e' }}>
                            {p.party_number ? `เบอร์ ${p.party_number} • ` : ''}{p.party_name}
                          </strong>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {p.has_test_members && (
                              <span style={statusBadgeStyle('amber')}>โหมดทดลอง (สภา)</span>
                            )}
                            <span style={statusBadgeStyle(meta.tone)}>{meta.label}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>สมาชิก {list.length}/{targetCount} คน</span>
                          <span style={{ color: approvedCount === list.length && list.length > 0 ? '#047857' : '#64748b' }}>
                            ตรวจผ่าน {approvedCount}/{list.length}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                          รหัสเชิญ: <code>{p.invite_code}</code> • {p.leader_email}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Party Detail */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!selectedParty ? (
                  <div className="rec-card" style={{ textAlign: 'center', padding: 64, color: '#64748b' }}>
                    <Award size={36} color="#c084fc" style={{ marginBottom: 10 }} />
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1e0a2e', marginBottom: 4 }}>เลือกพรรคจากรายการด้านซ้ายเพื่อตรวจเอกสาร</div>
                    <div style={{ fontSize: 13.5 }}>สามารถพรีวิวเอกสาร พิมพ์ใบสมัคร A4 และอนุมัติรับรองได้ทันที</div>
                  </div>
                ) : (
                  <>
                    {/* Party Header & Actions */}
                    <div className="rec-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0, fontSize: 20, color: '#1e0a2e' }}>
                              {selectedParty.party_number ? `เบอร์ ${selectedParty.party_number} • ` : ''}{selectedParty.party_name}
                            </h2>
                            <span style={statusBadgeStyle(PARTY_STATUS_META[selectedParty.status]?.tone)}>
                              {PARTY_STATUS_META[selectedParty.status]?.label || selectedParty.status}
                            </span>
                            {selectedParty.has_test_members && (
                              <span style={statusBadgeStyle('amber')}>โหมดทดลอง (สภา)</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                            หัวหน้าพรรค: <strong>{selectedParty.leader_email}</strong> • รหัสเชิญ: <code>{selectedParty.invite_code}</code>
                          </div>
                          {selectedParty.slogan && <div style={{ fontSize: 13.5, color: '#4a1270', marginTop: 4 }}>“{selectedParty.slogan}”</div>}
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="rec-btn rec-btn-outline" onClick={() => handlePrintRoster(selectedParty, selectedMembers)}>
                            <Printer size={14} /> พิมพ์บัญชี 29 คน
                          </button>
                          <button
                            type="button"
                            className="rec-btn rec-btn-purple"
                            disabled={printBusy === 'bundle'}
                            onClick={() => handlePrintBundle(selectedParty, selectedMembers)}
                          >
                            <FileText size={14} /> {printBusy === 'bundle' ? 'กำลังดึงรูป...' : 'พิมพ์รวมเล่มทั้งพรรค'}
                          </button>
                          <button
                            type="button"
                            className="rec-btn rec-btn-outline"
                            onClick={() => exportCsv([selectedParty], `party_${selectedParty.party_name}_${ACADEMIC_YEAR}.csv`)}
                          >
                            <Download size={14} /> CSV พรรคนี้
                          </button>
                          <button
                            type="button"
                            className="rec-btn rec-btn-danger"
                            disabled={busy}
                            onClick={() => handleDeleteParty(selectedParty)}
                          >
                            <Trash2 size={14} /> ลบพรรค
                          </button>
                        </div>
                      </div>

                      {/* 5-point readiness summary */}
                      {selectedValidation && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
                          {selectedValidation.checks.map((c) => (
                            <div
                              key={c.key}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                fontSize: 12.5,
                                border: `1px solid ${c.ok ? '#bbf7d0' : '#fecdd3'}`,
                                background: c.ok ? '#f0fdf4' : '#fff1f2',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                              }}
                            >
                              {c.ok ? <CheckCircle2 size={15} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={15} color="#be123c" style={{ flexShrink: 0, marginTop: 2 }} />}
                              <div>
                                <div style={{ fontWeight: 700, color: '#18181b' }}>{c.label}</div>
                                <div style={{ color: '#475569' }}>{c.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Party Decision Controls */}
                      <div style={{ padding: 14, borderRadius: 14, background: '#faf5ff', border: '1px solid #e9dff2', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: '#4a1270' }}>หมายเลขพรรค:</label>
                            <input
                              type="number"
                              min="1"
                              className="rec-input"
                              style={{ width: 88 }}
                              placeholder="เบอร์"
                              value={partyNumberInput}
                              onChange={(e) => setPartyNumberInput(e.target.value)}
                            />
                          </div>
                          <input
                            className="rec-input"
                            style={{ flex: 1, minWidth: 220 }}
                            placeholder="หมายเหตุถึงพรรค (เช่น แจ้งให้แก้ไขเอกสารของสมาชิกคนใด)..."
                            value={partyReviewNote}
                            onChange={(e) => setPartyReviewNote(e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="rec-btn rec-btn-emerald" disabled={busy} onClick={() => handleReviewParty('approved')}>
                            <CheckCircle2 size={14} /> อนุมัติรับรองพรรค
                          </button>
                          <button type="button" className="rec-btn rec-btn-amber" disabled={busy} onClick={() => handleReviewParty('revision_requested')}>
                            <AlertCircle size={14} /> ส่งกลับให้แก้ไขเอกสาร
                          </button>
                          <button type="button" className="rec-btn rec-btn-outline" disabled={busy} onClick={() => handleReviewParty('draft')}>
                            <RotateCcw size={14} /> ปลดล็อกเป็นร่าง
                          </button>
                          <button type="button" className="rec-btn rec-btn-danger" disabled={busy} onClick={() => handleReviewParty('rejected')}>
                            <XCircle size={14} /> ไม่ผ่านการรับรอง
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Members Table */}
                    <div className="rec-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 16.5, color: '#1e0a2e' }}>
                            รายชื่อสมาชิกพรรค ({selectedMembers.length} / {targetCount} คน)
                          </h3>
                          <div style={{ fontSize: 12.5, color: '#64748b' }}>
                            กดปุ่ม <strong>“ตรวจเอกสาร”</strong> เพื่อเปิดพรีวิวเอกสาร 3 ชิ้นและกดไล่ตรวจทีละคนในหน้าเดียว
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select className="rec-input" style={{ padding: '6px 10px', fontSize: 12.5 }} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
                            <option value="all">แสดงทุกคน ({selectedMembers.length})</option>
                            <option value="pending">ยังไม่ผ่านตรวจ ({selectedMembers.filter((m) => m.member_status !== 'approved').length})</option>
                            <option value="approved">ตรวจผ่านแล้ว ({selectedMembers.filter((m) => m.member_status === 'approved').length})</option>
                            <option value="incomplete">ข้อมูล/เอกสารไม่ครบ ({selectedMembers.filter((m) => !getMemberCompleteness(m, minGpax).complete).length})</option>
                          </select>
                          <button
                            type="button"
                            className="rec-btn rec-btn-emerald rec-btn-sm"
                            disabled={busy || selectedMembers.length === 0}
                            onClick={handleBulkApproveMembers}
                          >
                            <CheckCheck size={14} /> อนุมัติผ่านทั้งหมดในพรรคนี้
                          </button>
                        </div>
                      </div>

                      <div className="rec-table-wrap">
                        <table className="rec-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>ชื่อ-นามสกุล / รหัส</th>
                              <th>ห้อง / GPAX</th>
                              <th>ตำแหน่ง</th>
                              <th>เอกสาร 3 ชิ้น</th>
                              <th>ผลตรวจ</th>
                              <th>จัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSelectedMembers.map((m, idx) => {
                              const stMeta = MEMBER_STATUS_META[m.member_status] || { label: m.member_status, tone: 'slate' };
                              return (
                                <tr key={m.id}>
                                  <td><strong>{idx + 1}</strong></td>
                                  <td>
                                    <div style={{ fontWeight: 700, color: '#1e0a2e' }}>
                                      {m.full_name ? `${m.prefix}${m.full_name}` : <span style={{ color: '#94a3b8' }}>ยังไม่กรอกชื่อ</span>}
                                      {m.is_leader && <span style={{ ...statusBadgeStyle('purple'), marginLeft: 6 }}>หัวหน้า</span>}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: '#64748b' }}>{m.student_id || '-'} • {m.email}</div>
                                    {m.review_note && <div style={{ fontSize: 11.5, color: '#be123c', marginTop: 2 }}>หมายเหตุ: {m.review_note}</div>}
                                  </td>
                                  <td>
                                    <div>{m.classroom || '-'}</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: Number(m.gpax) >= minGpax ? '#047857' : '#be123c' }}>
                                      GPAX {m.gpax !== null && m.gpax !== undefined ? Number(m.gpax).toFixed(2) : '-'}
                                    </div>
                                  </td>
                                  <td>{m.position_label}</td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      {REQUIRED_DOCS.map((doc) => {
                                        const hasFile = Boolean(m[doc.field]) || (doc.key === 'consent' && hasOnlineGuardianConsent(m));
                                        const docSt = m[doc.statusField] || 'pending';
                                        const tone = !hasFile ? 'rose' : docSt === 'approved' ? 'emerald' : docSt === 'revision_requested' ? 'amber' : 'slate';
                                        return (
                                          <span key={doc.key} style={statusBadgeStyle(tone)}>
                                            {!hasFile ? '✗' : docSt === 'approved' ? '✓' : '●'} {doc.shortLabel}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td><span style={statusBadgeStyle(stMeta.tone)}>{stMeta.label}</span></td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        className="rec-btn rec-btn-purple rec-btn-sm"
                                        onClick={() => openReviewModal(m, filteredSelectedMembers)}
                                      >
                                        <Eye size={13} /> ตรวจเอกสาร
                                      </button>
                                      <button
                                        type="button"
                                        className="rec-btn rec-btn-outline rec-btn-sm"
                                        disabled={printBusy === m.id}
                                        onClick={() => handlePrintMember(m, selectedParty)}
                                      >
                                        <Printer size={13} /> PDF
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card List (<= 768px) */}
                      <div className="rec-mobile-cards">
                        {filteredSelectedMembers.map((m, idx) => {
                          const stMeta = MEMBER_STATUS_META[m.member_status] || { label: m.member_status, tone: 'slate' };
                          return (
                            <div key={m.id} className="rec-mobile-card">
                              <div className="rec-mobile-card-head">
                                <div>
                                  <div style={{ fontWeight: 800, color: '#1e0a2e', fontSize: 14.5 }}>
                                    {idx + 1}. {m.full_name ? `${m.prefix}${m.full_name}` : m.email}
                                    {m.is_leader && <span style={{ ...statusBadgeStyle('purple'), marginLeft: 6 }}>หัวหน้า</span>}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {m.student_id || '-'} • {m.classroom || '-'} •{' '}
                                    <strong style={{ color: Number(m.gpax) >= minGpax ? '#047857' : '#be123c' }}>
                                      GPAX {m.gpax !== null && m.gpax !== undefined ? Number(m.gpax).toFixed(2) : '-'}
                                    </strong>
                                  </div>
                                  <div style={{ fontSize: 12.5, color: '#4a1270', fontWeight: 600, marginTop: 2 }}>{m.position_label}</div>
                                </div>
                                <span style={statusBadgeStyle(stMeta.tone)}>{stMeta.label}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {REQUIRED_DOCS.map((doc) => {
                                  const hasFile = Boolean(m[doc.field]) || (doc.key === 'consent' && hasOnlineGuardianConsent(m));
                                  const docSt = m[doc.statusField] || 'pending';
                                  const tone = !hasFile ? 'rose' : docSt === 'approved' ? 'emerald' : docSt === 'revision_requested' ? 'amber' : 'slate';
                                  return (
                                    <span key={doc.key} style={statusBadgeStyle(tone)}>
                                      {!hasFile ? '✗' : docSt === 'approved' ? '✓' : '●'} {doc.shortLabel}
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="rec-mobile-card-actions">
                                <button
                                  type="button"
                                  className="rec-btn rec-btn-purple"
                                  style={{ flex: 1 }}
                                  onClick={() => openReviewModal(m, filteredSelectedMembers)}
                                >
                                  <Eye size={14} /> ตรวจเอกสาร & ข้อ ๑๔
                                </button>
                                <button
                                  type="button"
                                  className="rec-btn rec-btn-outline"
                                  disabled={printBusy === m.id}
                                  onClick={() => handlePrintMember(m, selectedParty)}
                                >
                                  <Printer size={14} /> PDF
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: ALL APPLICANTS CROSS-PARTY SEARCH ── */}
          {tab === 'applicants' && (
            <div className="rec-card">
              <div className="rec-filter-bar">
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    className="rec-input"
                    style={{ width: '100%', paddingLeft: 34 }}
                    placeholder="ค้นหาชื่อ-สกุล, ชื่อเล่น, เลขประจำตัว, อีเมล, หรือชื่อพรรค..."
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                  />
                </div>
                <select className="rec-input" value={appRoom} onChange={(e) => setAppRoom(e.target.value)}>
                  <option value="all">ทุกห้องเรียน (ม.4/1–4/14)</option>
                  {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="rec-input" value={appStatus} onChange={(e) => setAppStatus(e.target.value)}>
                  <option value="all">ทุกสถานะการตรวจ</option>
                  {Object.entries(MEMBER_STATUS_META).map(([k, meta]) => (
                    <option key={k} value={k}>{meta.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                  พบ {filteredApplicants.length} คน
                </span>
              </div>

              <div className="rec-table-wrap">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>ชื่อ-นามสกุล / รหัส</th>
                      <th>ห้อง / GPAX</th>
                      <th>สังกัดพรรค</th>
                      <th>ตำแหน่ง</th>
                      <th>เอกสาร 3 ชิ้น</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplicants.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ไม่พบรายชื่อผู้สมัครตามคำค้นหา</td></tr>
                    ) : filteredApplicants.map((m) => {
                      const party = partyById[m.party_id];
                      const stMeta = MEMBER_STATUS_META[m.member_status] || { label: m.member_status, tone: 'slate' };
                      return (
                        <tr key={m.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#1e0a2e' }}>{m.full_name ? `${m.prefix}${m.full_name}` : m.email}</div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>{m.student_id || '-'} • {m.email}</div>
                          </td>
                          <td>
                            <div>{m.classroom || '-'}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: Number(m.gpax) >= minGpax ? '#047857' : '#be123c' }}>
                              GPAX {m.gpax !== null && m.gpax !== undefined ? Number(m.gpax).toFixed(2) : '-'}
                            </div>
                          </td>
                          <td><strong>{party?.party_name || '-'}</strong></td>
                          <td>{m.position_label}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {REQUIRED_DOCS.map((doc) => {
                                const hasFile = Boolean(m[doc.field]) || (doc.key === 'consent' && hasOnlineGuardianConsent(m));
                                return (
                                  <span key={doc.key} style={statusBadgeStyle(hasFile ? 'emerald' : 'rose')}>
                                    {hasFile ? '✓' : '✗'} {doc.shortLabel}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td><span style={statusBadgeStyle(stMeta.tone)}>{stMeta.label}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="rec-btn rec-btn-purple rec-btn-sm"
                                onClick={() => openReviewModal(m, filteredApplicants)}
                              >
                                <Eye size={13} /> ตรวจ
                              </button>
                              {party && (
                                <button
                                  type="button"
                                  className="rec-btn rec-btn-outline rec-btn-sm"
                                  disabled={printBusy === m.id}
                                  onClick={() => handlePrintMember(m, party)}
                                >
                                  <Printer size={13} /> PDF
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB 3: SETTINGS & TIMELINE ── */}
          {tab === 'settings' && settingsForm && (
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="rec-card">
                <h3 style={{ margin: '0 0 14px', fontSize: 16.5, color: '#1e0a2e' }}>การเปิด-ปิดระบบและเกณฑ์การรับสมัคร ปีการศึกษา {ACADEMIC_YEAR}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: '1.5px solid #e9dff2', background: '#faf5ff', cursor: 'pointer', fontWeight: 700 }}>
                    <input type="checkbox" checked={settingsForm.is_open} onChange={(e) => setSettingsForm({ ...settingsForm, is_open: e.target.checked })} />
                    เปิดรับสมัครออนไลน์
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: '1.5px solid #e9dff2', background: '#faf5ff', cursor: 'pointer', fontWeight: 700 }}>
                    <input type="checkbox" checked={settingsForm.publish_approved_parties} onChange={(e) => setSettingsForm({ ...settingsForm, publish_approved_parties: e.target.checked })} />
                    ประกาศรายชื่อพรรคที่ผ่านรับรองหน้าเว็บ
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, border: '1.5px solid #fde68a', background: '#fffbeb', cursor: 'pointer', gridColumn: '1 / -1' }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: 3 }}
                      checked={Boolean(settingsForm.allow_council_test)}
                      onChange={(e) => setSettingsForm({ ...settingsForm, allow_council_test: e.target.checked })}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#92400e' }}>เปิดให้เพื่อนสภาทดลองระบบ (Test Mode)</div>
                      <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                        อนุญาตให้คณะกรรมการสภา 29 คน + <code>swscsappha@sappha.ac.th</code> เข้าระบบทดลองสมัครและดึงรูปอัตโนมัติ (กดปิดก่อนเปิดรับสมัคร ม.4 จริงเพื่อล็อกเฉพาะ ม.4 100%)
                      </div>
                    </div>
                  </label>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>จำนวนสมาชิกต่อพรรค (คน)</label>
                    <input type="number" min="1" max="50" className="rec-input" style={{ width: '100%' }} value={settingsForm.target_member_count} onChange={(e) => setSettingsForm({ ...settingsForm, target_member_count: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>GPAX ขั้นต่ำ</label>
                    <input type="number" step="0.01" min="0" max="4" className="rec-input" style={{ width: '100%' }} value={settingsForm.min_gpax} onChange={(e) => setSettingsForm({ ...settingsForm, min_gpax: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>โควต้าสูงสุดต่อห้อง (เว้นว่าง = ไม่จำกัด)</label>
                    <input type="number" min="1" className="rec-input" style={{ width: '100%' }} value={settingsForm.max_per_classroom} onChange={(e) => setSettingsForm({ ...settingsForm, max_per_classroom: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>โควต้าห้องเรียนพิเศษ/ชมรม (เว้นว่าง = ไม่จำกัด)</label>
                    <input type="number" min="1" className="rec-input" style={{ width: '100%' }} value={settingsForm.max_per_special_room} onChange={(e) => setSettingsForm({ ...settingsForm, max_per_special_room: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>วัน-เวลาเปิดรับสมัคร</label>
                    <input type="datetime-local" className="rec-input" style={{ width: '100%' }} value={settingsForm.open_at} onChange={(e) => setSettingsForm({ ...settingsForm, open_at: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>วัน-เวลาปิดรับสมัคร</label>
                    <input type="datetime-local" className="rec-input" style={{ width: '100%' }} value={settingsForm.deadline_at} onChange={(e) => setSettingsForm({ ...settingsForm, deadline_at: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>ข้อความประกาศหน้าแรก (แสดงใต้หัวข้อหลัก)</label>
                    <input className="rec-input" style={{ width: '100%' }} placeholder="เช่น ขยายเวลารับสมัครถึงวันที่..." value={settingsForm.announcement_note} onChange={(e) => setSettingsForm({ ...settingsForm, announcement_note: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="rec-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16.5, color: '#1e0a2e' }}>ปฏิทินกำหนดการเลือกตั้ง</h3>
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline rec-btn-sm"
                    onClick={() => setSettingsForm({
                      ...settingsForm,
                      timeline: [...settingsForm.timeline, { step: settingsForm.timeline.length + 1, title: '', dateRange: '', description: '' }],
                    })}
                  >
                    <Plus size={14} /> เพิ่มขั้นตอน
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {settingsForm.timeline.map((item, idx) => (
                    <div key={idx} style={{ padding: 12, borderRadius: 12, border: '1px solid #e9dff2', background: '#fcfbff', display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: 8 }}>
                      <input
                        className="rec-input"
                        placeholder="ชื่อขั้นตอน"
                        value={item.title || ''}
                        onChange={(e) => {
                          const next = [...settingsForm.timeline];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setSettingsForm({ ...settingsForm, timeline: next });
                        }}
                      />
                      <input
                        className="rec-input"
                        placeholder="ช่วงวันที่"
                        value={item.dateRange || ''}
                        onChange={(e) => {
                          const next = [...settingsForm.timeline];
                          next[idx] = { ...next[idx], dateRange: e.target.value };
                          setSettingsForm({ ...settingsForm, timeline: next });
                        }}
                      />
                      <button
                        type="button"
                        className="rec-btn rec-btn-danger rec-btn-sm"
                        onClick={() => setSettingsForm({ ...settingsForm, timeline: settingsForm.timeline.filter((_, i) => i !== idx) })}
                      >
                        <Trash2 size={14} />
                      </button>
                      <input
                        className="rec-input"
                        style={{ gridColumn: '1 / -1' }}
                        placeholder="รายละเอียด"
                        value={item.description || ''}
                        onChange={(e) => {
                          const next = [...settingsForm.timeline];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setSettingsForm({ ...settingsForm, timeline: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button type="submit" className="rec-btn rec-btn-purple" disabled={busy}>
                  <Save size={15} /> บันทึกการตั้งค่าทั้งหมด
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* ── ALL-IN-ONE SPLIT-VIEW MEMBER REVIEW MODAL (iPad/Desktop 2-col + Mobile Full-screen Sheet) ── */}
      {activeReviewMember && reviewCtx && (() => {
        const curIdx = reviewCtx.listIds.indexOf(reviewCtx.memberId);
        const hasNext = curIdx < reviewCtx.listIds.length - 1;
        const activeDoc = REQUIRED_DOCS.find((d) => d.key === (reviewDocKey === 'clause14' ? 'grade' : reviewDocKey)) || REQUIRED_DOCS[0];
        const activeDocPath = activeReviewMember[activeDoc.field];
        const activeDocUrl = reviewDocUrls[activeDoc.key];
        const isPdf = String(activeDocPath || '').toLowerCase().endsWith('.pdf');
        const mobileShowsClause14 = reviewDocKey === 'clause14';

        const buildReviewPatch = () => ({
          clause14_checks: clause14Draft,
          member_status: clause14Draft.overall === 'pass'
            ? 'approved'
            : clause14Draft.overall === 'fail'
              ? 'revision_requested'
              : activeReviewMember.member_status,
          review_note: reviewNoteDraft,
        });

        return (
          <div className="rec-modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setReviewCtx(null); }}>
            <div className="rec-modal rec-modal-split">
              <div className="rec-modal-head">
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 16.5, color: '#1e0a2e' }}>
                    ตรวจใบสมัคร ({curIdx + 1}/{reviewCtx.listIds.length}) — {activeReviewMember.prefix}{activeReviewMember.full_name || activeReviewMember.email}
                  </strong>
                  <div style={{ fontSize: 12.5, color: '#64748b' }}>
                    พรรค {activeReviewParty?.party_name || '-'} • {activeReviewMember.position_label} • {activeReviewMember.classroom || '-'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {activeReviewParty && (
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline rec-btn-sm"
                      disabled={printBusy === activeReviewMember.id}
                      onClick={() => handlePrintMember(activeReviewMember, activeReviewParty)}
                    >
                      <Printer size={13} /> {printBusy === activeReviewMember.id ? 'กำลังเตรียม...' : 'พิมพ์ A4'}
                    </button>
                  )}
                  <button type="button" className="rec-btn rec-btn-outline rec-btn-sm" onClick={() => setReviewCtx(null)}>
                    <X size={15} /> ปิด
                  </button>
                </div>
              </div>

              {/* Mobile-only 2-pane switcher (hidden on iPad/Desktop >= 900px where both columns show side-by-side) */}
              <div className="rec-mobile-pane-tabs">
                <button
                  type="button"
                  className={`rec-btn rec-btn-sm ${!mobileShowsClause14 ? 'rec-btn-purple' : 'rec-btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setReviewDocKey(activeDoc.key)}
                >
                  1. เอกสาร & รูปถ่าย
                </button>
                <button
                  type="button"
                  className={`rec-btn rec-btn-sm ${mobileShowsClause14 ? 'rec-btn-purple' : 'rec-btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setReviewDocKey('clause14')}
                >
                  2. ติ๊กข้อ ๑๔ (8 ข้อ)
                </button>
              </div>

              <div className="rec-modal-split-body">
                {/* LEFT COLUMN: Compact Profile + 3-Doc Viewer */}
                <div className={`rec-review-docs-col ${mobileShowsClause14 ? 'hide-on-mobile' : ''}`}>
                  <div className="rec-review-profile-strip">
                    <div style={{ width: 56, height: 72, borderRadius: 8, border: '1.5px solid #4a1270', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: '#94a3b8', flexShrink: 0 }}>
                      {reviewPhoto?.found && reviewPhoto?.base64 ? (
                        <img src={`data:${reviewPhoto.mimeType || 'image/jpeg'};base64,${reviewPhoto.base64}`} alt="รูป 1.5 นิ้ว" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : 'ไม่มีรูป'}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.48, flex: 1, minWidth: 160 }}>
                      <div>
                        รหัส <strong>{activeReviewMember.student_id || '-'}</strong> • <strong>{activeReviewMember.classroom || '-'}</strong>{activeReviewMember.student_no ? ` เลขที่ ${activeReviewMember.student_no}` : ''} • ชื่อเล่น <strong>{activeReviewMember.nickname || '-'}</strong>
                      </div>
                      <div>
                        GPAX:{' '}
                        <strong style={{ color: Number(activeReviewMember.gpax) >= minGpax ? '#047857' : '#be123c' }}>
                          {activeReviewMember.gpax !== null && activeReviewMember.gpax !== undefined ? Number(activeReviewMember.gpax).toFixed(2) : '-'}
                        </strong>
                        {' '}• แผน: <strong>{activeReviewMember.study_plan || '-'}</strong>
                      </div>
                      <div style={{ color: '#64748b' }}>
                        โทร {activeReviewMember.phone || '-'} • วันเกิด {formatThaiBirthDate(activeReviewMember.birth_date) || '-'} {activeReviewMember.birth_date ? `(${calculateAge(activeReviewMember.birth_date)} ปี)` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Doc Switcher + Per-Doc Quick Approve/Revision */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {REQUIRED_DOCS.map((doc) => {
                        const hasFile = Boolean(activeReviewMember[doc.field])
                          || (doc.key === 'consent' && hasOnlineGuardianConsent(activeReviewMember));
                        const st = activeReviewMember[doc.statusField] || 'pending';
                        return (
                          <button
                            key={doc.key}
                            type="button"
                            className={`rec-btn rec-btn-sm ${activeDoc.key === doc.key ? 'rec-btn-purple' : 'rec-btn-outline'}`}
                            onClick={() => setReviewDocKey(doc.key)}
                          >
                            {!hasFile ? '✗' : st === 'approved' ? '✓' : '●'} {doc.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {activeDocUrl && (
                        <a href={activeDocUrl} target="_blank" rel="noopener noreferrer" className="rec-btn rec-btn-outline rec-btn-sm" style={{ textDecoration: 'none' }}>
                          <ExternalLink size={13} /> เต็มจอ
                        </a>
                      )}
                      <button
                        type="button"
                        className="rec-btn rec-btn-emerald rec-btn-sm"
                        disabled={busy || (!activeDocPath && !(activeDoc.key === 'consent' && hasOnlineGuardianConsent(activeReviewMember)))}
                        onClick={() => handleReviewMember(activeReviewMember, { [activeDoc.statusField]: 'approved', review_note: reviewNoteDraft })}
                      >
                        ✓ ผ่าน
                      </button>
                      <button
                        type="button"
                        className="rec-btn rec-btn-amber rec-btn-sm"
                        disabled={busy}
                        onClick={() => handleReviewMember(activeReviewMember, { [activeDoc.statusField]: 'revision_requested', member_status: 'revision_requested', review_note: reviewNoteDraft })}
                      >
                        ! ขอแก้
                      </button>
                    </div>
                  </div>

                  <div className="rec-doc-preview-frame">
                    {reviewDocLoading ? (
                      <div style={{ color: '#64748b', fontSize: 13.5 }}>กำลังโหลดพรีวิวเอกสาร...</div>
                    ) : activeDoc.key === 'consent' && !activeDocPath && hasOnlineGuardianConsent(activeReviewMember) ? (
                      <div style={{ width: '100%', padding: 18, background: '#fff', borderRadius: 12, textAlign: 'left', maxHeight: '100%', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e9dff2' }}>
                          <strong style={{ color: '#1e0a2e', fontSize: 14.5 }}>✓ คำยินยอมผู้ปกครอง (ลงนามออนไลน์)</strong>
                          <span style={{ fontSize: 11.5, color: '#047857', background: '#ecfdf5', padding: '2px 9px', borderRadius: 999, fontWeight: 700 }}>
                            {activeReviewMember.guardian_consent_signed_at
                              ? new Date(activeReviewMember.guardian_consent_signed_at).toLocaleString('th-TH')
                              : 'ลงนามแล้ว'}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.65, color: '#334155', marginBottom: 12 }}>
                          <div><strong>ผู้ปกครอง:</strong> {activeReviewMember.guardian_name} ({activeReviewMember.guardian_relation || 'ผู้ปกครอง'})</div>
                          <div><strong>เบอร์โทรผู้ปกครอง:</strong> {activeReviewMember.guardian_phone}</div>
                          {activeReviewMember.guardian_comment && (
                            <div><strong>ความคิดเห็น:</strong> {activeReviewMember.guardian_comment}</div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                          <div style={{ border: '1px solid #e9dff2', borderRadius: 10, padding: 10, textAlign: 'center', background: '#faf5ff' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a1270', marginBottom: 4 }}>ลายเซ็นผู้ปกครอง</div>
                            <img src={activeReviewMember.guardian_signature_data} alt="ลายเซ็นผู้ปกครอง" style={{ maxHeight: 74, maxWidth: '100%', objectFit: 'contain' }} />
                          </div>
                          {activeReviewMember.student_signature_data && (
                            <div style={{ border: '1px solid #e9dff2', borderRadius: 10, padding: 10, textAlign: 'center', background: '#faf5ff' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#4a1270', marginBottom: 4 }}>ลายเซ็นนักเรียนผู้สมัคร</div>
                              <img src={activeReviewMember.student_signature_data} alt="ลายเซ็นนักเรียน" style={{ maxHeight: 74, maxWidth: '100%', objectFit: 'contain' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : !activeDocPath || !activeDocUrl ? (
                      <div style={{ textAlign: 'center', color: '#be123c', padding: 24 }}>
                        <AlertCircle size={30} style={{ marginBottom: 8 }} />
                        <div style={{ fontWeight: 700 }}>ยังไม่ได้อัปโหลด {activeDoc.label}</div>
                      </div>
                    ) : isPdf ? (
                      <iframe src={activeDocUrl} title={activeDoc.label} />
                    ) : (
                      <img src={activeDocUrl} alt={activeDoc.label} />
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: Clause 14 (8 Items) + Note + Quick Approve/Revision (Always visible on iPad/Desktop!) */}
                <div className={`rec-review-c14-col ${!mobileShowsClause14 ? 'hide-on-mobile' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#1e0a2e', fontSize: 14.5 }}>ตรวจคุณสมบัติตามระเบียบข้อ ๑๔ (8 ข้อ)</strong>
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline rec-btn-sm"
                      onClick={() => setClause14Draft({
                        '1': 'pass', '2': 'pass', '3': 'pass', '4': 'pass',
                        '5': 'pass', '6': 'pass', '7': 'pass', '8': 'pass',
                        overall: 'pass',
                      })}
                    >
                      <CheckCheck size={14} /> ติ๊กผ่านครบ 8 ข้อ
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {CLAUSE_14_ITEMS.map((item) => {
                      const val = clause14Draft[item.key] || '';
                      return (
                        <div key={item.key} className="rec-c14-row">
                          <div style={{ fontSize: 12.5, color: '#1e0a2e', flex: 1, minWidth: 160, lineHeight: 1.35 }}>
                            <strong>({item.numThai})</strong> {item.text}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            <button
                              type="button"
                              className={`rec-btn rec-btn-sm ${val === 'pass' ? 'rec-btn-emerald' : 'rec-btn-outline'}`}
                              onClick={() => setClause14Draft((prev) => ({ ...prev, [item.key]: 'pass' }))}
                            >
                              ✓ ผ่าน
                            </button>
                            <button
                              type="button"
                              className={`rec-btn rec-btn-sm ${val === 'fail' ? 'rec-btn-danger' : 'rec-btn-outline'}`}
                              onClick={() => setClause14Draft((prev) => ({ ...prev, [item.key]: 'fail' }))}
                            >
                              ✗ ไม่ผ่าน
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="rec-c14-overall-box">
                      <strong style={{ fontSize: 13, color: '#4a1270' }}>สรุปรวมข้อ ๑๔</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`rec-btn rec-btn-sm ${clause14Draft.overall === 'pass' ? 'rec-btn-emerald' : 'rec-btn-outline'}`}
                          onClick={() => setClause14Draft((prev) => ({ ...prev, overall: 'pass' }))}
                        >
                          ✓ ผ่าน
                        </button>
                        <button
                          type="button"
                          className={`rec-btn rec-btn-sm ${clause14Draft.overall === 'fail' ? 'rec-btn-danger' : 'rec-btn-outline'}`}
                          onClick={() => setClause14Draft((prev) => ({ ...prev, overall: 'fail' }))}
                        >
                          ✗ ไม่ผ่าน
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#4a1270' }}>หมายเหตุถึงผู้สมัคร (ถ้าตีกลับแก้ไข)</label>
                    <textarea
                      rows={2}
                      className="rec-input"
                      placeholder="ระบุจุดที่ต้องแก้ไข เช่น รูป ปพ.6 ไม่ชัด..."
                      value={reviewNoteDraft}
                      onChange={(e) => setReviewNoteDraft(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="rec-btn rec-btn-emerald rec-btn-sm"
                        style={{ flex: 1 }}
                        disabled={busy}
                        onClick={() => {
                          const allPass = {
                            '1': 'pass', '2': 'pass', '3': 'pass', '4': 'pass',
                            '5': 'pass', '6': 'pass', '7': 'pass', '8': 'pass',
                            overall: 'pass',
                          };
                          setClause14Draft(allPass);
                          handleReviewMember(activeReviewMember, {
                            doc_grade_status: 'approved',
                            doc_conduct_status: 'approved',
                            doc_consent_status: 'approved',
                            member_status: 'approved',
                            clause14_checks: allPass,
                            review_note: reviewNoteDraft,
                          });
                        }}
                      >
                        <CheckCircle2 size={14} /> ผ่านครบทั้งหมด
                      </button>
                      <button
                        type="button"
                        className="rec-btn rec-btn-amber rec-btn-sm"
                        style={{ flex: 1 }}
                        disabled={busy}
                        onClick={() => handleReviewMember(activeReviewMember, {
                          member_status: 'revision_requested',
                          review_note: reviewNoteDraft,
                        })}
                      >
                        <AlertCircle size={14} /> ขอแก้ไข (ปลดล็อก)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rec-modal-foot">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="rec-btn rec-btn-outline rec-btn-sm" disabled={curIdx <= 0} onClick={() => navigateReview(-1)}>
                    <ChevronLeft size={15} /> ก่อนหน้า
                  </button>
                  <span style={statusBadgeStyle(MEMBER_STATUS_META[activeReviewMember.member_status]?.tone)}>
                    {MEMBER_STATUS_META[activeReviewMember.member_status]?.label || activeReviewMember.member_status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline"
                    disabled={busy}
                    onClick={() => handleReviewMember(activeReviewMember, buildReviewPatch())}
                  >
                    <Save size={14} /> บันทึก
                  </button>
                  {hasNext ? (
                    <button
                      type="button"
                      className="rec-btn rec-btn-purple"
                      disabled={busy}
                      onClick={() => handleReviewMember(activeReviewMember, buildReviewPatch(), { advanceNext: true })}
                    >
                      <Save size={14} /> บันทึกและไปคนถัดไป <ChevronRight size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rec-btn rec-btn-purple"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await handleReviewMember(activeReviewMember, buildReviewPatch());
                        if (ok) setReviewCtx(null);
                      }}
                    >
                      <CheckCircle2 size={14} /> บันทึกและเสร็จสิ้น
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── EXACT OFFICIAL A4 PRINT OVERLAY ── */}
      {printApp && (
        <ApplicationFormPrint
          mode={printApp.mode}
          member={printApp.member}
          party={printApp.party}
          members={printApp.members}
          photoData={printApp.photoData}
          photoMap={printApp.photoMap}
          attachments={printApp.attachments}
          attachmentsMap={printApp.attachmentsMap}
          targetCount={printApp.targetCount || targetCount}
          onClose={() => setPrintApp(null)}
        />
      )}

      <LoadingOverlay
        visible={Boolean(printBusy || busy)}
        title={
          printBusy === 'bundle'
            ? 'กำลังเตรียมชุดเอกสารรวมเล่มทั้งพรรค...'
            : printBusy
              ? 'กำลังเตรียมใบสมัครและไฟล์แนบสำหรับพิมพ์...'
              : 'กำลังบันทึกข้อมูล...'
        }
        subtitle={
          printBusy === 'bundle'
            ? 'กำลังดึงรูปและเอกสารแนบของสมาชิกทุกคน อาจใช้เวลาสักครู่'
            : 'กรุณารอสักครู่ อย่าเพิ่งปิดหน้าต่างนี้'
        }
      />
    </div>
  );
}
