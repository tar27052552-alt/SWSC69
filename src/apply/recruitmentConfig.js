// Shared configuration & validation for Student Council Recruitment (Academic Year 2570)
// Reference: ระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนฯ พ.ศ.2561 (ฉบับแก้ไข พ.ศ.2569) ข้อ 19-22, 66

export const ACADEMIC_YEAR = 2570;
export const DEFAULT_TARGET_MEMBERS = 29;
export const DEFAULT_MIN_GPAX = 3.0;
export const ALLOWED_EMAIL_DOMAIN = 'sappha.ac.th';

export const CLASSROOMS = Array.from({ length: 14 }, (_, i) => `ม.4/${i + 1}`);

export const STUDY_PLANS_ROOMS_1_TO_5 = [
  'วิทย์-คณิต',
  'ศิลป์-คำนวณ',
  'ศิลป์-สังคม',
];

export const FIXED_STUDY_PLAN_BY_ROOM = {
  'ม.4/6': 'ภาษาจีน',
  'ม.4/7': 'ภาษาเมียนมา',
  'ม.4/8': 'เทคโนโลยีดิจิทัล',
  'ม.4/9': 'นิติศาสตร์',
  'ม.4/10': 'วิทย์-คณิตเข้มข้น (ISM) สุขภาพ',
  'ม.4/11': 'วิทย์-คณิตเข้มข้น (ISM) วิศวกรรมศาสตร์',
  'ม.4/12': 'ห้องเรียนพิเศษ วิทยาศาสตร์ คณิตศาสตร์และเทคโนโลยี (SMAT)',
  'ม.4/13': 'ห้องเรียนพิเศษ MEP (Mini English Program)',
  'ม.4/14': 'ห้องเรียนพิเศษ MP (Multi-lingual Program)',
};

export function getStudyPlanConfig(classroom) {
  const room = String(classroom || '').trim();
  if (FIXED_STUDY_PLAN_BY_ROOM[room]) {
    return { locked: true, fixedPlan: FIXED_STUDY_PLAN_BY_ROOM[room], options: [] };
  }
  return { locked: false, fixedPlan: '', options: STUDY_PLANS_ROOMS_1_TO_5 };
}

export function resolveStudyPlan(classroom, savedPlan = '') {
  const cfg = getStudyPlanConfig(classroom);
  if (cfg.locked) return cfg.fixedPlan;
  const clean = String(savedPlan || '').trim();
  return cfg.options.includes(clean) ? clean : '';
}

export const PREFIXES = ['นาย', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

// 16 official positions per Clause 20 (ข้อ 20) & 4 work groups per Clause 24 (ข้อ 24)
export const POSITIONS = [
  { key: 'president', label: 'ประธานคณะกรรมการสภานักเรียน', group: 'ผู้บริหารหลัก', maxSlots: 1, requiredMin: 1 },
  { key: 'vp_admin', label: 'รองประธานฯ กลุ่มงานสำนักอำนวยการ', group: 'กลุ่มบริหารอำนวยการ', maxSlots: 1, requiredMin: 1 },
  { key: 'vp_academic', label: 'รองประธานฯ กลุ่มงานวิชาการ', group: 'กลุ่มบริหารวิชาการ', maxSlots: 1, requiredMin: 1 },
  { key: 'vp_student', label: 'รองประธานฯ กลุ่มงานกิจการนักเรียน', group: 'กลุ่มบริหารกิจการนักเรียน', maxSlots: 1, requiredMin: 1 },
  { key: 'vp_general', label: 'รองประธานฯ กลุ่มงานบริหารทั่วไป', group: 'กลุ่มบริหารทั่วไป', maxSlots: 1, requiredMin: 1 },
  { key: 'secretary', label: 'เลขานุการ', group: 'ฝ่ายเลขานุการฯ', maxSlots: 1, requiredMin: 1 },
  { key: 'vice_secretary', label: 'รองเลขานุการ', group: 'ฝ่ายเลขานุการฯ', maxSlots: 1, requiredMin: 1 },
  { key: 'office', label: 'ฝ่ายสำนักงานคณะกรรมการสภานักเรียน', group: 'กลุ่มบริหารวิชาการ', maxSlots: null, requiredMin: 1 },
  { key: 'academic', label: 'ฝ่ายวิชาการ', group: 'กลุ่มบริหารวิชาการ', maxSlots: null, requiredMin: 1 },
  { key: 'finance', label: 'ฝ่ายการเงินและพัสดุ', group: 'กลุ่มบริหารอำนวยการ', maxSlots: null, requiredMin: 1 },
  { key: 'discipline', label: 'ฝ่ายปกครอง', group: 'กลุ่มบริหารอำนวยการ', maxSlots: null, requiredMin: 1 },
  { key: 'facilities', label: 'ฝ่ายอาคารสถานที่และศาสนพิธี', group: 'กลุ่มบริหารทั่วไป', maxSlots: null, requiredMin: 1 },
  { key: 'recreation', label: 'ฝ่ายสันทนาการและเครือข่ายชุมชนสัมพันธ์', group: 'กลุ่มบริหารกิจการนักเรียน', maxSlots: null, requiredMin: 1 },
  { key: 'reception', label: 'ฝ่ายปฏิคม', group: 'กลุ่มบริหารทั่วไป', maxSlots: null, requiredMin: 1 },
  { key: 'pr', label: 'ฝ่ายประชาสัมพันธ์', group: 'กลุ่มบริหารกิจการนักเรียน', maxSlots: null, requiredMin: 1 },
  { key: 'av', label: 'ฝ่ายโสตทัศนศึกษา', group: 'กลุ่มบริหารทั่วไป', maxSlots: null, requiredMin: 1 },
];

export const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.key, p]));

