import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Calendar, Camera,
  Check, CheckCircle2, Clock, Cloud, CloudOff, Copy, Edit3, Eye, FileText, Lock, LogIn,
  LogOut, Megaphone, PenTool, Plus, Printer, RefreshCw, Send, ShieldCheck, Trash2, Upload,
  UserPlus, Users, X,
} from 'lucide-react';
import { applySupabase as supabase } from './applySupabaseClient';
import PublicNavigation from '../portfolio/PublicNavigation';
import { callRecruitment, uploadRecruitmentDoc } from './recruitmentApi';
import ApplicationFormPrint, { InlineApplicationPreview } from './ApplicationFormPrint';
import { loadMemberAttachmentPages } from './docPageRenderer';
import GoogleSignInModal from './GoogleSignInModal';
import { LoadingOverlay, LoadingScreen } from './LoadingState';
import SignaturePad from './SignaturePad';
import { calculateAge } from './thaiDateUtils';
import {
  ACADEMIC_YEAR,
  ALLOWED_EMAIL_DOMAIN,
  DEFAULT_MIN_GPAX,
  DEFAULT_TARGET_MEMBERS,
  MEMBER_STATUS_META,
  PARTY_STATUS_META,
  POSITIONS,
  POSITION_MAP,
  QUALIFICATIONS_CLAUSE_21,
  REQUIRED_DOCS,
  extractStudentIdFromEmail,
  getMemberCompleteness,
  getStudyPlanConfig,
  hasOnlineGuardianConsent,
  isMemberSubmittedLocked,
  isValidSchoolEmail,
  resolveStudyPlan,
  validatePartySubmission,
} from './recruitmentConfig';

const RELIGION_OPTIONS = [
  'พุทธ',
  'อิสลาม',
  'คริสต์',
  'พราหมณ์-ฮินดู',
  'ซิกข์',
  'ไม่นับถือศาสนา',
  'อื่นๆ',
];

const EXPERIENCE_MAX_CHARS = 145;

function sanitizeGpaxInput(raw) {
  const cleaned = String(raw || '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx === -1) {
    const first = cleaned[0];
    if (Number(first) > 4) return '4';
    if (cleaned.length > 1) {
      const dec = cleaned.slice(1, 3);
      return first === '4' ? '4.00' : `${first}.${dec}`;
    }
    return first;
  }
  const intPart = cleaned.slice(0, dotIdx).slice(0, 1) || '0';
  const decPart = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 2);
  if (Number(intPart) > 4) return '4.00';
  if (intPart === '4' && Number(decPart || '0') > 0) return '4.00';
  return `${intPart}.${decPart}`;
}

function formatGpaxOnBlur(raw) {
  const cleaned = sanitizeGpaxInput(raw);
  if (!cleaned) return '';
  const num = Number(cleaned);
  if (Number.isNaN(num)) return '';
  return Math.min(4, Math.max(0, num)).toFixed(2);
}

function sanitizeExperienceTwoLines(raw) {
  const normalized = String(raw || '').replace(/\r\n?/g, '\n');
  const parts = normalized.split('\n');
  const limited = parts.length > 2 ? [parts[0], parts.slice(1).join(' ')] : parts;
  return limited.join('\n').slice(0, EXPERIENCE_MAX_CHARS);
}

function formatThaiPhoneInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatThaiShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function useCountdown(openAt, deadlineAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!openAt && !deadlineAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openAt, deadlineAt]);

  const openMs = openAt ? new Date(openAt).getTime() : null;
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : null;

  let phase = 'open';
  let targetMs = deadlineMs;
  if (openMs && now < openMs) {
    phase = 'upcoming';
    targetMs = openMs;
  } else if (deadlineMs && now >= deadlineMs) {
    return { phase: 'closed', expired: true, days: 0, hours: 0, mins: 0, secs: 0 };
  }

  if (!targetMs) return { phase: 'open', expired: false, days: 0, hours: 0, mins: 0, secs: 0, noTarget: true };
  const diff = Math.max(0, targetMs - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { phase, expired: false, days, hours, mins, secs };
}

function StatusPill({ status, map }) {
  const meta = map[status] || { label: status, tone: 'slate' };
  return <span className={`pill pill-${meta.tone}`}>{meta.label}</span>;
}