export const REQUIRED_DOCS = [
  {
    key: 'grade',
    field: 'doc_grade_path',
    statusField: 'doc_grade_status',
    label: 'ใบแสดงผลการเรียน ปพ.6 (GPAX ≥ 3.00)',
    shortLabel: 'ใบเกรด (ปพ.6)',
    clause: 'ข้อ 21 (6)',
    hint: 'แนบใบแสดงผลการเรียน ปพ.6 • รองรับไฟล์ภาพ (JPG/PNG/WebP) หรือ PDF ขนาดไม่เกิน 10 MB',
  },
  {
    key: 'conduct',
    field: 'doc_conduct_path',
    statusField: 'doc_conduct_status',
    label: 'หลักฐานยืนยันไม่ติดคะแนนคุณลักษณะอันพึงประสงค์',
    shortLabel: 'หลักฐานคุณลักษณะฯ',
    clause: 'ข้อ 21 (3)',
    hint: 'ต้องขอหลักฐาน/ใบรับรองจากห้องปกครอง แล้วถ่ายรูปหรือสแกนอัปโหลด (JPG/PNG/PDF)',
  },
  {
    key: 'consent',
    field: 'doc_consent_path',
    statusField: 'doc_consent_status',
    label: 'การลงนามอนุญาตจากผู้ปกครอง (เซ็นออนไลน์ลงในใบสมัคร)',
    shortLabel: 'ลายเซ็นผู้ปกครอง',
    clause: 'ข้อ 21 (9)',
    hint: 'ผู้ปกครองกรอกชื่อ-เบอร์โทร ความคิดเห็น และเซ็นออนไลน์ลงในใบสมัครหน้า ๑ ได้ทันที (ไม่มีใบรับรองแยก)',
  },
];

export const QUALIFICATIONS_CLAUSE_21 = [
  'เป็นนักเรียนที่กำลังเรียนอยู่ในปีปัจจุบันของโรงเรียนสรรพวิทยาคม',
  'ต้องสังกัดพรรคก่อนเข้ารับสมัคร (รวมกลุ่มครบ 29 คน ตามโครงสร้าง 16 ตำแหน่ง)',
  'ต้องไม่ติดคะแนนคุณลักษณะอันพึงประสงค์ตอนที่ยื่นสมัคร',
  'มีความตั้งใจและสนใจต่องานคณะกรรมการสภานักเรียนด้วยความบริสุทธิ์ใจ',
  'ต้องกำลังศึกษาอยู่ในระดับชั้นมัธยมศึกษาปีที่ 4 ในปีการศึกษาที่มีการจัดเลือกตั้ง',
  'ต้องมีคะแนนเฉลี่ยของผลการเรียนสะสมในภาคเรียนล่าสุดไม่ต่ำกว่า 3.00 (GPAX ≥ 3.00)',
  'เลื่อมใสในการปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข',
  'ไม่เป็นพรรคที่มีสมาชิกพรรคมาจากชมรม หรือห้องเรียนพิเศษห้องใดห้องหนึ่งทั้งหมด',
  'ต้องได้รับอนุญาตจากผู้ปกครองเป็นลายลักษณ์อักษร',
];

export const CLAUSE_14_ITEMS = [
  { key: '1', numThai: '๑', text: 'ต้องเป็นนักเรียนที่กำลังเรียนอยู่ในปีปัจจุบันของโรงเรียนสรรพวิทยาคม' },
  { key: '2', numThai: '๒', text: 'ต้องสังกัดพรรคก่อนเข้ารับสมัคร (เว้นแต่เมื่อตำแหน่งว่างลงหลังการแถลงนโยบาย)' },
  { key: '3', numThai: '๓', text: 'ต้องไม่ติดคะแนนคุณลักษณะอันพึงประสงค์ตอนที่ยื่นสมัคร' },
  { key: '4', numThai: '๔', text: 'ต้องมีความตั้งใจและสนใจต่องานคณะกรรมการนักเรียนด้วยความบริสุทธิ์ใจ' },
  { key: '5', numThai: '๕', text: 'ต้องกำลังศึกษาอยู่ในระดับชั้นมัธยมศึกษาปีที่ ๔ ในปีการศึกษาที่มีการจัดเลือกตั้ง' },
  { key: '6', numThai: '๖', text: 'ต้องมีคะแนนเฉลี่ยของผลการเรียนสะสมในภาคเรียนล่าสุดไม่ต่ำกว่า ๓.๐๐' },
  { key: '7', numThai: '๗', text: 'ต้องเลื่อมใสในการปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข' },
  { key: '8', numThai: '๘', text: 'ผลการทดสอบความรู้ระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนโรงเรียนสรรพวิทยาคม' },
];

export const PARTY_STATUS_META = {
  draft: { label: 'กำลังจัดเตรียม (ร่าง)', tone: 'slate' },
  submitted: { label: 'ส่งใบสมัครแล้ว (รอ คณะกรรมการสภานักเรียน ตรวจ)', tone: 'amber' },
  revision_requested: { label: 'ส่งกลับให้แก้ไขเอกสาร', tone: 'rose' },
  approved: { label: 'ผ่านการรับรองคุณสมบัติ', tone: 'emerald' },
  rejected: { label: 'ไม่ผ่านการรับรอง', tone: 'red' },
};

export const MEMBER_STATUS_META = {
  pending: { label: 'รอตรวจ', tone: 'slate' },
  approved: { label: 'ผ่าน', tone: 'emerald' },
  revision_requested: { label: 'ขอแก้ไข', tone: 'rose' },
};

export function isValidSchoolEmail(email, domain = ALLOWED_EMAIL_DOMAIN) {
  const clean = String(email || '').trim().toLowerCase();
  const suffix = `@${String(domain || ALLOWED_EMAIL_DOMAIN).toLowerCase()}`;
  return clean.endsWith(suffix) && clean.length > suffix.length && !clean.includes(' ');
}

export function extractStudentIdFromEmail(email) {
  const local = String(email || '').trim().toLowerCase().split('@')[0] || '';
  const match = local.match(/^(\d{4,10})$/);
  return match ? match[1] : '';
}

export function hasOnlineGuardianConsent(member) {
  return Boolean(
    member?.guardian_signature_data
    && String(member?.guardian_name || '').trim()
    && String(member?.guardian_phone || '').trim(),
  );
}

export function isMemberSubmittedLocked(member) {
  return Boolean(member?.member_submitted_at) && member?.member_status !== 'revision_requested';
}