export default function ApplyApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [publicData, setPublicData] = useState(() => {
    try {
      const cached = sessionStorage.getItem('swsc_recruitment_settings_2570');
      if (cached) return { settings: JSON.parse(cached), approvedParties: [] };
    } catch {
      // ignore storage errors
    }
    return { settings: null, approvedParties: [] };
  });
  const [myState, setMyState] = useState(null);
  const [myStateError, setMyStateError] = useState('');
  const [showCreateParty, setShowCreateParty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const [viewMode, setViewMode] = useState('landing'); // 'landing' | 'workspace'
  const [workspaceTab, setWorkspaceTab] = useState('me'); // 'me' | 'party' | 'submit'
  const [wizardStep, setWizardStep] = useState(1); // 1: info, 2: sign, 3: docs, 4: review & submit
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const lastSyncedJsonRef = useRef('');
  const autosaveTimerRef = useRef(null);
  const wizardTopRef = useRef(null);
  const [printApp, setPrintApp] = useState(null); // { mode: 'single'|'roster'|'bundle', member, party, members, photoData, photoMap } | null
  const [showSignInModal, setShowSignInModal] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('join');
    if (fromUrl) {
      sessionStorage.setItem('swsc_join_code', fromUrl.trim().toUpperCase());
      return fromUrl.trim().toUpperCase();
    }
    return sessionStorage.getItem('swsc_join_code') || '';
  });

  const [createForm, setCreateForm] = useState({
    party_name: '',
    slogan: '',
    ideology: '',
    prefix: 'นาย',
    full_name: '',
    student_id: '',
    student_no: '',
    classroom: 'ม.4/1',
  });

  const [editingMember, setEditingMember] = useState(null);
  const [selfForm, setSelfForm] = useState(null);
  const [partyForm, setPartyForm] = useState(null);
  const [uploadingKey, setUploadingKey] = useState('');
  const [selfPhoto, setSelfPhoto] = useState(null);
  const [selfAttachments, setSelfAttachments] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState('');

  const settingsLoaded = Boolean(myState?.settings || publicData.settings);
  const settings = useMemo(
    () => myState?.settings || publicData.settings || {},
    [myState?.settings, publicData.settings],
  );
  const targetCount = Number(settings.target_member_count || DEFAULT_TARGET_MEMBERS);
  const minGpax = Number(settings.min_gpax ?? DEFAULT_MIN_GPAX);
  const allowedDomain = settings.allowed_email_domain || ALLOWED_EMAIL_DOMAIN;
  const countdown = useCountdown(settings.open_at, settings.deadline_at);
  const isUpcoming = settingsLoaded && Boolean(settings.is_open) && countdown?.phase === 'upcoming';
  const isRegOpen = settingsLoaded
    && Boolean(settings.is_open)
    && !countdown?.expired
    && (!isUpcoming || Boolean(myState?.isTestAccount));
  const openDateLabel = formatThaiShortDate(settings.open_at);
  const closeDateLabel = formatThaiShortDate(settings.deadline_at);

  const userEmail = String(session?.user?.email || '').trim().toLowerCase();
  const isSchoolUser = Boolean(session && isValidSchoolEmail(userEmail, allowedDomain));

  const showNotice = (type, text) => setNotice({ type, text });

  const loadPublic = useCallback(async () => {
    try {
      const data = await callRecruitment({ action: 'public_overview' }, { requireAuth: false });
      setPublicData(data);
      if (data?.settings) {
        try {
          sessionStorage.setItem('swsc_recruitment_settings_2570', JSON.stringify(data.settings));
        } catch {
          // ignore storage errors
        }
      }
    } catch (err) {
      console.error('loadPublic failed:', err);
    }
  }, []);

  const loadMyState = useCallback(async () => {
    setMyStateError('');
    try {
      const data = await callRecruitment({ action: 'my_state' }, { requireAuth: true });
      setMyState(data);
      if (data.eligibleStudent && !data.party) {
        setCreateForm((prev) => ({
          ...prev,
          prefix: data.eligibleStudent.prefix || prev.prefix,
          full_name: data.eligibleStudent.full_name || prev.full_name,
          student_id: data.eligibleStudent.student_id || prev.student_id,
          student_no: data.eligibleStudent.student_no ?? prev.student_no,
          classroom: data.eligibleStudent.classroom || prev.classroom,
        }));
      }
      if (data.myMember) {
        const resolvedRoom = data.myMember.classroom || data.eligibleStudent?.classroom || 'ม.4/1';
        const baseForm = {
          memberId: data.myMember.id,
          prefix: data.myMember.prefix || data.eligibleStudent?.prefix || 'นาย',
          full_name: data.myMember.full_name || data.eligibleStudent?.full_name || '',
          nickname: data.myMember.nickname || '',
          student_id: data.myMember.student_id || data.eligibleStudent?.student_id || extractStudentIdFromEmail(data.myMember.email),
          student_no: data.myMember.student_no ?? data.eligibleStudent?.student_no ?? '',
          classroom: resolvedRoom,
          study_plan: resolveStudyPlan(resolvedRoom, data.myMember.study_plan),
          birth_date: data.myMember.birth_date || '',
          nationality: data.myMember.nationality || 'ไทย',
          religion: data.myMember.religion || 'พุทธ',
          experience: data.myMember.experience || '',
          photo_path: '',
          is_special_room: Boolean(data.myMember.is_special_room),
          special_room_or_club: data.myMember.special_room_or_club || '',
          gpax: data.myMember.gpax !== null && data.myMember.gpax !== undefined ? Number(data.myMember.gpax).toFixed(2) : '',
          phone: formatThaiPhoneInput(data.myMember.phone || ''),
          position_key: data.myMember.position_key || 'academic',
          student_signature_data: data.myMember.student_signature_data || '',
          guardian_name: data.myMember.guardian_name || '',
          guardian_relation: data.myMember.guardian_relation || 'บิดา',
          guardian_phone: formatThaiPhoneInput(data.myMember.guardian_phone || ''),
          guardian_comment: data.myMember.guardian_comment || '',
          guardian_signature_data: data.myMember.guardian_signature_data || '',
        };
        const draftKey = `swsc_apply_draft_${data.myMember.id}`;
        let mergedForm = baseForm;
        if (isMemberSubmittedLocked(data.myMember)) {
          try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        } else {
          try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
              const parsed = JSON.parse(rawDraft);
              if (parsed && parsed.memberId === data.myMember.id) {
                mergedForm = {
                  ...baseForm,
                  ...parsed,
                  // Never let local draft overwrite officially locked identity fields
                  prefix: baseForm.prefix,
                  full_name: baseForm.full_name,
                  student_id: baseForm.student_id,
                  student_no: baseForm.student_no,
                  classroom: baseForm.classroom,
                  study_plan: getStudyPlanConfig(baseForm.classroom).locked
                    ? baseForm.study_plan
                    : (parsed.study_plan || baseForm.study_plan),
                };
              }
            }
          } catch {
            // ignore corrupt draft
          }
        }
        lastSyncedJsonRef.current = JSON.stringify(baseForm);
        setSelfForm(mergedForm);

        const sid = data.myMember.student_id || extractStudentIdFromEmail(data.myMember.email);
        const room = data.myMember.classroom || 'ม.4/1';
        if (sid || data.myMember.photo_path) {
          setPhotoLoading(true);
          callRecruitment({
            action: 'get_student_photo',
            memberId: data.myMember.id,
            student_id: sid,
            classroom: room,
            photo_path: data.myMember.photo_path || null,
          })
            .then((res) => setSelfPhoto(res))
            .catch(() => setSelfPhoto({ found: false }))
            .finally(() => setPhotoLoading(false));
        }
      }
      if (data.party) {
        setPartyForm({
          party_name: data.party.party_name || '',
          slogan: data.party.slogan || '',
          ideology: data.party.ideology || '',
          policies: Array.isArray(data.party.policies) && data.party.policies.length > 0
            ? data.party.policies
            : [{ title: '', detail: '' }],
        });
      }
    } catch (err) {
      setMyStateError(err.message || 'ไม่สามารถโหลดข้อมูลบัญชีได้ กรุณาลองใหม่อีกครั้ง');
      showNotice('error', err.message);
    }
  }, []);

  useEffect(() => {
    try { localStorage.removeItem('swsc_oauth_return'); } catch { /* ignore */ }
    let mounted = true;
    (async () => {
      setLoading(true);
      await loadPublic();
      const { data: { session: initial } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(initial);
      setAuthReady(true);
      if (initial && isValidSchoolEmail(initial.user?.email, ALLOWED_EMAIL_DOMAIN)) {
        setViewMode('workspace');
        setCreateForm((prev) => ({
          ...prev,
          full_name: prev.full_name || initial.user.user_metadata?.full_name || '',
          student_id: prev.student_id || extractStudentIdFromEmail(initial.user.email),
        }));
        await loadMyState();
      }
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession && isValidSchoolEmail(nextSession.user?.email, ALLOWED_EMAIL_DOMAIN)) {
        setViewMode('workspace');
        setCreateForm((prev) => ({
          ...prev,
          full_name: prev.full_name || nextSession.user.user_metadata?.full_name || '',
          student_id: prev.student_id || extractStudentIdFromEmail(nextSession.user.email),
        }));
        loadMyState();
      } else if (!nextSession) {
        setMyState(null);
        setViewMode('landing');
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadPublic, loadMyState]);

  const handleGoogleSignIn = () => {
    setNotice(null);
    setShowSignInModal(true);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMyState(null);
    setViewMode('landing');
    showNotice('info', 'ออกจากระบบเรียบร้อยแล้ว');
  };

  const party = myState?.party || null;
  const myMember = myState?.myMember || null;
  const members = useMemo(() => myState?.members || [], [myState?.members]);

  const moveMemberOrder = async (index, delta) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= members.length) return;
    const ids = members.map((m) => m.id);
    [ids[index], ids[nextIdx]] = [ids[nextIdx], ids[index]];
    setBusy(true);
    setNotice(null);
    try {
      const data = await callRecruitment({ action: 'reorder_members', orderedIds: ids });
      setMyState(data);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const isLeader = Boolean(myMember?.is_leader || (party && party.leader_auth_user_id === session?.user?.id));
  const isEditable = Boolean(party && ['draft', 'revision_requested'].includes(party.status));
  const isMyMemberLocked = isMemberSubmittedLocked(myMember);
  const canEditMyForm = Boolean(isEditable && !isMyMemberLocked);

  const liveMergedMember = useMemo(() => {
    if (!myMember) return null;
    if (!selfForm) return myMember;
    return {
      ...myMember,
      ...selfForm,
      position_label: POSITION_MAP[selfForm.position_key]?.label || myMember.position_label,
    };
  }, [myMember, selfForm]);

  const myCompleteness = useMemo(
    () => (liveMergedMember ? getMemberCompleteness(liveMergedMember, minGpax) : { complete: false, submitted: false, missing: [] }),
    [liveMergedMember, minGpax],
  );

  const step1Done = useMemo(() => {
    if (!selfForm) return false;
    const sp = getStudyPlanConfig(selfForm.classroom);
    const hasPlan = sp.locked ? Boolean(sp.fixedPlan) : Boolean(selfForm.study_plan);
    const gpaxNum = Number(selfForm.gpax);
    return hasPlan && Number.isFinite(gpaxNum) && gpaxNum >= minGpax && Boolean(POSITION_MAP[selfForm.position_key]);
  }, [selfForm, minGpax]);

  const step2Done = Boolean(selfForm?.student_signature_data && hasOnlineGuardianConsent(liveMergedMember));
  const step3Done = Boolean(myMember?.doc_grade_path && myMember?.doc_conduct_path);
  const step4Done = Boolean(isMyMemberLocked);

  const syncSelfFormToServer = useCallback(async (formSnapshot) => {
    if (!formSnapshot || !formSnapshot.memberId || !canEditMyForm) return true;
    const json = JSON.stringify(formSnapshot);
    if (json === lastSyncedJsonRef.current) return true;
    setSaveState('saving');
    try {
      const res = await callRecruitment({ action: 'upsert_member', ...formSnapshot });
      lastSyncedJsonRef.current = json;
      setMyState(res);
      setSaveState('saved');
      setLastSavedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, [canEditMyForm]);

  // Tier 1 (instant localStorage) + Tier 2 (debounced 1.5s Supabase autosave)
  useEffect(() => {
    if (!selfForm || !selfForm.memberId || !canEditMyForm) return undefined;
    try {
      localStorage.setItem(`swsc_apply_draft_${selfForm.memberId}`, JSON.stringify(selfForm));
    } catch {
      // ignore storage quota errors
    }
    const json = JSON.stringify(selfForm);
    if (json === lastSyncedJsonRef.current) return undefined;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      syncSelfFormToServer(selfForm);
    }, 1500);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [selfForm, canEditMyForm, syncSelfFormToServer]);

  const goToWizardStep = (nextStep) => {
    const clamped = Math.min(4, Math.max(1, nextStep));
    if (selfForm && canEditMyForm) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      syncSelfFormToServer(selfForm);
    }
    setWizardStep(clamped);
    wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmitMyApplication = async () => {
    if (!selfForm || !myMember) return;
    setBusy(true);
    setNotice(null);
    try {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const synced = await syncSelfFormToServer(selfForm);
      if (!synced) throw new Error('บันทึกข้อมูลล่าสุดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      const res = await callRecruitment({ action: 'submit_member' });
      try { localStorage.removeItem(`swsc_apply_draft_${myMember.id}`); } catch { /* ignore */ }
      setMyState(res);
      setSubmitConfirmOpen(false);
      setSaveState('saved');
      showNotice('success', 'ยืนยันและส่งใบสมัครส่วนตัวเรียบร้อยแล้ว! ใบสมัครของคุณถูกล็อกรอหัวหน้าพรรคยื่นส่งและ คณะกรรมการสภานักเรียน ตรวจสอบ');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const validation = useMemo(
    () => (party ? validatePartySubmission(party, members, settings) : null),
    [party, members, settings],
  );

  const handleCreateParty = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const data = await callRecruitment({
        action: 'create_party',
        ...createForm,
        policies: [],
      });
      setMyState(data);
      sessionStorage.removeItem('swsc_join_code');
      await loadMyState();
      setWorkspaceTab('party');
      showNotice('success', `สร้างพรรค "${data.party?.party_name}" เรียบร้อยแล้ว! คัดลอกลิงก์เชิญส่งให้เพื่อนอีก ${targetCount - 1} คนได้เลย`);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinParty = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({
        action: 'join_party',
        invite_code: joinCodeInput.trim().toUpperCase(),
      });
      sessionStorage.removeItem('swsc_join_code');
      await loadMyState();
      setWorkspaceTab('me');
      showNotice('success', 'เข้าร่วมพรรคเรียบร้อยแล้ว กรุณากรอกใบสมัครและอัปโหลดเอกสารทั้ง 3 รายการ');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDocUpload = async (memberId, docType, file) => {
    if (!file) return;
    setUploadingKey(`${memberId}:${docType}`);
    setNotice(null);
    try {
      const path = await uploadRecruitmentDoc({ memberId, docType, file });
      const target = members.find((m) => m.id === memberId) || myMember;
      const fieldName =
        docType === 'grade' ? 'doc_grade_path'
        : docType === 'conduct' ? 'doc_conduct_path'
        : docType === 'photo' ? 'photo_path'
        : 'doc_consent_path';
      await callRecruitment({
        action: 'upsert_member',
        memberId,
        prefix: target.prefix || 'นาย',
        full_name: target.full_name || '',
        nickname: target.nickname || '',
        student_id: target.student_id || '',
        classroom: target.classroom || '',
        study_plan: target.study_plan || '',
        birth_date: target.birth_date || null,
        nationality: target.nationality || 'ไทย',
        religion: target.religion || 'พุทธ',
        experience: target.experience || '',
        is_special_room: Boolean(target.is_special_room),
        special_room_or_club: target.special_room_or_club || '',
        gpax: target.gpax,
        phone: target.phone || '',
        position_key: target.position_key || 'academic',
        [fieldName]: path,
      });
      await loadMyState();
      showNotice('success', docType === 'photo' ? 'อัปโหลดรูปถ่าย 1.5 นิ้วเรียบร้อยแล้ว' : 'อัปโหลดเอกสารเรียบร้อยแล้ว');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setUploadingKey('');
    }
  };

  const handleViewDoc = async (memberId, path) => {
    try {
      const { signedUrl } = await callRecruitment({ action: 'get_doc_url', memberId, path });
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleSaveParty = async (e) => {
    e.preventDefault();
    if (!partyForm) return;
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({ action: 'update_party', ...partyForm });
      await loadMyState();
      showNotice('success', 'บันทึกข้อมูลและนโยบายพรรคเรียบร้อยแล้ว');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveModalMember = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({ action: 'upsert_member', ...editingMember });
      setEditingMember(null);
      await loadMyState();
      showNotice('success', editingMember.memberId ? 'อัปเดตข้อมูลสมาชิกแล้ว' : 'เพิ่มสมาชิกเข้าพรรคเรียบร้อยแล้ว');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (member) => {
    const label = member.id === myMember?.id
      ? 'คุณต้องการออกจากพรรคนี้ใช่หรือไม่?'
      : `ต้องการลบ "${member.full_name || member.email}" ออกจากพรรคใช่หรือไม่?`;
    if (!window.confirm(label)) return;
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({ action: 'remove_member', memberId: member.id });
      await loadMyState();
      showNotice('info', 'อัปเดตรายชื่อสมาชิกพรรคเรียบร้อยแล้ว');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!party) return;
    const ok = window.confirm(
      `ยืนยันลบพรรค "${party.party_name}" ใช่หรือไม่?\n\nการลบพรรคจะลบรายชื่อสมาชิกทั้งหมด (${members.length} คน) และเอกสารที่อัปโหลดไว้ในพรรคนี้ออกทั้งหมด และไม่สามารถกู้คืนได้`,
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await callRecruitment({ action: 'delete_party' });
      setMyState(data);
      setSelfForm(null);
      setPartyForm(null);
      setSelfPhoto(null);
      showNotice('info', `ลบพรรค "${party.party_name}" เรียบร้อยแล้ว คุณสามารถสร้างพรรคใหม่หรือเข้าร่วมพรรคอื่นได้ทันที`);
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitParty = async () => {
    if (!window.confirm(`ยืนยันส่งใบสมัครพรรค "${party?.party_name}" (ครบ ${targetCount} คน) ให้ คณะกรรมการสภานักเรียน ตรวจสอบใช่หรือไม่?\nหลังส่งแล้วจะแก้ไขไม่ได้จนกว่า คณะกรรมการสภานักเรียน จะส่งกลับให้แก้ไข`)) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await callRecruitment({ action: 'submit_party' });
      await loadMyState();
      showNotice('success', 'ส่งใบสมัครพรรคเรียบร้อยแล้ว! คณะกรรมการสภานักเรียน จะตรวจสอบคุณสมบัติและเอกสารของสมาชิกทุกคนต่อไป');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = async () => {
    if (!party?.invite_code) return;
    const link = `${window.location.origin}${import.meta.env.BASE_URL}apply/?join=${party.invite_code}&openExternalBrowser=1`;
    await navigator.clipboard.writeText(link);
    showNotice('success', `คัดลอกลิงก์เชิญพรรค (${party.invite_code}) แล้ว! ส่งให้เพื่อนในพรรคกดเข้าร่วมได้เลย`);
  };

  // Auto-load student's own attachments (ปพ.6 -> ใบรับรองความประพฤติ) for Step 4 inline preview & print
  useEffect(() => {
    if (!myMember?.id) return undefined;
    let alive = true;
    loadMemberAttachmentPages(myMember, { isAdmin: false })
      .then((pages) => {
        if (alive) setSelfAttachments(pages);
      })
      .catch(() => {
        if (alive) setSelfAttachments([]);
      });
    return () => { alive = false; };
  }, [myMember?.id, myMember?.doc_grade_path, myMember?.doc_conduct_path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenMyPrint = async () => {
    if (!myMember || !selfForm || !party) return;
    setPrintBusy('single');
    setNotice(null);
    try {
      const [photo, attachments] = await Promise.all([
        selfPhoto
          ? Promise.resolve(selfPhoto)
          : callRecruitment({
              action: 'get_student_photo',
              memberId: myMember.id,
              student_id: selfForm.student_id,
              classroom: selfForm.classroom,
              photo_path: selfForm.photo_path || null,
            }).catch(() => ({ found: false })),
        loadMemberAttachmentPages(myMember, { isAdmin: false }).catch(() => selfAttachments),
      ]);
      if (!selfPhoto) setSelfPhoto(photo);
      setSelfAttachments(attachments);
      setPrintApp({
        mode: 'single',
        member: {
          ...myMember,
          ...selfForm,
          position_label: POSITION_MAP[selfForm.position_key]?.label || myMember.position_label,
        },
        party,
        photoData: photo,
        attachments,
      });
    } finally {
      setPrintBusy('');
    }
  };

  const handleOpenRosterPrint = () => {
    if (!party) return;
    setPrintApp({
      mode: 'roster',
      party,
      members,
      targetCount,
    });
  };

  const handleOpenBundlePrint = async () => {
    if (!party) return;
    setPrintBusy('bundle');
    setNotice(null);
    try {
      const photoMap = {};
      const attachmentsMap = {};
      const chunkSize = 5;
      for (let i = 0; i < members.length; i += chunkSize) {
        const batch = members.slice(i, i + chunkSize);
        const results = await Promise.all(
          batch.map((m) =>
            Promise.all([
              callRecruitment({
                action: 'get_student_photo',
                memberId: m.id,
                student_id: m.student_id,
                classroom: m.classroom,
                photo_path: m.photo_path || null,
              }).catch(() => ({ found: false })),
              loadMemberAttachmentPages(m, { isAdmin: false }).catch(() => []),
            ]),
          ),
        );
        batch.forEach((m, idx) => {
          photoMap[m.id] = results[idx][0];
          attachmentsMap[m.id] = results[idx][1];
        });
      }
      setPrintApp({
        mode: 'bundle',
        party,
        members,
        photoMap,
        attachmentsMap,
        targetCount,
      });
    } catch (err) {
      showNotice('error', err.message || 'เตรียมชุดใบสมัครไม่สำเร็จ');
    } finally {
      setPrintBusy('');
    }
  };

  const homeUrl = `${import.meta.env.BASE_URL || '/'}`;
  const showCompactHeader = Boolean(session && viewMode === 'workspace' && isSchoolUser && myState?.eligible !== false);

  if (!authReady || (loading && !settingsLoaded)) {
    return (
      <div className="pf-public apply-root">
        <PublicNavigation activeHref="apply/" />
        <LoadingScreen
          fullscreen
          title="กำลังเข้าสู่ระบบรับสมัคร..."
          subtitle="กำลังตรวจสอบสถานะการรับสมัครและสิทธิ์การเข้าถึง กรุณารอสักครู่"
        />
      </div>
    );
  }

  return (
    <div className="pf-public apply-root">
      <PublicNavigation activeHref="apply/" />

      {/* ── Royal Hero Banner (full before login / landing) OR Compact Header (after login workspace) ── */}
      {showCompactHeader ? (
        <header className="apply-compact-hero">
          <div className="apply-compact-inner">
            <div className="apply-compact-user">
              <span className="apply-compact-name">
                {myMember?.full_name ? `${myMember.prefix}${myMember.full_name}` : userEmail}
              </span>
              {myMember?.classroom && (
                <span className="apply-compact-room">{myMember.classroom}</span>
              )}
              {myState?.isTestAccount && (
                <span className="apply-compact-test">ทดลอง</span>
              )}
            </div>
            <button
              type="button"
              className="apply-compact-btn"
              onClick={handleSignOut}
            >
              <LogOut size={13} /> ออก
            </button>
          </div>
        </header>
      ) : (
      <section className="apply-hero">
        <div className="apply-hero-inner">
          <img
            src={`${homeUrl}all-logos.png`}
            alt="ตราสัญลักษณ์โรงเรียนสรรพวิทยาคมและสภานักเรียน SWSC"
            className="apply-hero-logos"
          />
          <div className="apply-eyebrow">
            <Award size={14} /> SWSC · STUDENT COUNCIL {ACADEMIC_YEAR}
          </div>
          <h1>รับสมัครคณะกรรมการสภานักเรียน <span>ปีการศึกษา {ACADEMIC_YEAR}</span></h1>
          <p>
            เปิดรับสมัครนักเรียนชั้นมัธยมศึกษาปีที่ 4 รวมกลุ่มจัดตั้งพรรคครบ <strong>{targetCount} คน</strong> ตามโครงสร้าง 16 ตำแหน่ง
            อ้างอิงระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนฯ พ.ศ. 2561 (ฉบับแก้ไข พ.ศ. 2569)
          </p>

          <div className="apply-hero-cta">
            {!session ? (
              <button type="button" className="btn-gold" disabled={busy || loading} onClick={handleGoogleSignIn}>
                <LogIn size={17} /> เข้าสู่ระบบด้วย Gmail โรงเรียน (@{allowedDomain})
              </button>
            ) : isSchoolUser && myState?.eligible !== false ? (
              <button
                type="button"
                className="btn-gold"
                onClick={() => setViewMode(viewMode === 'workspace' ? 'landing' : 'workspace')}
              >
                <Users size={17} /> {viewMode === 'workspace' ? 'ดูเงื่อนไขและโครงสร้างการสมัคร' : 'เข้าสู่หน้าจัดการพรรคของฉัน'}
              </button>
            ) : (
              <button type="button" className="btn-gold" onClick={handleSignOut}>
                <LogOut size={17} /> เปลี่ยนบัญชีเป็น @{allowedDomain}
              </button>
            )}
          </div>

          <div className="apply-hero-meta">
            <span className={`apply-status-badge ${!settingsLoaded ? 'loading' : isUpcoming ? 'upcoming' : isRegOpen ? 'open' : 'closed'}`}>
              {!settingsLoaded
                ? '● กำลังตรวจสอบสถานะรับสมัคร...'
                : isUpcoming
                  ? `● เตรียมเปิดรับสมัคร (${openDateLabel}${closeDateLabel ? ` – ${closeDateLabel}` : ''})`
                  : isRegOpen
                    ? '● กำลังเปิดรับสมัคร'
                    : '● ปิดรับสมัครแล้ว'}
            </span>
            <span>เกณฑ์หลัก: <strong>ม.4</strong> • ครบ <strong>{targetCount} คน/พรรค</strong> • <strong>GPAX ≥ {minGpax.toFixed(2)}</strong></span>
            <span>เข้าสู่ระบบด้วย <strong>@{allowedDomain}</strong> (1 คน สังกัดได้ 1 พรรค)</span>
          </div>

          {settings.announcement_note && (
            <div style={{ marginTop: 12, padding: '8px 16px', borderRadius: 999, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: 13.5, color: '#92400e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Megaphone size={15} style={{ flexShrink: 0 }} />
              <span>{settings.announcement_note}</span>
            </div>
          )}

          {countdown && !countdown.expired && !countdown.noTarget && Boolean(settings.is_open ?? true) && (
            <div className="apply-countdown-wrap" aria-label={countdown.phase === 'upcoming' ? 'นับถอยหลังวันเปิดรับสมัคร' : 'นับถอยหลังวันปิดรับสมัคร'}>
              <div className="apply-countdown-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} style={{ flexShrink: 0 }} />
                <span>
                  {countdown.phase === 'upcoming'
                    ? `เหลืออีกกี่วันถึงจะเปิดรับสมัคร • เปิดรับ ${openDateLabel}${closeDateLabel ? ` – ${closeDateLabel}` : ''}`
                    : `เหลือเวลาปิดรับสมัคร • ปิดรับ ${closeDateLabel}`}
                </span>
              </div>
              <div className="apply-countdown">
                <div className="apply-countdown-box"><strong>{countdown.days}</strong><span>วัน</span></div>
                <div className="apply-countdown-box"><strong>{String(countdown.hours).padStart(2, '0')}</strong><span>ชั่วโมง</span></div>
                <div className="apply-countdown-box"><strong>{String(countdown.mins).padStart(2, '0')}</strong><span>นาที</span></div>
                <div className="apply-countdown-box"><strong>{String(countdown.secs).padStart(2, '0')}</strong><span>วินาที</span></div>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      <main className="apply-main">
        {/* Invite link banner when not logged in */}
        {!session && joinCodeInput && (
          <div className="apply-invite-banner">
            <div>
              <strong>คุณได้รับคำเชิญให้เข้าร่วมพรรค (รหัส: {joinCodeInput})</strong>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>
                กรุณาเข้าสู่ระบบด้วยอีเมลโรงเรียน <code>@{allowedDomain}</code> เพื่อเข้าร่วมพรรคและกรอกข้อมูลของคุณ
              </div>
            </div>
            <button type="button" className="btn-purple" onClick={handleGoogleSignIn}>
              <LogIn size={15} /> เข้าสู่ระบบเพื่อเข้าร่วมพรรค
            </button>
          </div>
        )}

        {/* Signed-in user bar (only shown when full hero is visible) */}
        {session && !showCompactHeader && (
          <div className="apply-user-strip">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
              <span className="pill pill-purple">เข้าสู่ระบบแล้ว</span>
              {myState?.isTestAccount && (
                <span className="pill pill-amber" title="บัญชีคณะกรรมการสภานักเรียนสำหรับทดลองระบบ">
                  โหมดทดลอง (สภา)
                </span>
              )}
              <strong style={{ color: '#2d1046' }}>{userEmail}</strong>
              {myState?.isTestAccount && myState?.eligibleStudent && (
                <span style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 10px', borderRadius: 999 }}>
                  จำลองเป็น ม.4: <strong>{myState.eligibleStudent.prefix}{myState.eligibleStudent.full_name}</strong> ({myState.eligibleStudent.student_id} • {myState.eligibleStudent.classroom})
                </span>
              )}
              {party && <span className="pill pill-amber">พรรค {party.party_name}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isSchoolUser && (
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '6px 14px', fontSize: 13 }}
                  onClick={() => setViewMode(viewMode === 'workspace' ? 'landing' : 'workspace')}
                >
                  {viewMode === 'workspace' ? 'ดูเงื่อนไข/โครงสร้าง' : 'ไปหน้าจัดการพรรค'}
                </button>
              )}
              <button type="button" className="btn-danger-soft" onClick={handleSignOut}>
                <LogOut size={14} /> ออกจากระบบ
              </button>
            </div>
          </div>
        )}

        {notice && (
          <div className={`notice-bar notice-${notice.type}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Wrong Email Domain Warning */}
        {authReady && session && !isSchoolUser && (
          <section className="apply-card" style={{ borderColor: '#fda4af', background: '#fff1f2' }}>
            <h2 className="apply-card-title" style={{ background: '#be123c' }}>
              <AlertCircle size={18} /> อีเมลนี้ไม่ใช่อีเมลโรงเรียนสรรพวิทยาคม
            </h2>
            <p className="apply-card-sub" style={{ color: '#881337' }}>
              คุณเข้าสู่ระบบด้วย <strong>{userEmail}</strong> — ระบบรับสมัครอนุญาตเฉพาะบัญชี <strong>@{allowedDomain}</strong> เท่านั้น
            </p>
            <button type="button" className="btn-purple" onClick={handleSignOut}>
              ออกจากระบบและเปลี่ยนบัญชีเป็น @{allowedDomain}
            </button>
          </section>
        )}

        {/* Not Eligible (Not in M.4 Roster) Warning */}
        {isSchoolUser && myState?.eligible === false && (
          <section className="apply-card" style={{ borderColor: '#fda4af', background: '#fff1f2' }}>
            <h2 className="apply-card-title" style={{ background: '#be123c' }}>
              <AlertCircle size={18} /> ไม่มีสิทธิลงสมัครรับเลือกตั้ง (เฉพาะนักเรียนชั้น ม.4 เท่านั้น)
            </h2>
            <p className="apply-card-sub" style={{ color: '#881337' }}>
              บัญชี <strong>{userEmail}</strong> ไม่อยู่ในรายชื่อนักเรียนชั้นมัธยมศึกษาปีที่ 4 โรงเรียนสรรพวิทยาคม ตามระเบียบข้อ 21 (5) จึงไม่สามารถสร้างพรรคหรือเข้าร่วมพรรคได้
            </p>
            <button type="button" className="btn-purple" onClick={handleSignOut}>
              <LogOut size={15} /> ออกจากระบบ / เปลี่ยนบัญชี Google
            </button>
          </section>
        )}

        {/* ── WORKSPACE VIEW (Authenticated @sappha.ac.th & Eligible M.4 ONLY) ── */}
        {isSchoolUser && myState?.eligible !== false && viewMode === 'workspace' && (
          !myState ? (
            <LoadingScreen
              title="กำลังตรวจสอบสิทธิ์และโหลดข้อมูลบัญชี..."
              subtitle="กำลังดึงข้อมูลพรรค ใบสมัคร และสถานะของคุณ"
              error={myStateError}
              onRetry={loadMyState}
            />
          ) : (
          <>
            {myState?.isTestAccount && isUpcoming && (
              <div className="apply-alert amber" style={{ marginBottom: 14 }}>
                <Clock size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>โหมดทดสอบคณะกรรมการสภานักเรียน:</strong> ขณะนี้ระบบยังไม่เปิดให้คนทั่วไปกรอกใบสมัคร (กำหนดเปิด {openDateLabel}) — คนอื่นจะเห็นเฉพาะหน้าจอรอเวลา แต่บัญชีสภานักเรียนสามารถทดสอบสร้างพรรค กรอกข้อมูล และส่งใบสมัครได้เต็มรูปแบบ
                </div>
              </div>
            )}

            {!party && !isRegOpen ? (
              <section className="apply-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', background: isUpcoming ? '#fef3c7' : '#ffe4e6', color: isUpcoming ? '#b45309' : '#be123c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={32} />
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#2d1046' }}>
                  {isUpcoming ? 'ยังไม่ถึงกำหนดเปิดรับสมัคร' : 'ปิดรับสมัครแล้วในขณะนี้'}
                </h2>
                <p style={{ margin: '0 auto 20px', maxWidth: 560, color: '#52525b', fontSize: 15, lineHeight: 1.7 }}>
                  {isUpcoming
                    ? `ระบบจะเปิดให้สร้างพรรคและกรอกใบสมัครตั้งแต่วันที่ ${openDateLabel}${closeDateLabel ? ` ถึง ${closeDateLabel}` : ''} กรุณารอเวลาเปิดรับสมัครอย่างเป็นทางการ`
                    : 'ขณะนี้พ้นกำหนดระยะเวลาเปิดรับสมัครคณะกรรมการสภานักเรียนแล้ว ไม่สามารถสร้างพรรคหรือกรอกข้อมูลเพิ่มเติมได้'}
                </p>
                {isUpcoming && countdown && !countdown.expired && (
                  <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 22 }}>
                    {[
                      { val: countdown.days, label: 'วัน' },
                      { val: countdown.hours, label: 'ชั่วโมง' },
                      { val: countdown.mins, label: 'นาที' },
                      { val: countdown.secs, label: 'วินาที' },
                    ].map((unit) => (
                      <div key={unit.label} style={{ minWidth: 74, padding: '12px 14px', borderRadius: 14, background: '#faf5ff', border: '1px solid #e9dff2' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#4a1270', lineHeight: 1.1 }}>
                          {String(unit.val ?? 0).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{unit.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-purple" onClick={() => setViewMode('landing')}>
                    ดูกำหนดการและรายละเอียดการรับสมัคร
                  </button>
                  <button type="button" className="btn-outline" onClick={handleSignOut}>
                    <LogOut size={15} /> ออกจากระบบ
                  </button>
                </div>
              </section>
            ) : !party ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680, margin: '0 auto' }}>
                {/* Primary Card: Join Party (28 of 29 members) */}
                <section className="apply-card" style={{ borderColor: '#d8b4fe', boxShadow: '0 10px 30px rgba(74, 18, 112, 0.08)' }}>
                  <h2 className="apply-card-title"><UserPlus size={18} /> เข้าร่วมพรรคด้วยรหัสเชิญ</h2>
                  <p className="apply-card-sub">
                    หากหัวหน้าพรรคสร้างพรรคไว้แล้ว กรอกรหัสเชิญ (เช่น <code>SW70-XXXXXXXX</code>) หรือกดผ่านลิงก์เชิญจากหัวหน้าพรรคเพื่อเข้ากรอกใบสมัครของคุณ
                  </p>
                  <form onSubmit={handleJoinParty} className="form-grid">
                    <div className="form-field full">
                      <label>รหัสเชิญเข้าร่วมพรรค *</label>
                      <input
                        required
                        placeholder="SW70-XXXXXXXX"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        style={{ fontWeight: 700, fontSize: 16, letterSpacing: '1.2px', textTransform: 'uppercase' }}
                      />
                    </div>
                    <div className="form-field full">
                      <button type="submit" className="btn-purple" disabled={busy || !isRegOpen} style={{ width: '100%', justifyContent: 'center', padding: '12px 18px', fontSize: 15 }}>
                        <UserPlus size={17} /> เข้าร่วมพรรค
                      </button>
                    </div>
                  </form>
                  <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: '#faf5ff', fontSize: 13.5, color: '#52525b' }}>
                    <strong>หมายเหตุ:</strong> ขอรับ <strong>ลิงก์เชิญ</strong> หรือ <strong>รหัสเชิญ</strong> จากหัวหน้าพรรคของคุณ (1 บัญชี <code>@{allowedDomain}</code> สามารถสังกัดได้เพียง 1 พรรคเท่านั้น)
                  </div>
                </section>

                {/* Secondary Collapsible Card: Create Party (Leader ONLY) */}
                <section className="apply-card" style={{ borderStyle: showCreateParty ? 'solid' : 'dashed', borderColor: '#e2d9ee', background: showCreateParty ? '#ffffff' : '#fcfaff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15.5, color: '#2d1046', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Plus size={17} style={{ color: '#b45309' }} /> สร้างพรรคใหม่ (สำหรับหัวหน้าพรรคเท่านั้น)
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                        เฉพาะผู้สมัครตำแหน่งหัวหน้าพรรค 1 คนต่อพรรค เพื่อสร้างพรรคและรับลิงก์เชิญเพื่อนอีก {targetCount - 1} คน
                      </div>
                    </div>
                    <button
                      type="button"
                      className={showCreateParty ? 'btn-outline' : 'btn-gold'}
                      onClick={() => setShowCreateParty((prev) => !prev)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {showCreateParty ? 'ซ่อนฟอร์มสร้างพรรค' : 'ฉันเป็นหัวหน้าพรรค — สร้างพรรคใหม่'}
                    </button>
                  </div>

                  {showCreateParty && (
                    <form onSubmit={handleCreateParty} className="form-grid" style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #f1e9f9' }}>
                      <div className="form-field full">
                        <label>ชื่อพรรค *</label>
                        <input
                          required
                          placeholder="เช่น พรรคสรรพวิทย์ก้าวหน้า"
                          value={createForm.party_name}
                          onChange={(e) => setCreateForm({ ...createForm, party_name: e.target.value })}
                        />
                      </div>
                      <div className="form-field full">
                        <label>สโลแกนพรรค</label>
                        <input
                          placeholder="สโลแกนสั้นๆ ประจำพรรค"
                          value={createForm.slogan}
                          onChange={(e) => setCreateForm({ ...createForm, slogan: e.target.value })}
                        />
                      </div>
                      <div className="form-field full">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#6b21a8', background: '#faf5ff', border: '1px solid #e9dff2', borderRadius: 10, padding: '8px 12px' }}>
                          <Lock size={14} /> ข้อมูลหัวหน้าพรรคด้านล่างดึงจากรายชื่อ ม.4 ของโรงเรียนอัตโนมัติ (ไม่สามารถแก้ไขได้)
                        </div>
                      </div>
                      <div className="form-field">
                        <label>คำนำหน้า (ล็อกตามรายชื่อ)</label>
                        <input readOnly disabled value={createForm.prefix} />
                      </div>
                      <div className="form-field">
                        <label>ชื่อ-นามสกุล (ล็อกตามรายชื่อ)</label>
                        <input readOnly disabled value={createForm.full_name} />
                      </div>
                      <div className="form-field">
                        <label>เลขประจำตัวนักเรียน (ล็อกตามรายชื่อ)</label>
                        <input readOnly disabled value={createForm.student_id} />
                      </div>
                      <div className="form-field">
                        <label>ชั้น / ห้อง / เลขที่ (ล็อกตามรายชื่อ)</label>
                        <input readOnly disabled value={`${createForm.classroom}${createForm.student_no ? ` เลขที่ ${createForm.student_no}` : ''}`} />
                      </div>
                      <div className="form-field full">
                        <button type="submit" className="btn-gold" disabled={busy || !isRegOpen}>
                          <Plus size={16} /> สร้างพรรคและรับลิงก์เชิญสมาชิก
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              </div>
            ) : (
              <>
                {/* Party Header Summary Card */}
                <section className="apply-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                        <h2 style={{ margin: 0, fontSize: 22, color: '#2d1046' }}>
                          {party.party_number ? `เบอร์ ${party.party_number} • ` : ''}{party.party_name}
                        </h2>
                        <StatusPill status={party.status} map={PARTY_STATUS_META} />
                        {isLeader && <span className="pill pill-purple">หัวหน้าพรรค</span>}
                      </div>
                      {party.slogan && <div style={{ color: '#52525b', fontSize: 14.5 }}>“{party.slogan}”</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" className="btn-outline" onClick={loadMyState} disabled={busy}>
                        <RefreshCw size={14} /> รีเฟรชสถานะ
                      </button>
                      {isLeader && isEditable && (
                        <button type="button" className="btn-danger-soft" onClick={handleDeleteParty} disabled={busy}>
                          <Trash2 size={14} /> ลบพรรคนี้
                        </button>
                      )}
                    </div>
                  </div>

                  {party.review_note && (
                    <div className="notice-bar notice-error" style={{ marginTop: 14, marginBottom: 0 }}>
                      <span><strong>ความเห็นจาก คณะกรรมการสภานักเรียน:</strong> {party.review_note}</span>
                    </div>
                  )}

                  <div className="invite-box" style={{ marginTop: 16 }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: '#52525b', fontWeight: 700 }}>รหัสเชิญสมาชิกเข้าร่วมพรรค</div>
                      <div className="invite-code">{party.invite_code}</div>
                    </div>
                    <button type="button" className="btn-gold" onClick={copyInviteLink}>
                      <Copy size={15} /> คัดลอกลิงก์เชิญเพื่อนเข้าพรรค
                    </button>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>
                      <span>ความคืบหน้าสมาชิกพรรค</span>
                      <span>{members.length} / {targetCount} คน</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${Math.min(100, (members.length / targetCount) * 100)}%` }} />
                    </div>
                  </div>
                </section>

                {/* 3 Clear Workspace Tabs */}
                <div className="apply-tabs">
                  <button type="button" className={`apply-tab ${workspaceTab === 'me' ? 'active' : ''}`} onClick={() => setWorkspaceTab('me')}>
                    <FileText size={16} />
                    <span>ใบสมัครของฉัน{isMyMemberLocked ? ' ✓' : ''}</span>
                  </button>
                  <button type="button" className={`apply-tab ${workspaceTab === 'party' ? 'active' : ''}`} onClick={() => setWorkspaceTab('party')}>
                    <Users size={16} />
                    <span>สมาชิกพรรค ({members.length}/{targetCount})</span>
                  </button>
                  <button type="button" className={`apply-tab ${workspaceTab === 'submit' ? 'active' : ''}`} onClick={() => setWorkspaceTab('submit')}>
                    <Send size={16} />
                    <span>{isLeader ? 'ส่งพรรค / PDF' : 'พิมพ์รวมเล่ม'}</span>
                  </button>
                </div>

                {/* ── TAB 1: PARTY INFO, INVITE & 29-MEMBER ROSTER ── */}
                {workspaceTab === 'party' && (
                  <>
                    <section className="apply-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                          <h3 className="apply-card-title" style={{ marginBottom: 4 }}>รายชื่อสมาชิกพรรค ({members.length} / {targetCount} คน)</h3>
                          <p className="apply-card-sub" style={{ margin: 0 }}>
                            {isLeader
                              ? 'แชร์ลิงก์เชิญหรือรหัสเชิญให้เพื่อนกดเข้าร่วมพรรคด้วยตนเอง • หัวหน้าพรรคสามารถช่วยแก้ไขข้อมูล/จัดลำดับ 1–29 และลบสมาชิกได้'
                              : 'รายชื่อสมาชิกทั้งหมดในพรรค (หากมีข้อมูลผิดพลาด สามารถแจ้งหัวหน้าพรรคหรือแก้ไขของตัวเองในแท็บที่ 2 ได้)'}
                          </p>
                        </div>
                      </div>

                      <div className="table-wrap apply-members-desktop-table">
                        <table className="apply-table">
                          <thead>
                            <tr>
                              <th>ลำดับ</th>
                              <th>ชื่อ-นามสกุล / อีเมล</th>
                              <th>ห้อง / GPAX</th>
                              <th>ตำแหน่ง</th>
                              <th>เอกสาร 3 ชิ้น</th>
                              <th>สถานะ คณะกรรมการสภานักเรียน</th>
                              <th>จัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((m, idx) => {
                              const comp = getMemberCompleteness(m, minGpax);
                              return (
                                <tr key={m.id}>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <strong>{idx + 1}</strong>
                                      {isLeader && isEditable && (
                                        <span style={{ display: 'inline-flex', gap: 2 }}>
                                          <button
                                            type="button"
                                            className="btn-outline"
                                            title="เลื่อนขึ้น"
                                            disabled={busy || idx === 0}
                                            style={{ padding: '2px 5px', borderRadius: 6 }}
                                            onClick={() => moveMemberOrder(idx, -1)}
                                          >
                                            <ArrowUp size={12} />
                                          </button>
                                          <button
                                            type="button"
                                            className="btn-outline"
                                            title="เลื่อนลง"
                                            disabled={busy || idx === members.length - 1}
                                            style={{ padding: '2px 5px', borderRadius: 6 }}
                                            onClick={() => moveMemberOrder(idx, 1)}
                                          >
                                            <ArrowDown size={12} />
                                          </button>
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 700 }}>
                                      {m.full_name ? `${m.prefix}${m.full_name}` : <span style={{ color: '#9ca3af' }}>ยังไม่กรอกชื่อ</span>}
                                      {m.is_leader && <span className="pill pill-purple" style={{ marginLeft: 6 }}>หัวหน้าพรรค</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#52525b' }}>{m.email} {m.student_id ? `• ${m.student_id}` : ''}</div>
                                    {m.review_note && <div style={{ fontSize: 12, color: '#be123c', marginTop: 2 }}>หมายเหตุ: {m.review_note}</div>}
                                  </td>
                                  <td>
                                    <div>{m.classroom || '-'}</div>
                                    <div style={{ fontSize: 12, color: Number(m.gpax) >= minGpax ? '#047857' : '#be123c', fontWeight: 700 }}>
                                      GPAX: {m.gpax !== null && m.gpax !== undefined ? Number(m.gpax).toFixed(2) : '-'}
                                    </div>
                                  </td>
                                  <td>{m.position_label}</td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                      {REQUIRED_DOCS.map((doc) => {
                                        const hasDoc = Boolean(m[doc.field]) || (doc.key === 'consent' && hasOnlineGuardianConsent(m));
                                        return (
                                          <span key={doc.key} className={`pill ${hasDoc ? 'pill-emerald' : 'pill-rose'}`}>
                                            {hasDoc ? '✓' : '✗'} {doc.shortLabel}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    {!comp.complete && (
                                      <div style={{ fontSize: 11.5, color: '#be123c', marginTop: 3 }}>
                                        ขาด: {comp.missing.join(', ')}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                      <span className={`pill ${comp.submitted ? 'pill-emerald' : 'pill-amber'}`}>
                                        {comp.submitted ? <><Lock size={12} /> ส่งใบสมัครแล้ว</> : 'กำลังกรอก'}
                                      </span>
                                      <StatusPill status={m.member_status} map={MEMBER_STATUS_META} />
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {(isLeader || m.id === myMember?.id) && isEditable && !comp.submitted && (
                                        <button
                                          type="button"
                                          className="btn-outline"
                                          style={{ padding: '5px 10px', fontSize: 12.5 }}
                                          onClick={() => setEditingMember({
                                            memberId: m.id,
                                            email: m.email,
                                            prefix: m.prefix || 'นาย',
                                            full_name: m.full_name || '',
                                            nickname: m.nickname || '',
                                            student_id: m.student_id || '',
                                            classroom: m.classroom || 'ม.4/1',
                                            study_plan: m.study_plan || '',
                                            birth_date: m.birth_date || '',
                                            nationality: m.nationality || 'ไทย',
                                            religion: m.religion || 'พุทธ',
                                            experience: m.experience || '',
                                            is_special_room: Boolean(m.is_special_room),
                                            special_room_or_club: m.special_room_or_club || '',
                                            gpax: m.gpax ?? '',
                                            phone: m.phone || '',
                                            position_key: m.position_key || 'academic',
                                            doc_grade_path: m.doc_grade_path,
                                            doc_conduct_path: m.doc_conduct_path,
                                            doc_consent_path: m.doc_consent_path,
                                          })}
                                        >
                                          <Edit3 size={13} /> แก้ไข
                                        </button>
                                      )}
                                      {isEditable && ((isLeader && !m.is_leader) || (!isLeader && m.id === myMember?.id)) && (
                                        <button
                                          type="button"
                                          className="btn-danger-soft"
                                          onClick={() => handleRemoveMember(m)}
                                        >
                                          <Trash2 size={13} /> {m.id === myMember?.id ? 'ออกจากพรรค' : 'ลบ'}
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

                      {/* Mobile Member Card List (<= 768px) */}
                      <div className="apply-member-cards">
                        {members.map((m, idx) => {
                          const comp = getMemberCompleteness(m, minGpax);
                          return (
                            <div key={m.id} className="apply-member-card">
                              <div className="apply-member-card-top">
                                <div className="apply-member-card-rank">
                                  <span className="apply-member-num">#{idx + 1}</span>
                                  {isLeader && isEditable && (
                                    <span style={{ display: 'inline-flex', gap: 4 }}>
                                      <button
                                        type="button"
                                        className="btn-outline"
                                        title="เลื่อนขึ้น"
                                        disabled={busy || idx === 0}
                                        style={{ padding: '4px 7px', borderRadius: 8, minHeight: 30 }}
                                        onClick={() => moveMemberOrder(idx, -1)}
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-outline"
                                        title="เลื่อนลง"
                                        disabled={busy || idx === members.length - 1}
                                        style={{ padding: '4px 7px', borderRadius: 8, minHeight: 30 }}
                                        onClick={() => moveMemberOrder(idx, 1)}
                                      >
                                        <ArrowDown size={13} />
                                      </button>
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  <span className={`pill ${comp.submitted ? 'pill-emerald' : 'pill-amber'}`}>
                                    {comp.submitted ? <><Lock size={11} /> ส่งแล้ว</> : 'กำลังกรอก'}
                                  </span>
                                  <StatusPill status={m.member_status} map={MEMBER_STATUS_META} />
                                </div>
                              </div>

                              <div className="apply-member-card-identity">
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#2d1046' }}>
                                  {m.full_name ? `${m.prefix}${m.full_name}` : <span style={{ color: '#9ca3af' }}>ยังไม่กรอกชื่อ</span>}
                                  {m.is_leader && <span className="pill pill-purple" style={{ marginLeft: 6 }}>หัวหน้าพรรค</span>}
                                </div>
                                <div style={{ fontSize: 12.5, color: '#52525b', marginTop: 2 }}>
                                  {m.classroom || '-'} •{' '}
                                  <strong style={{ color: Number(m.gpax) >= minGpax ? '#047857' : '#be123c' }}>
                                    GPAX {m.gpax !== null && m.gpax !== undefined ? Number(m.gpax).toFixed(2) : '-'}
                                  </strong>
                                  {m.student_id ? ` • ${m.student_id}` : ''}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#4a1270', marginTop: 3 }}>
                                  {m.position_label}
                                </div>
                                {m.review_note && (
                                  <div style={{ fontSize: 12, color: '#be123c', marginTop: 4 }}>หมายเหตุ: {m.review_note}</div>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                                {REQUIRED_DOCS.map((doc) => {
                                  const hasDoc = Boolean(m[doc.field]) || (doc.key === 'consent' && hasOnlineGuardianConsent(m));
                                  return (
                                    <span key={doc.key} className={`pill ${hasDoc ? 'pill-emerald' : 'pill-rose'}`}>
                                      {hasDoc ? '✓' : '✗'} {doc.shortLabel}
                                    </span>
                                  );
                                })}
                              </div>
                              {!comp.complete && (
                                <div style={{ fontSize: 12, color: '#be123c', marginTop: 6 }}>
                                  ขาด: {comp.missing.join(', ')}
                                </div>
                              )}

                              {(((isLeader || m.id === myMember?.id) && isEditable && !comp.submitted)
                                || (isEditable && ((isLeader && !m.is_leader) || (!isLeader && m.id === myMember?.id)))) && (
                                <div className="apply-member-card-actions">
                                  {(isLeader || m.id === myMember?.id) && isEditable && !comp.submitted && (
                                    <button
                                      type="button"
                                      className="btn-outline"
                                      style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                                      onClick={() => setEditingMember({
                                        memberId: m.id,
                                        email: m.email,
                                        prefix: m.prefix || 'นาย',
                                        full_name: m.full_name || '',
                                        nickname: m.nickname || '',
                                        student_id: m.student_id || '',
                                        classroom: m.classroom || 'ม.4/1',
                                        study_plan: m.study_plan || '',
                                        birth_date: m.birth_date || '',
                                        nationality: m.nationality || 'ไทย',
                                        religion: m.religion || 'พุทธ',
                                        experience: m.experience || '',
                                        is_special_room: Boolean(m.is_special_room),
                                        special_room_or_club: m.special_room_or_club || '',
                                        gpax: m.gpax ?? '',
                                        phone: m.phone || '',
                                        position_key: m.position_key || 'academic',
                                        doc_grade_path: m.doc_grade_path,
                                        doc_conduct_path: m.doc_conduct_path,
                                        doc_consent_path: m.doc_consent_path,
                                      })}
                                    >
                                      <Edit3 size={14} /> แก้ไข
                                    </button>
                                  )}
                                  {isEditable && ((isLeader && !m.is_leader) || (!isLeader && m.id === myMember?.id)) && (
                                    <button
                                      type="button"
                                      className="btn-danger-soft"
                                      style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                                      onClick={() => handleRemoveMember(m)}
                                    >
                                      <Trash2 size={14} /> {m.id === myMember?.id ? 'ออกจากพรรค' : 'ลบ'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {partyForm && (
                      <section className="apply-card">
                        <h3 className="apply-card-title"><Award size={18} /> ข้อมูลและนโยบายพรรค</h3>
                        <p className="apply-card-sub">
                          {isLeader ? 'หัวหน้าพรรคสามารถแก้ไขชื่อพรรค สโลแกน อุดมการณ์ และรายการนโยบายได้ที่นี่' : 'ข้อมูลและนโยบายของพรรค (แก้ไขได้โดยหัวหน้าพรรค)'}
                        </p>
                        <form onSubmit={handleSaveParty} className="form-grid">
                          <div className="form-field">
                            <label>ชื่อพรรค *</label>
                            <input
                              required
                              disabled={!isLeader || !isEditable}
                              value={partyForm.party_name}
                              onChange={(e) => setPartyForm({ ...partyForm, party_name: e.target.value })}
                            />
                          </div>
                          <div className="form-field">
                            <label>สโลแกนพรรค</label>
                            <input
                              disabled={!isLeader || !isEditable}
                              value={partyForm.slogan}
                              onChange={(e) => setPartyForm({ ...partyForm, slogan: e.target.value })}
                            />
                          </div>
                          <div className="form-field full">
                            <label>อุดมการณ์ / แนวคิดของพรรค</label>
                            <textarea
                              rows={3}
                              disabled={!isLeader || !isEditable}
                              value={partyForm.ideology}
                              onChange={(e) => setPartyForm({ ...partyForm, ideology: e.target.value })}
                            />
                          </div>

                          <div className="form-field full">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <label style={{ margin: 0 }}>นโยบายพรรค ({partyForm.policies.length} ข้อ)</label>
                              {isLeader && isEditable && (
                                <button
                                  type="button"
                                  className="btn-outline"
                                  style={{ padding: '6px 12px', fontSize: 13 }}
                                  onClick={() => setPartyForm({ ...partyForm, policies: [...partyForm.policies, { title: '', detail: '' }] })}
                                >
                                  <Plus size={14} /> เพิ่มนโยบาย
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {partyForm.policies.map((pol, idx) => (
                                <div key={idx} style={{ padding: 12, borderRadius: 12, border: '1px solid #e9dff2', background: '#faf5ff' }}>
                                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <input
                                      style={{ flex: 1 }}
                                      placeholder={`หัวข้อนโยบายที่ ${idx + 1}`}
                                      disabled={!isLeader || !isEditable}
                                      value={pol.title}
                                      onChange={(e) => {
                                        const next = [...partyForm.policies];
                                        next[idx] = { ...next[idx], title: e.target.value };
                                        setPartyForm({ ...partyForm, policies: next });
                                      }}
                                    />
                                    {isLeader && isEditable && partyForm.policies.length > 1 && (
                                      <button
                                        type="button"
                                        className="btn-danger-soft"
                                        onClick={() => setPartyForm({ ...partyForm, policies: partyForm.policies.filter((_, i) => i !== idx) })}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                  <textarea
                                    rows={2}
                                    style={{ width: '100%' }}
                                    placeholder="รายละเอียดแนวทางการดำเนินงาน"
                                    disabled={!isLeader || !isEditable}
                                    value={pol.detail}
                                    onChange={(e) => {
                                      const next = [...partyForm.policies];
                                      next[idx] = { ...next[idx], detail: e.target.value };
                                      setPartyForm({ ...partyForm, policies: next });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {isLeader && isEditable && (
                            <div className="form-field full">
                              <button type="submit" className="btn-purple" disabled={busy}>
                                บันทึกข้อมูลและนโยบายพรรค
                              </button>
                            </div>
                          )}
                        </form>
                      </section>
                    )}
                  </>
                )}

                {/* ── TAB: MY 4-STEP APPLICATION WIZARD ── */}
                {workspaceTab === 'me' && selfForm && myMember && liveMergedMember && (
                  <div ref={wizardTopRef} className="wizard-shell">
                    {/* Locked Banner if already submitted */}
                    {isMyMemberLocked && (
                      <div className="wizard-locked-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Lock size={18} />
                          <div>
                            <strong>ยืนยันและส่งใบสมัครส่วนตัวเรียบร้อยแล้ว (ล็อกการแก้ไข)</strong>
                            <div style={{ fontSize: 12.5, opacity: 0.9 }}>
                              ส่งเมื่อ {new Date(myMember.member_submitted_at).toLocaleString('th-TH')} • หากต้องแก้ไขข้อมูล กรุณารอ คณะกรรมการสภานักเรียน ส่งตีกลับสถานะ &ldquo;ขอแก้ไข&rdquo;
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={printBusy === 'single'}
                          onClick={handleOpenMyPrint}
                        >
                          <Printer size={15} /> พิมพ์ / PDF ใบสมัครของฉัน
                        </button>
                      </div>
                    )}

                    {myMember.review_note && (
                      <div className="notice-bar notice-error">
                        <span><strong>หมายเหตุจาก คณะกรรมการสภานักเรียน:</strong> {myMember.review_note}</span>
                      </div>
                    )}

                    {/* 4-Step Interactive Progress Stepper + Live Autosave Indicator */}
                    <section className="apply-card wizard-stepper-card">
                      <div className="wizard-stepper-top">
                        <div>
                          <strong style={{ fontSize: 15.5, color: '#2d1046' }}>ขั้นตอนกรอกใบสมัครของฉัน</strong>
                          <div style={{ fontSize: 12.5, color: '#64748b' }}>กดสลับขั้นได้อิสระ • ระบบบันทึกข้อมูลอัตโนมัติทุกครั้งที่พิมพ์</div>
                        </div>
                        <div className={`autosave-pill is-${isMyMemberLocked ? 'locked' : saveState}`}>
                          {isMyMemberLocked ? (
                            <><Lock size={13} /> ส่งและล็อกแล้ว</>
                          ) : saveState === 'saving' ? (
                            <><Cloud size={13} /> กำลังบันทึกอัตโนมัติ...</>
                          ) : saveState === 'error' ? (
                            <><CloudOff size={13} /> บันทึกในเครื่องแล้ว (รอเน็ต)</>
                          ) : saveState === 'saved' ? (
                            <><CheckCircle2 size={13} /> บันทึกอัตโนมัติแล้ว {lastSavedAt}</>
                          ) : (
                            <><Cloud size={13} /> พร้อมบันทึกอัตโนมัติ</>
                          )}
                        </div>
                      </div>

                      <div className="wizard-steps" role="tablist" aria-label="ขั้นตอนการสมัคร">
                        {[
                          { id: 1, title: 'ข้อมูลส่วนตัว', done: step1Done },
                          { id: 2, title: 'เซ็นชื่อ (นักเรียน+ผู้ปกครอง)', done: step2Done },
                          { id: 3, title: 'แนบเอกสาร (2 ฉบับ)', done: step3Done },
                          { id: 4, title: 'ตรวจสอบและส่ง', done: step4Done },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={wizardStep === s.id}
                            className={`wizard-step-btn ${wizardStep === s.id ? 'active' : ''} ${s.done ? 'done' : ''}`}
                            onClick={() => goToWizardStep(s.id)}
                          >
                            <span className="wizard-step-num">
                              {s.done ? <Check size={14} /> : s.id}
                            </span>
                            <span className="wizard-step-label">{s.title}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* ── STEP 1: PERSONAL INFO ── */}
                    {wizardStep === 1 && (
                      <section className="apply-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                          <h3 className="apply-card-title" style={{ margin: 0 }}>ขั้นที่ 1: ข้อมูลส่วนตัวใบสมัคร</h3>
                          <StatusPill status={myMember.member_status} map={MEMBER_STATUS_META} />
                        </div>

                        {/* 1.5" Student Photo Preview (Strictly Auto from School Google Drive) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, background: '#faf5ff', border: '1px solid #e9dff2', marginBottom: 16, flexWrap: 'wrap' }}>
                          <div style={{ width: 66, height: 84, borderRadius: 8, border: '1.5px solid #2d1046', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#52525b', textAlign: 'center', padding: 4 }}>
                            {photoLoading ? (
                              'กำลังดึงรูป...'
                            ) : selfPhoto?.found && selfPhoto?.base64 ? (
                              <img src={`data:${selfPhoto.mimeType || 'image/jpeg'};base64,${selfPhoto.base64}`} alt="รูปถ่าย 1.5 นิ้ว" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              'รูป 1.5 นิ้ว'
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#2d1046', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Lock size={14} color="#6b21a8" /> รูปถ่ายชุดนักเรียน 1.5 นิ้ว (ล็อกตามระบบโรงเรียน)
                            </div>
                            <div style={{ fontSize: 12.5, color: '#52525b', marginTop: 4 }}>
                              {selfPhoto?.found
                                ? '✓ พบข้อมูลรูปถ่ายนักเรียนในระบบแล้ว'
                                : 'ไม่พบข้อมูลรูปถ่ายในระบบ (กรุณาติดต่อคณะกรรมการสภานักเรียน)'}
                            </div>
                          </div>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); goToWizardStep(2); }} className="form-grid">
                          <div className="form-field full">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#6b21a8', background: '#faf5ff', border: '1px solid #e9dff2', borderRadius: 10, padding: '8px 12px' }}>
                              <Lock size={14} /> ข้อมูลประจำตัวด้านล่างดึงจากรายชื่อ ม.4 อัตโนมัติ (ไม่สามารถแก้ไขได้)
                            </div>
                          </div>
                          <div className="form-field">
                            <label>คำนำหน้า (ล็อก)</label>
                            <input readOnly disabled value={selfForm.prefix} />
                          </div>
                          <div className="form-field">
                            <label>ชื่อ-นามสกุล (ล็อก)</label>
                            <input readOnly disabled value={selfForm.full_name} />
                          </div>
                          <div className="form-field">
                            <label>เลขประจำตัวนักเรียน (ล็อก)</label>
                            <input readOnly disabled value={selfForm.student_id} />
                          </div>
                          <div className="form-field">
                            <label>ชั้น / ห้อง / เลขที่ (ล็อก)</label>
                            <input readOnly disabled value={`${selfForm.classroom}${selfForm.student_no ? ` เลขที่ ${selfForm.student_no}` : ''}`} />
                          </div>
                          <div className="form-field">
                            <label>ชื่อเล่น</label>
                            <input disabled={!canEditMyForm} value={selfForm.nickname} onChange={(e) => setSelfForm({ ...selfForm, nickname: e.target.value })} />
                          </div>
                          <div className="form-field">
                            <label>
                              แผนการเรียน {getStudyPlanConfig(selfForm.classroom).locked ? '(ล็อกตามห้อง)' : '*'}
                            </label>
                            {(() => {
                              const sp = getStudyPlanConfig(selfForm.classroom);
                              if (sp.locked) {
                                return <input readOnly disabled value={sp.fixedPlan} />;
                              }
                              return (
                                <select
                                  required
                                  disabled={!canEditMyForm}
                                  value={selfForm.study_plan}
                                  onChange={(e) => setSelfForm({ ...selfForm, study_plan: e.target.value })}
                                >
                                  <option value="">-- เลือกสายการเรียน --</option>
                                  {sp.options.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                          <div className="form-field">
                            <label>เกรดเฉลี่ยสะสมล่าสุด (GPAX ≥ {minGpax.toFixed(2)}) *</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              maxLength={4}
                              pattern="^[0-4]\.\d{2}$"
                              placeholder="เช่น 3.75"
                              required
                              disabled={!canEditMyForm}
                              value={selfForm.gpax}
                              onChange={(e) => setSelfForm({ ...selfForm, gpax: sanitizeGpaxInput(e.target.value) })}
                              onBlur={(e) => setSelfForm({ ...selfForm, gpax: formatGpaxOnBlur(e.target.value) })}
                            />
                          </div>
                          <div className="form-field">
                            <label>วัน/เดือน/ปีเกิด {selfForm.birth_date ? `(อายุ ${calculateAge(selfForm.birth_date)} ปี)` : ''}</label>
                            <input type="date" disabled={!canEditMyForm} value={selfForm.birth_date} onChange={(e) => setSelfForm({ ...selfForm, birth_date: e.target.value })} />
                          </div>
                          <div className="form-field">
                            <label>สัญชาติ</label>
                            <input disabled={!canEditMyForm} value={selfForm.nationality} onChange={(e) => setSelfForm({ ...selfForm, nationality: e.target.value })} />
                          </div>
                          <div className="form-field">
                            <label>ศาสนา</label>
                            <select
                              disabled={!canEditMyForm}
                              value={selfForm.religion || 'พุทธ'}
                              onChange={(e) => setSelfForm({ ...selfForm, religion: e.target.value })}
                            >
                              {RELIGION_OPTIONS.map((rel) => (
                                <option key={rel} value={rel}>{rel}</option>
                              ))}
                              {selfForm.religion && !RELIGION_OPTIONS.includes(selfForm.religion) && (
                                <option value={selfForm.religion}>{selfForm.religion}</option>
                              )}
                            </select>
                          </div>
                          <div className="form-field">
                            <label>เบอร์โทรศัพท์ติดต่อ</label>
                            <input
                              type="tel"
                              inputMode="numeric"
                              maxLength={12}
                              placeholder="08x-xxx-xxxx"
                              disabled={!canEditMyForm}
                              value={selfForm.phone}
                              onChange={(e) => setSelfForm({ ...selfForm, phone: formatThaiPhoneInput(e.target.value) })}
                            />
                          </div>
                          <div className="form-field">
                            <label>ตำแหน่งในพรรค (ข้อ 20) *</label>
                            <select disabled={!canEditMyForm} value={selfForm.position_key} onChange={(e) => setSelfForm({ ...selfForm, position_key: e.target.value })}>
                              {POSITIONS.map((p) => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field full">
                            <label>
                              ประสบการณ์หรือผลงาน (ถ้ามี){' '}
                              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
                                (จำกัดไม่เกิน 2 บรรทัด • {(selfForm.experience || '').length}/{EXPERIENCE_MAX_CHARS} ตัวอักษร)
                              </span>
                            </label>
                            <textarea
                              rows={2}
                              maxLength={EXPERIENCE_MAX_CHARS}
                              disabled={!canEditMyForm}
                              placeholder="ระบุประสบการณ์การทำงาน กิจกรรม หรือรางวัลที่เคยได้รับ (ไม่เกิน 2 บรรทัด)..."
                              value={selfForm.experience}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (selfForm.experience || '').includes('\n')) {
                                  e.preventDefault();
                                }
                              }}
                              onChange={(e) => setSelfForm({ ...selfForm, experience: sanitizeExperienceTwoLines(e.target.value) })}
                            />
                          </div>
                        </form>
                      </section>
                    )}

                    {/* ── STEP 2: SIGNATURES (STUDENT + GUARDIAN) ── */}
                    {wizardStep === 2 && (
                      <div className="wizard-stack">
                        <section className="apply-card">
                          <h3 className="apply-card-title"><PenTool size={18} /> ขั้นที่ 2: ลายเซ็นนักเรียนผู้สมัคร & คำยินยอมผู้ปกครอง</h3>
                          <p className="apply-card-sub">
                            ลายเซ็นทั้ง 2 ช่องจะถูกฝังลงในใบสมัครหน้า ๑ อัตโนมัติ • บนมือถือหรือ iPad กดปุ่ม <strong>&ldquo;ขยายเต็มจอเพื่อเซ็น&rdquo;</strong> เพื่อเซ็นด้วยนิ้วหรือ Apple Pencil ได้ถนัดยิ่งขึ้น
                          </p>

                          <div style={{ marginBottom: 20 }}>
                            <SignaturePad
                              label="1. ลายเซ็นนักเรียนผู้สมัคร *"
                              hint={`ลงชื่อ ${selfForm.prefix}${selfForm.full_name} (ผู้สมัคร)`}
                              value={selfForm.student_signature_data}
                              disabled={!canEditMyForm}
                              height={180}
                              onChange={(dataUrl) => setSelfForm({ ...selfForm, student_signature_data: dataUrl })}
                            />
                          </div>

                          <div className="online-consent-panel">
                            <div className="online-consent-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <PenTool size={15} color="#6b21a8" />
                                <strong>2. คำยินยอมและลายเซ็นผู้ปกครอง (ลงในใบสมัครหน้า ๑ โดยตรง)</strong>
                              </span>
                              {hasOnlineGuardianConsent(liveMergedMember) ? (
                                <span className="pill pill-emerald">✓ เซ็นอนุญาตครบแล้ว</span>
                              ) : (
                                <span className="pill pill-rose">ยังกรอก/เซ็นไม่ครบ</span>
                              )}
                            </div>
                            <div className="form-grid" style={{ marginTop: 12 }}>
                              <div className="form-field full">
                                <label>ชื่อ-นามสกุล ผู้ปกครอง *</label>
                                <input
                                  disabled={!canEditMyForm}
                                  placeholder="เช่น นายสมชาย ใจดี"
                                  value={selfForm.guardian_name}
                                  onChange={(e) => setSelfForm({ ...selfForm, guardian_name: e.target.value })}
                                />
                              </div>
                              <div className="form-field">
                                <label>เกี่ยวข้องเป็น *</label>
                                <select
                                  disabled={!canEditMyForm}
                                  value={selfForm.guardian_relation}
                                  onChange={(e) => setSelfForm({ ...selfForm, guardian_relation: e.target.value })}
                                >
                                  <option value="บิดา">บิดา</option>
                                  <option value="มารดา">มารดา</option>
                                  <option value="ผู้ปกครอง">ผู้ปกครอง</option>
                                </select>
                              </div>
                              <div className="form-field">
                                <label>เบอร์โทรศัพท์ผู้ปกครอง *</label>
                                <input
                                  disabled={!canEditMyForm}
                                  type="tel"
                                  inputMode="numeric"
                                  maxLength={12}
                                  placeholder="08x-xxx-xxxx"
                                  value={selfForm.guardian_phone}
                                  onChange={(e) => setSelfForm({ ...selfForm, guardian_phone: formatThaiPhoneInput(e.target.value) })}
                                />
                              </div>
                              <div className="form-field full">
                                <label>ความคิดเห็นผู้ปกครอง (ถ้ามี — จะปรากฏในใบสมัครหน้า ๑)</label>
                                <input
                                  disabled={!canEditMyForm}
                                  placeholder="เช่น อนุญาตและยินดีสนับสนุนการปฏิบัติหน้าที่ของนักเรียน"
                                  value={selfForm.guardian_comment || ''}
                                  onChange={(e) => setSelfForm({ ...selfForm, guardian_comment: e.target.value })}
                                />
                              </div>
                              <div className="form-field full">
                                <SignaturePad
                                  label="ลายเซ็นผู้ปกครอง (เซ็นยืนยันอนุญาต) *"
                                  hint="ข้าพเจ้ารับทราบและอนุญาตให้นักเรียนลงสมัครรับเลือกตั้งคณะกรรมการสภานักเรียน ปีการศึกษา 2570"
                                  value={selfForm.guardian_signature_data}
                                  disabled={!canEditMyForm}
                                  height={180}
                                  onChange={(dataUrl) => setSelfForm({ ...selfForm, guardian_signature_data: dataUrl })}
                                />
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {/* ── STEP 3: REQUIRED DOCUMENTS UPLOAD ── */}
                    {wizardStep === 3 && (
                      <section className="apply-card">
                        <h3 className="apply-card-title"><Upload size={18} /> ขั้นที่ 3: แนบเอกสารบังคับ (2 ฉบับ)</h3>
                        <p className="apply-card-sub">
                          เอกสารของคุณจะเปิดดูได้เฉพาะคุณ หัวหน้าพรรค และคณะกรรมการสภานักเรียน • บนมือถือสามารถถ่ายรูปหรือเลือกจากคลังภาพได้ทันที
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {REQUIRED_DOCS.filter((d) => d.key !== 'consent').map((doc) => {
                            const path = myMember[doc.field];
                            const docStatus = myMember[doc.statusField] || 'pending';
                            const isUploading = uploadingKey === `${myMember.id}:${doc.key}`;
                            return (
                              <div key={doc.key} className="doc-box">
                                <div className="doc-box-head">
                                  <div>
                                    <div className="doc-box-title">{doc.label}</div>
                                    <div className="doc-box-hint">{doc.clause} • {doc.hint}</div>
                                  </div>
                                  {path ? (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span className="pill pill-emerald">✓ อัปโหลดแล้ว</span>
                                      <StatusPill status={docStatus} map={MEMBER_STATUS_META} />
                                    </div>
                                  ) : (
                                    <span className="pill pill-rose">ยังไม่ส่งเอกสาร</span>
                                  )}
                                </div>

                                <div className="doc-actions">
                                  {canEditMyForm && (
                                    <>
                                      <label className="btn-purple" style={{ cursor: 'pointer' }}>
                                        <Upload size={15} /> {isUploading ? 'กำลังอัปโหลด...' : (path ? 'เปลี่ยนไฟล์ใหม่' : 'เลือกไฟล์ / คลังภาพ')}
                                        <input
                                          type="file"
                                          accept="image/jpeg,image/png,image/webp,application/pdf"
                                          style={{ display: 'none' }}
                                          disabled={isUploading}
                                          onChange={(e) => handleDocUpload(myMember.id, doc.key, e.target.files?.[0])}
                                        />
                                      </label>
                                      <label className="btn-outline" style={{ cursor: 'pointer' }}>
                                        <Camera size={15} /> ถ่ายรูปเอกสาร
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          style={{ display: 'none' }}
                                          disabled={isUploading}
                                          onChange={(e) => handleDocUpload(myMember.id, doc.key, e.target.files?.[0])}
                                        />
                                      </label>
                                    </>
                                  )}
                                  {path && (
                                    <button type="button" className="btn-ghost-dark" onClick={() => handleViewDoc(myMember.id, path)}>
                                      <Eye size={15} /> ดูไฟล์ที่แนบไว้
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* ── STEP 4: FULL-FORM PREVIEW & SUBMIT LOCK ── */}
                    {wizardStep === 4 && (
                      <div className="wizard-stack">
                        <section className="apply-card">
                          <h3 className="apply-card-title">
                            <ShieldCheck size={18} /> ขั้นที่ 4: ตรวจสอบใบสมัครฉบับเต็มและกดส่ง
                          </h3>
                          <p className="apply-card-sub">
                            ตรวจสอบความถูกต้องของข้อมูล รูปถ่าย และลายเซ็นบนแบบฟอร์มจริงด้านล่างก่อนกด &ldquo;ยืนยันและส่งใบสมัครของฉัน&rdquo;
                          </p>

                          {/* Pre-submit Completeness Checklist */}
                          <div className="wizard-checklist">
                            {[
                              { label: 'ขั้นที่ 1: ข้อมูลส่วนตัว (แผนการเรียน, GPAX ≥ ' + minGpax.toFixed(2) + ', ตำแหน่ง)', ok: step1Done, step: 1 },
                              { label: 'ขั้นที่ 2: ลายเซ็นนักเรียนผู้สมัคร + คำยินยอมและลายเซ็นผู้ปกครอง', ok: step2Done, step: 2 },
                              { label: 'ขั้นที่ 3: เอกสารบังคับครบ 2 ฉบับ (ปพ.6 + หลักฐานห้องปกครอง)', ok: step3Done, step: 3 },
                            ].map((item) => (
                              <div key={item.step} className={`wizard-check-item ${item.ok ? 'ok' : 'missing'}`}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  {item.ok ? <CheckCircle2 size={16} color="#059669" /> : <AlertCircle size={16} color="#be123c" />}
                                  <span>{item.label}</span>
                                </span>
                                {!item.ok && canEditMyForm && (
                                  <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => goToWizardStep(item.step)}>
                                    ไปกรอกให้ครบ
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {!myCompleteness.complete && (
                            <div className="notice-bar notice-error" style={{ marginTop: 12, marginBottom: 0 }}>
                              <span><strong>ยังขาดรายการบังคับ:</strong> {myCompleteness.missing.join(', ')}</span>
                            </div>
                          )}

                          {/* Embedded Full A4 Official Application Form */}
                          <div className="wizard-a4-preview-box">
                            <InlineApplicationPreview
                              member={liveMergedMember}
                              party={party}
                              photoData={selfPhoto}
                              attachments={selfAttachments}
                            />
                          </div>

                          {/* Final Submit & Lock Action */}
                          <div className="wizard-submit-footer">
                            {isMyMemberLocked ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#047857', fontWeight: 700, fontSize: 14.5 }}>
                                <CheckCircle2 size={20} /> คุณได้ยืนยันและส่งใบสมัครส่วนตัวเรียบร้อยแล้ว
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 13, color: '#52525b' }}>
                                  <strong style={{ color: '#2d1046' }}>หมายเหตุ:</strong> เมื่อกดยืนยันส่งแล้ว ใบสมัครของคุณจะถูกล็อกทันที (แก้ไขไม่ได้ ยกเว้น คณะกรรมการสภานักเรียน ตีกลับให้แก้ไข)
                                </div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn-outline"
                                    disabled={printBusy === 'single'}
                                    onClick={handleOpenMyPrint}
                                  >
                                    <Printer size={15} /> {printBusy === 'single' ? 'กำลังเตรียม...' : 'พิมพ์ / Save as PDF'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-purple wizard-submit-btn"
                                    disabled={busy || !canEditMyForm || !myCompleteness.complete}
                                    onClick={() => setSubmitConfirmOpen(true)}
                                  >
                                    <Send size={16} /> ยืนยันและส่งใบสมัครของฉัน
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </section>
                      </div>
                    )}

                    {/* Sticky Bottom Wizard Navigation Bar (Mobile/iPad/Desktop) */}
                    <div className="wizard-bottom-bar">
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={wizardStep === 1}
                        onClick={() => goToWizardStep(wizardStep - 1)}
                      >
                        <ArrowLeft size={16} /> ย้อนกลับ
                      </button>

                      <span className="wizard-bottom-status">
                        ขั้นที่ {wizardStep} / 4
                      </span>

                      {wizardStep < 4 ? (
                        <button
                          type="button"
                          className="btn-purple"
                          onClick={() => goToWizardStep(wizardStep + 1)}
                        >
                          ถัดไป <ArrowRight size={16} />
                        </button>
                      ) : !isMyMemberLocked ? (
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={busy || !canEditMyForm || !myCompleteness.complete}
                          onClick={() => setSubmitConfirmOpen(true)}
                        >
                          <Send size={15} /> ยืนยันและส่ง
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={printBusy === 'single'}
                          onClick={handleOpenMyPrint}
                        >
                          <Printer size={15} /> พิมพ์ PDF
                        </button>
                      )}
                    </div>

                    {/* Confirmation Modal Before Locking Individual Application */}
                    {submitConfirmOpen && createPortal(
                      <div className="sig-fs-backdrop" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setSubmitConfirmOpen(false); }}>
                        <div className="wizard-confirm-modal">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#4a1270', marginBottom: 10 }}>
                            <ShieldCheck size={24} />
                            <h3 style={{ margin: 0, fontSize: 18 }}>ยืนยันการส่งใบสมัครของฉัน?</h3>
                          </div>
                          <p style={{ margin: '0 0 14px', fontSize: 14, color: '#3f3f46', lineHeight: 1.6 }}>
                            เมื่อกดยืนยัน ระบบจะบันทึกและ<strong>ล็อกใบสมัครของคุณทันที</strong> ทั้งคุณและหัวหน้าพรรคจะไม่สามารถแก้ไขข้อมูลหรือเอกสารได้อีก (ยกเว้น คณะกรรมการสภานักเรียน กดส่งตีกลับให้แก้ไข)
                          </p>
                          {notice?.type === 'error' && (
                            <div className="notice-bar notice-error" style={{ marginBottom: 14 }}>
                              <span>{notice.text}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                            <button type="button" className="btn-outline" disabled={busy} onClick={() => setSubmitConfirmOpen(false)}>
                              กลับไปตรวจอีกครั้ง
                            </button>
                            <button type="button" className="btn-purple" disabled={busy} onClick={handleSubmitMyApplication}>
                              <Send size={15} /> {busy ? 'กำลังส่ง...' : 'ยืนยันและส่งใบสมัครทันที'}
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )}
                  </div>
                )}

                {/* ── TAB 3: EXACT PDF PRINTING & SUBMIT TO คณะกรรมการสภานักเรียน ── */}
                {workspaceTab === 'submit' && validation && (
                  <>
                    <section className="apply-card">
                      <h3 className="apply-card-title"><Printer size={18} /> พิมพ์ / บันทึกเป็น PDF ใบสมัคร</h3>

                      <div className="apply-print-card-grid">
                        <div className="apply-print-card">
                          <div>
                            <h4>1. ใบสมัครรายบุคคล (ฉบับของฉัน)</h4>
                            <p>แบบฟอร์ม 1 หน้า A4 พร้อมรูปถ่าย 1.5 นิ้ว และข้อมูลส่วนตัวของคุณครบทุกช่อง</p>
                          </div>
                          <button
                            type="button"
                            className="btn-gold"
                            disabled={printBusy === 'single'}
                            onClick={handleOpenMyPrint}
                          >
                            <Printer size={15} /> {printBusy === 'single' ? 'กำลังเตรียม...' : 'พิมพ์ / PDF ใบสมัครของฉัน'}
                          </button>
                        </div>

                        <div className="apply-print-card">
                          <div>
                            <h4>2. บัญชีรายชื่อผู้สมัครพรรค ({targetCount} คน)</h4>
                            <p>แบบฟอร์มบัญชีรายชื่อสมาชิกพรรคลำดับที่ ๑–๒๙ ตามลำดับที่คุณจัดไว้ในแท็บที่ 1</p>
                          </div>
                          <button
                            type="button"
                            className="btn-purple"
                            onClick={handleOpenRosterPrint}
                          >
                            <Printer size={15} /> พิมพ์ / PDF บัญชีรายชื่อพรรค
                          </button>
                        </div>

                        <div className="apply-print-card">
                          <div>
                            <h4>3. ชุดใบสมัครรวมทั้งพรรค (รวมเล่ม)</h4>
                            <p>รวมบัญชีรายชื่อ 29 คน + ใบสมัครรายบุคคลของสมาชิกทุกคนพร้อมรูป 1.5 นิ้วในชุดเดียว</p>
                          </div>
                          {isLeader ? (
                            <button
                              type="button"
                              className="btn-outline"
                              disabled={printBusy === 'bundle'}
                              onClick={handleOpenBundlePrint}
                            >
                              <FileText size={15} /> {printBusy === 'bundle' ? 'กำลังดึงรูปและรวมเล่ม...' : `พิมพ์ / PDF รวมทั้งพรรค (${members.length} คน)`}
                            </button>
                          ) : (
                            <span className="pill pill-slate">เฉพาะหัวหน้าพรรคพิมพ์ชุดรวมเล่มได้</span>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="apply-card">
                      <h3 className="apply-card-title"><ShieldCheck size={18} /> ตรวจสอบความพร้อมก่อนส่งใบสมัครพรรคให้ คณะกรรมการสภานักเรียน</h3>
                      <p className="apply-card-sub">
                        ระบบจะตรวจสอบคุณสมบัติครบทั้ง 5 เกณฑ์ตามระเบียบฯ (ฉบับแก้ไข พ.ศ. 2569) ก่อนเปิดให้หัวหน้าพรรคกดยืนยันส่งใบสมัคร
                      </p>

                      {validation.checks.map((c) => (
                        <div key={c.key} className={`check-item ${c.ok ? 'ok' : 'fail'}`}>
                          {c.ok ? <CheckCircle2 size={20} color="#059669" /> : <AlertCircle size={20} color="#be123c" />}
                          <div>
                            <div style={{ fontWeight: 700 }}>{c.label}</div>
                            <div style={{ fontSize: 13, color: '#475569' }}>{c.detail}</div>
                          </div>
                        </div>
                      ))}

                      <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: '#faf5ff', border: '1px solid #e9dff2' }}>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: '#2d1046' }}>
                          สรุปสัดส่วนห้องเรียน ({validation.breakdown.distinctClassrooms} ห้อง • ห้องเรียนพิเศษ {validation.breakdown.specialCount} คน)
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {Object.entries(validation.breakdown.byClassroom).map(([room, count]) => (
                            <span key={room} className="pill pill-purple">{room}: {count} คน</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        {isLeader ? (
                          <button
                            type="button"
                            className="btn-gold"
                            disabled={busy || !isEditable || !validation.canSubmit}
                            onClick={handleSubmitParty}
                          >
                            <Send size={16} /> {party.status === 'revision_requested' ? 'ส่งใบสมัครที่แก้ไขแล้วให้ คณะกรรมการสภานักเรียน ตรวจใหม่' : `ยืนยันส่งใบสมัครพรรค (ครบ ${targetCount} คน)`}
                          </button>
                        ) : (
                          <span className="pill pill-amber">เฉพาะหัวหน้าพรรค ({party.leader_email}) เท่านั้นที่กดยืนยันส่งใบสมัครพรรคได้</span>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
          </>
          )
        )}

        {/* ── LANDING / PUBLIC VIEW (Strictly NO forms & NO documents before login!) ── */}
        {(!isSchoolUser || viewMode === 'landing') && (
          <>
            {/* Signature Homepage Stats Counter Strip (exact match to index.html .stats-strip) */}
            <div className="apply-stats-strip" aria-label="สรุปเกณฑ์การรับสมัคร">
              <div className="apply-stat-item">
                <div className="apply-stat-number">{targetCount}</div>
                <div className="apply-stat-label">สมาชิกต่อพรรค (คน)</div>
              </div>
              <div className="apply-stat-item">
                <div className="apply-stat-number">{POSITIONS.length}</div>
                <div className="apply-stat-label">ตำแหน่ง / ฝ่ายงาน</div>
              </div>
              <div className="apply-stat-item">
                <div className="apply-stat-number">{minGpax.toFixed(2)}</div>
                <div className="apply-stat-label">เกรดเฉลี่ยขั้นต่ำ (GPAX)</div>
              </div>
              <div className="apply-stat-item">
                <div className="apply-stat-number">{REQUIRED_DOCS.length}</div>
                <div className="apply-stat-label">เอกสารบังคับต่อคน</div>
              </div>
            </div>

            {/* 1. เงื่อนไขการสมัคร & 2. เอกสารที่ต้องอัปโหลด (ข้อความอธิบายเท่านั้น ไม่มีปุ่มเอกสาร) */}
            <div className="apply-grid-2">
              <section className="apply-card">
                <h2 className="apply-card-title"><ShieldCheck size={18} /> เงื่อนไขและคุณสมบัติผู้สมัคร (ข้อ 21)</h2>
                <p className="apply-card-sub">อ้างอิงระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนฯ พ.ศ. 2561 (ฉบับแก้ไข พ.ศ. 2569)</p>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14.5 }}>
                  {QUALIFICATIONS_CLAUSE_21.map((item, i) => <li key={i}>{item}</li>)}
                </ol>
              </section>

              <section className="apply-card">
                <h2 className="apply-card-title"><FileText size={18} /> เอกสารที่ต้องเตรียมอัปโหลด (3 รายการ/คน)</h2>
                <p className="apply-card-sub">
                  สมาชิกทุกคนในพรรคทั้ง {targetCount} คนต้องอัปโหลดครบทั้ง 3 รายการหลังเข้าสู่ระบบด้วย <code>@{allowedDomain}</code>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {REQUIRED_DOCS.map((doc, i) => (
                    <div key={doc.key} className="doc-box">
                      <div className="doc-box-title">{i + 1}. {doc.label}</div>
                      <div className="doc-box-hint">{doc.clause} — {doc.hint}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* 3. โครงสร้างพรรคที่ต้องมี (16 ตำแหน่ง / 29 คน) */}
            <section className="apply-card">
              <h2 className="apply-card-title"><Users size={18} /> โครงสร้างพรรคที่ต้องมี {targetCount} คน 16 ตำแหน่ง/ฝ่าย (ข้อ 19–20, 66)</h2>
              <p className="apply-card-sub">
                พรรคต้องจัดสรรสมาชิกครบ {targetCount} คน โดยมีตำแหน่งหลักครบทุกตำแหน่ง (ตำแหน่งละ 1 คน) และกระจายสมาชิกลงครบทั้ง 9 ฝ่ายงาน
              </p>
              <div className="apply-struct-grid">
                {POSITIONS.map((pos, i) => (
                  <div key={pos.key} className="apply-struct-item">
                    <strong>{i + 1}. {pos.label}</strong>
                    <div className="apply-struct-meta">
                      {pos.group}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ปฏิทินกำหนดการ (ถ้า คณะกรรมการสภานักเรียน ตั้งไว้) */}
            {Array.isArray(settings.timeline) && settings.timeline.length > 0 && (
              <section className="apply-card">
                <h2 className="apply-card-title"><Calendar size={18} /> ปฏิทินกำหนดการเลือกตั้ง ปีการศึกษา {ACADEMIC_YEAR}</h2>
                <p className="apply-card-sub">กำหนดการอาจมีการปรับปรุงตามประกาศคณะกรรมการสภานักเรียน</p>
                <div className="timeline-list">
                  {settings.timeline.map((t, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-num">{t.step || idx + 1}</div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <strong style={{ color: '#2d1046', fontSize: 15.5 }}>{t.title}</strong>
                          <span className="pill pill-amber">{t.dateRange}</span>
                        </div>
                        <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>{t.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Approved Parties Announcement (if published by คณะกรรมการสภานักเรียน) */}
            {settings.publish_approved_parties && (
              <section className="apply-card">
                <h2 className="apply-card-title"><Award size={18} /> ประกาศรายชื่อพรรคผู้สมัครที่ผ่านการรับรองคุณสมบัติ</h2>
                {publicData.approvedParties?.length === 0 ? (
                  <p className="apply-card-sub">ยังไม่มีพรรคที่ประกาศรับรองในขณะนี้</p>
                ) : (
                  <div className="apply-grid-2">
                    {publicData.approvedParties.map((p) => (
                      <div key={p.id} style={{ padding: 18, borderRadius: 14, border: '1.5px solid #e9dff2', background: '#faf5ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <strong style={{ fontSize: 18, color: '#2d1046' }}>{p.party_name}</strong>
                          {p.party_number && <span className="pill pill-amber">เบอร์ {p.party_number}</span>}
                        </div>
                        {p.slogan && <div style={{ fontSize: 14, color: '#52525b', marginBottom: 8 }}>“{p.slogan}”</div>}
                        <div style={{ fontSize: 13, color: '#475569' }}>สมาชิก {p.members?.length || 0} คน</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Main-site Footer (EXACT match to index.html) ── */}
      <footer className="swsc-footer">
        <div className="swsc-footer-inner">
          <div className="swsc-footer-cols">
            <div className="swsc-footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={`${homeUrl}all-logos.png`}
                  alt="SWSC"
                  style={{ height: 38, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
                />
                <div>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: 0.5, lineHeight: 1 }}>
                    SWSC<span style={{ color: 'var(--gold-400)' }}>.</span>OFFICIAL
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gold-400)', fontWeight: 700, marginTop: 4, letterSpacing: 1 }}>
                    STUDENT COUNCIL PORTAL
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', maxWidth: 380 }}>
                คณะกรรมการสภานักเรียนโรงเรียนสรรพวิทยาคม อำเภอแม่สอด จังหวัดตาก — ระบบสารสนเทศสภานักเรียน พัฒนาขึ้นเพื่อการบริหารงานและให้บริการข้อมูลข่าวสารแก่คณะครูและนักเรียน
              </p>
            </div>

            <div className="swsc-footer-col">
              <h4>ลิงก์ด่วน</h4>
              <a href={`${homeUrl}#/home`}>หน้าแรก</a>
              <a href={`${homeUrl}#/news`}>ข่าวสารสภา</a>
              <a href={`${homeUrl}#/events`}>ปฏิทินกิจกรรม</a>
              <a href={`${homeUrl}#/structure`}>โครงสร้างสภาฯ</a>
            </div>

            <div className="swsc-footer-col">
              <h4>ข้อมูลบริการ &amp; เอกสาร</h4>
              <a href={`${homeUrl}#/certificates`}>ค้นหาเกียรติบัตร</a>
              <a href={`${homeUrl}#/documents`}>คลังเอกสารวิชาการ</a>
              <a href={`${homeUrl}#/regulations`}>ระเบียบสภาฯ</a>
              <a href={`${homeUrl}#/manual`}>คู่มือปฏิบัติงาน</a>
            </div>

            <div className="swsc-footer-col">
              <h4>เสนอแนะ &amp; ติดต่อ</h4>
              <a href={`${homeUrl}#/suggestions`}>กล่องข้อเสนอแนะ</a>
              <a href={`${homeUrl}#/contact`}>ช่องทางติดต่อสภา</a>
              <a href="https://www.sappha.ac.th" target="_blank" rel="noopener noreferrer">เว็บไซต์โรงเรียน</a>
              <a href={`${homeUrl}admin/#/admin-recruitment`}>ระบบตรวจใบสมัคร คณะกรรมการสภานักเรียน</a>
            </div>
          </div>

          <div className="swsc-footer-divider" />

          <div className="swsc-footer-bottom">
            <span>© 2569 คณะกรรมการสภานักเรียนโรงเรียนสรรพวิทยาคม. สงวนลิขสิทธิ์ทั้งหมด.</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Developed by
              <span style={{ color: 'var(--gold-400)', fontWeight: 700 }}>ฝ่ายโสตทัศนศึกษา</span>
            </span>
          </div>
        </div>
      </footer>

      {/* ── Modal: Leader Add / Edit Member ── */}
      {editingMember && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#2d1046' }}>
                {editingMember.memberId ? 'แก้ไขข้อมูลสมาชิกพรรค' : `เพิ่มสมาชิกใหม่ด้วยอีเมล @${allowedDomain}`}
              </h3>
              <button type="button" onClick={() => setEditingMember(null)} style={{ background: 'none', border: 'none' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveModalMember} className="form-grid">
              {!editingMember.memberId && (
                <div className="form-field full">
                  <label>อีเมลโรงเรียน (@{allowedDomain}) *</label>
                  <input
                    required
                    type="email"
                    placeholder={`เช่น 32997@${allowedDomain}`}
                    value={editingMember.email}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingMember((prev) => ({
                        ...prev,
                        email: val,
                        student_id: prev.student_id || extractStudentIdFromEmail(val),
                      }));
                    }}
                  />
                </div>
              )}
              <div className="form-field">
                <label>คำนำหน้า (ล็อก)</label>
                <input readOnly disabled value={editingMember.prefix} />
              </div>
              <div className="form-field">
                <label>ชื่อ-นามสกุล (ล็อก)</label>
                <input readOnly disabled value={editingMember.full_name} />
              </div>
              <div className="form-field">
                <label>ชื่อเล่น</label>
                <input value={editingMember.nickname} onChange={(e) => setEditingMember({ ...editingMember, nickname: e.target.value })} />
              </div>
              <div className="form-field">
                <label>เลขประจำตัวนักเรียน (ล็อก)</label>
                <input readOnly disabled value={editingMember.student_id} />
              </div>
              <div className="form-field">
                <label>ห้องเรียน ม.4 (ล็อก)</label>
                <input readOnly disabled value={editingMember.classroom} />
              </div>
              <div className="form-field">
                <label>แผนการเรียน {getStudyPlanConfig(editingMember.classroom).locked ? '(ล็อกตามห้อง)' : ''}</label>
                {(() => {
                  const sp = getStudyPlanConfig(editingMember.classroom);
                  if (sp.locked) {
                    return <input readOnly disabled value={sp.fixedPlan} />;
                  }
                  return (
                    <select
                      value={resolveStudyPlan(editingMember.classroom, editingMember.study_plan)}
                      onChange={(e) => setEditingMember({ ...editingMember, study_plan: e.target.value })}
                    >
                      <option value="">-- เลือกสายการเรียน --</option>
                      {sp.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              <div className="form-field">
                <label>เกรดเฉลี่ยสะสม (GPAX)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={4}
                  pattern="^[0-4]\.\d{2}$"
                  placeholder="เช่น 3.75"
                  value={editingMember.gpax}
                  onChange={(e) => setEditingMember({ ...editingMember, gpax: sanitizeGpaxInput(e.target.value) })}
                  onBlur={(e) => setEditingMember({ ...editingMember, gpax: formatGpaxOnBlur(e.target.value) })}
                />
              </div>
              <div className="form-field">
                <label>วัน/เดือน/ปีเกิด</label>
                <input type="date" value={editingMember.birth_date} onChange={(e) => setEditingMember({ ...editingMember, birth_date: e.target.value })} />
              </div>
              <div className="form-field">
                <label>สัญชาติ</label>
                <input value={editingMember.nationality} onChange={(e) => setEditingMember({ ...editingMember, nationality: e.target.value })} />
              </div>
              <div className="form-field">
                <label>ศาสนา</label>
                <select
                  value={editingMember.religion || 'พุทธ'}
                  onChange={(e) => setEditingMember({ ...editingMember, religion: e.target.value })}
                >
                  {RELIGION_OPTIONS.map((rel) => (
                    <option key={rel} value={rel}>{rel}</option>
                  ))}
                  {editingMember.religion && !RELIGION_OPTIONS.includes(editingMember.religion) && (
                    <option value={editingMember.religion}>{editingMember.religion}</option>
                  )}
                </select>
              </div>
              <div className="form-field">
                <label>เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="08x-xxx-xxxx"
                  value={editingMember.phone}
                  onChange={(e) => setEditingMember({ ...editingMember, phone: formatThaiPhoneInput(e.target.value) })}
                />
              </div>
              <div className="form-field">
                <label>ตำแหน่งในพรรค *</label>
                <select value={editingMember.position_key} onChange={(e) => setEditingMember({ ...editingMember, position_key: e.target.value })}>
                  {POSITIONS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>
                  ประสบการณ์หรือผลงาน (ถ้ามี){' '}
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
                    (จำกัดไม่เกิน 2 บรรทัด • {(editingMember.experience || '').length}/{EXPERIENCE_MAX_CHARS} ตัวอักษร)
                  </span>
                </label>
                <textarea
                  rows={2}
                  maxLength={EXPERIENCE_MAX_CHARS}
                  value={editingMember.experience}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (editingMember.experience || '').includes('\n')) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => setEditingMember({ ...editingMember, experience: sanitizeExperienceTwoLines(e.target.value) })}
                />
              </div>

              {editingMember.memberId && (
                <div className="form-field full" style={{ marginTop: 6 }}>
                  <label>อัปโหลดเอกสารแทนสมาชิก (หัวหน้าพรรค)</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {REQUIRED_DOCS.map((doc) => (
                      <label key={doc.key} className="btn-outline" style={{ cursor: 'pointer', fontSize: 12.5, padding: '6px 12px' }}>
                        <Upload size={13} /> {uploadingKey === `${editingMember.memberId}:${doc.key}` ? 'กำลังอัปโหลด...' : doc.shortLabel}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => handleDocUpload(editingMember.memberId, doc.key, e.target.files?.[0])}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-field full" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn-outline" onClick={() => setEditingMember(null)}>ยกเลิก</button>
                <button type="submit" className="btn-purple" disabled={busy}>
                  {editingMember.memberId ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Print Overlays (ONLY reachable after login!) ── */}
      {isSchoolUser && printApp && (
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

      {/* ── Official Google Sign-In Modal ── */}
      {showSignInModal && (
        <GoogleSignInModal
          supabaseClient={supabase}
          allowedDomain={allowedDomain}
          onClose={() => setShowSignInModal(false)}
          onError={(msg) => showNotice('error', msg)}
          onSuccess={() => {
            setShowSignInModal(false);
            showNotice('success', 'เข้าสู่ระบบด้วยอีเมลโรงเรียนเรียบร้อยแล้ว');
          }}
        />
      )}

      {/* ── Global Branded Action Loading Overlay ── */}
      <LoadingOverlay
        visible={Boolean(printBusy || uploadingKey || busy)}
        title={
          printBusy === 'bundle'
            ? 'กำลังเตรียมชุดเอกสารทั้งพรรค (PDF)...'
            : printBusy === 'single'
              ? 'กำลังเตรียมเอกสารใบสมัครและไฟล์แนบ...'
              : uploadingKey
                ? 'กำลังอัปโหลดเอกสารเข้าระบบ...'
                : 'กำลังบันทึกและส่งข้อมูล...'
        }
        subtitle={
          printBusy === 'bundle'
            ? 'กำลังดึงรูปภาพและแปลงไฟล์แนบของสมาชิกทุกคน อาจใช้เวลาสักครู่'
            : printBusy === 'single'
              ? 'กำลังจัดหน้าใบสมัคร ปพ.6 และใบรับรองความประพฤติ'
              : uploadingKey
                ? 'กรุณารอจนกว่าการอัปโหลดจะเสร็จสมบูรณ์ อย่าเพิ่งปิดหน้านี้'
                : 'กรุณารอสักครู่ ระบบกำลังยืนยันข้อมูลกับเซิร์ฟเวอร์'
        }
      />
    </div>
  );
}