export function getMemberCompleteness(member, minGpax = DEFAULT_MIN_GPAX) {
  const missing = [];
  if (!String(member?.full_name || '').trim()) missing.push('ชื่อ-นามสกุล');
  if (!String(member?.student_id || '').trim()) missing.push('เลขประจำตัวนักเรียน');
  if (!String(member?.classroom || '').trim()) missing.push('ห้องเรียน ม.4');
  if (!String(member?.position_key || '').trim() || !POSITION_MAP[member.position_key]) missing.push('ตำแหน่งในพรรค');
  const gpax = Number(member?.gpax);
  if (!Number.isFinite(gpax) || gpax < Number(minGpax)) missing.push(`GPAX ≥ ${Number(minGpax).toFixed(2)}`);
  if (!member?.student_signature_data) missing.push('ลายเซ็นนักเรียน');
  if (!member?.doc_grade_path) missing.push('ใบแสดงผลการเรียน ปพ.6');
  if (!member?.doc_conduct_path) missing.push('หลักฐานคุณลักษณะฯ');
  if (!member?.doc_consent_path && !hasOnlineGuardianConsent(member)) missing.push('คำยินยอมและลายเซ็นผู้ปกครอง');
  return {
    complete: missing.length === 0,
    submitted: isMemberSubmittedLocked(member),
    missing,
  };
}

export function computeRoomBreakdown(members = []) {
  const byClassroom = {};
  const bySpecialRoom = {};
  let specialCount = 0;

  for (const m of members) {
    const room = String(m?.classroom || '').trim() || 'ยังไม่ระบุห้อง';
    byClassroom[room] = (byClassroom[room] || 0) + 1;
    if (m?.is_special_room) {
      specialCount += 1;
      const tag = String(m?.special_room_or_club || '').trim() || room;
      bySpecialRoom[tag] = (bySpecialRoom[tag] || 0) + 1;
    }
  }

  return {
    byClassroom,
    bySpecialRoom,
    specialCount,
    distinctClassrooms: Object.keys(byClassroom).filter((k) => k !== 'ยังไม่ระบุห้อง').length,
  };
}

export function validatePartySubmission(party, members = [], settings = {}) {
  const targetCount = Number(settings?.target_member_count || DEFAULT_TARGET_MEMBERS);
  const minGpax = Number(settings?.min_gpax ?? DEFAULT_MIN_GPAX);
  const maxPerSpecial = settings?.max_per_special_room ? Number(settings.max_per_special_room) : null;
  const maxPerClassroom = settings?.max_per_classroom ? Number(settings.max_per_classroom) : null;

  const checks = [];

  // 1. Party basic info (only party_name is required; policies are optional)
  const hasPartyName = Boolean(String(party?.party_name || '').trim());
  const policies = Array.isArray(party?.policies) ? party.policies.filter((p) => String(p?.title || '').trim()) : [];
  checks.push({
    key: 'party_info',
    label: 'ระบุชื่อพรรคครบถ้วน',
    ok: hasPartyName,
    detail: !hasPartyName
      ? 'กรุณาระบุชื่อพรรค'
      : policies.length > 0
        ? `ชื่อพรรคพร้อมแล้ว (มี ${policies.length} นโยบาย)`
        : 'ชื่อพรรคพร้อมแล้ว (นโยบายไม่บังคับกรอก)',
  });

  // 2. Exact member count (29)
  checks.push({
    key: 'member_count',
    label: `จำนวนสมาชิกพรรคครบ ${targetCount} คน`,
    ok: members.length === targetCount,
    detail: `ปัจจุบัน ${members.length} / ${targetCount} คน`,
  });

  // 3. Position coverage (all 16 positions filled & single-slot positions not exceeded)
  const posCounts = {};
  for (const m of members) {
    if (m?.position_key) posCounts[m.position_key] = (posCounts[m.position_key] || 0) + 1;
  }
  const missingPositions = POSITIONS.filter((p) => (posCounts[p.key] || 0) < p.requiredMin).map((p) => p.label);
  const exceededPositions = POSITIONS.filter((p) => p.maxSlots && (posCounts[p.key] || 0) > p.maxSlots).map((p) => p.label);
  checks.push({
    key: 'positions',
    label: 'จัดสรรตำแหน่งครบทั้ง 16 ตำแหน่ง/ฝ่าย (ตามข้อ 20)',
    ok: missingPositions.length === 0 && exceededPositions.length === 0,
    detail:
      exceededPositions.length > 0
        ? `ตำแหน่งซ้ำเกินกำหนด: ${exceededPositions.join(', ')}`
        : missingPositions.length > 0
          ? `ยังขาด ${missingPositions.length} ตำแหน่ง: ${missingPositions.slice(0, 3).join(', ')}${missingPositions.length > 3 ? ' ...' : ''}`
          : 'ครบทุกตำแหน่งหลักและทุกฝ่ายงาน',
  });

  // 4. All members complete (M.4, GPAX >= 3.00, signatures & docs) and individually submitted
  const incompleteMembers = members
    .map((m) => ({ member: m, ...getMemberCompleteness(m, minGpax) }))
    .filter((r) => !r.complete);
  const unsubmittedMembers = members.filter((m) => !isMemberSubmittedLocked(m));
  checks.push({
    key: 'members_docs',
    label: `สมาชิกทุกคนกรอกข้อมูลครบ เกรด ≥ ${minGpax.toFixed(2)} เซ็นชื่อและแนบเอกสารครบ`,
    ok: members.length > 0 && incompleteMembers.length === 0,
    detail:
      incompleteMembers.length === 0
        ? 'ข้อมูล ลายเซ็น และเอกสารครบทุกคน'
        : `ยังไม่ครบ ${incompleteMembers.length} คน`,
  });
  checks.push({
    key: 'members_submitted',
    label: 'สมาชิกทุกคนกด "ยืนยันและส่งใบสมัครของฉัน" แล้ว',
    ok: members.length > 0 && unsubmittedMembers.length === 0,
    detail:
      unsubmittedMembers.length === 0
        ? `ยืนยันส่งครบทุกคน (${members.length}/${members.length})`
        : `รอยืนยันส่งอีก ${unsubmittedMembers.length} คน`,
  });

  // 5. Classroom diversity (not all from one classroom / special room) & optional admin quotas
  const breakdown = computeRoomBreakdown(members);
  const allSameRoom = members.length >= 2 && breakdown.distinctClassrooms <= 1;
  const allSpecial = members.length >= 2 && breakdown.specialCount === members.length;
  const specialQuotaExceeded = maxPerSpecial
    ? Object.entries(breakdown.bySpecialRoom).filter(([, count]) => count > maxPerSpecial)
    : [];
  const classroomQuotaExceeded = maxPerClassroom
    ? Object.entries(breakdown.byClassroom).filter(([room, count]) => room !== 'ยังไม่ระบุห้อง' && count > maxPerClassroom)
    : [];

  let diversityOk = !allSameRoom && !allSpecial && specialQuotaExceeded.length === 0 && classroomQuotaExceeded.length === 0;
  let diversityDetail = `กระจายตัว ${breakdown.distinctClassrooms} ห้องเรียน (ห้องเรียนพิเศษ ${breakdown.specialCount} คน)`;
  if (allSameRoom) diversityDetail = 'สมาชิกทุกคนมาจากห้องเรียนเดียวกันทั้งหมด (ขัดระเบียบข้อ 22)';
  else if (allSpecial) diversityDetail = 'สมาชิกทุกคนมาจากห้องเรียนพิเศษทั้งหมด (ขัดระเบียบข้อ 21(8) และข้อ 22)';
  else if (specialQuotaExceeded.length > 0) {
    diversityDetail = `เกินโควต้าห้องเรียนพิเศษ/ชมรม (สูงสุด ${maxPerSpecial} คน): ${specialQuotaExceeded.map(([k, v]) => `${k} (${v})`).join(', ')}`;
  } else if (classroomQuotaExceeded.length > 0) {
    diversityDetail = `เกินโควต้าต่อห้องเรียน (สูงสุด ${maxPerClassroom} คน): ${classroomQuotaExceeded.map(([k, v]) => `${k} (${v})`).join(', ')}`;
  }

  checks.push({
    key: 'diversity',
    label: 'สัดส่วนห้องเรียนและห้องเรียนพิเศษเป็นไปตามระเบียบข้อ 22',
    ok: diversityOk,
    detail: diversityDetail,
  });

  return {
    canSubmit: checks.every((c) => c.ok),
    checks,
    breakdown,
    incompleteMembers,
  };
}
