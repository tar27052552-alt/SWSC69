import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse } from '../_shared/auth.ts';

const ACADEMIC_YEAR = 2570;
const BUCKET = 'recruitment-docs';
const ALLOWED_DOC_TYPES = new Set(['grade', 'conduct', 'consent']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_CLASSROOMS = new Set(Array.from({ length: 14 }, (_, i) => `ม.4/${i + 1}`));
const COUNCIL_TEST_SPECIAL_EMAILS = new Set(['swscsappha@sappha.ac.th']);

function sanitizeSignatureData(raw: unknown): string | null {
  if (raw === '' || raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('data:image/png;base64,') || trimmed.length > 350000) return null;
  return trimmed;
}

function isValidMemberStoragePath(path: unknown, partyId: string, memberId: string): boolean {
  if (typeof path !== 'string') return false;
  const clean = path.trim();
  if (!clean) return true; // empty string clears the path
  if (clean.includes('..') || clean.includes('\\')) return false;
  return clean.startsWith(`${ACADEMIC_YEAR}/${partyId}/${memberId}/`);
}

// Google Drive folder IDs for M4 student photos ("รวมรูปนักเรียน 2569" -> M4 -> 4.1..4.14)
const M4_DRIVE_FOLDERS: Record<string, string> = {
  'ม.4/1': '1WXOxEvDFU4LDkohvRULhssJW19arAgWl',
  'ม.4/2': '1YQmfXxwGyB6iicKPyYcD2FG9yxaU_1Cz',
  'ม.4/3': '10aSXTekBlEPUTlQyfBHxxGm4odmkxVc8',
  'ม.4/4': '16Fa1FP5Xc-fmkTy2T3qg3RMWP3ReTH_0',
  'ม.4/5': '1zuvU8ZDM8nrBi1lpChmKAl2TfTFzTt0-',
  'ม.4/6': '1QT28sjSqtonqoKfYePLnaaZbH41-pZ4U',
  'ม.4/7': '1rw6I4p3vmJJ_dLvq78UbwXjYoFvIv3R7',
  'ม.4/8': '1yZ_U5QS2GqERZT9rXoMhK6bTnaOgsFSh',
  'ม.4/9': '1iWice2bZq73M5yBytVz_Bn8vELl-OBtd',
  'ม.4/10': '1SrXE0nhiClVJOOQTAMqNaDHc-kZWNd7j',
  'ม.4/11': '1pnuQXP4Tpl9z4JPjV6wGhzgluZ8zF5d-',
  'ม.4/12': '1CwV8nQVhXfms-OjjGLdEesDjAYrHO4S0',
  'ม.4/13': '1RA5p1woRFKJQzZhyEfBbqRNzJHUrkT3l',
  'ม.4/14': '1NAD6sHGzOQsPC_CS4syaYS4ul1cNhof8',
};

const folderIndexCache = new Map<string, { at: number; files: Record<string, string> }>();

async function getDriveFolderIndex(folderId: string): Promise<Record<string, string>> {
  const cached = folderIndexCache.get(folderId);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.files;
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`);
  if (!res.ok) return {};
  const html = await res.text();
  const re = /href="https:\/\/drive\.google\.com\/file\/d\/([^"?\/]+)[^"]*"[^>]*>.*?<div class="flip-entry-title">([^<]+)<\/div>/gs;
  const files: Record<string, string> = {};
  for (const m of html.matchAll(re)) {
    const fileId = m[1];
    const title = m[2].trim();
    const stem = title.replace(/\.[^.]+$/, '').trim().toLowerCase();
    if (stem) files[stem] = fileId;
  }
  folderIndexCache.set(folderId, { at: Date.now(), files });
  return files;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function resolveStudentPhoto(
  admin: ReturnType<typeof getAdminClient>,
  { studentId, classroom }: { studentId: string; classroom: string; photoPath?: string | null },
) {
  // Strictly resolve official student photo from school Google Drive folder (M4 / 4.x / <studentId>.JPG)
  const cleanId = String(studentId || '').trim().toLowerCase();
  if (!cleanId) return { found: false };

  let fileId: string | null = null;
  const primaryFolder = M4_DRIVE_FOLDERS[classroom];
  if (primaryFolder) {
    const idx = await getDriveFolderIndex(primaryFolder);
    fileId = idx[cleanId] || null;
  }
  // Fallback: search remaining M4 folders if student changed room or selected wrong room
  if (!fileId) {
    const others = Object.values(M4_DRIVE_FOLDERS).filter((id) => id !== primaryFolder);
    const indexes = await Promise.all(others.map((id) => getDriveFolderIndex(id)));
    for (const idx of indexes) {
      if (idx[cleanId]) {
        fileId = idx[cleanId];
        break;
      }
    }
  }
  if (fileId) {
    const imgRes = await fetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w600`);
    if (imgRes.ok) {
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
      return { found: true, source: 'drive', fileId, mimeType, base64: bytesToBase64(arr) };
    }
  }

  // 3. Fallback for Student Council test accounts: use avatar stored in public.users
  const { data: councilUser } = await admin
    .from('users')
    .select('avatar')
    .eq('student_id', cleanId)
    .neq('student_id', '00000')
    .eq('banned', false)
    .maybeSingle();
  const rawAvatar = typeof councilUser?.avatar === 'string' ? councilUser.avatar.trim() : '';
  const dataUriMatch = rawAvatar.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      found: true,
      source: 'council_avatar',
      mimeType: dataUriMatch[1],
      base64: dataUriMatch[2],
    };
  }

  return { found: false };
}
const REQUIRED_POSITIONS = [
  { key: 'president', label: 'ประธานคณะกรรมการสภานักเรียน', maxSlots: 1 },
  { key: 'vp_admin', label: 'รองประธานฯ กลุ่มงานสำนักอำนวยการ', maxSlots: 1 },
  { key: 'vp_academic', label: 'รองประธานฯ กลุ่มงานวิชาการ', maxSlots: 1 },
  { key: 'vp_student', label: 'รองประธานฯ กลุ่มงานกิจการนักเรียน', maxSlots: 1 },
  { key: 'vp_general', label: 'รองประธานฯ กลุ่มงานบริหารทั่วไป', maxSlots: 1 },
  { key: 'secretary', label: 'เลขานุการ', maxSlots: 1 },
  { key: 'vice_secretary', label: 'รองเลขานุการ', maxSlots: 1 },
  { key: 'office', label: 'ฝ่ายสำนักงานคณะกรรมการสภานักเรียน', maxSlots: null },
  { key: 'academic', label: 'ฝ่ายวิชาการ', maxSlots: null },
  { key: 'finance', label: 'ฝ่ายการเงินและพัสดุ', maxSlots: null },
  { key: 'discipline', label: 'ฝ่ายปกครอง', maxSlots: null },
  { key: 'facilities', label: 'ฝ่ายอาคารสถานที่และศาสนพิธี', maxSlots: null },
  { key: 'recreation', label: 'ฝ่ายสันทนาการและเครือข่ายชุมชนสัมพันธ์', maxSlots: null },
  { key: 'reception', label: 'ฝ่ายปฏิคม', maxSlots: null },
  { key: 'pr', label: 'ฝ่ายประชาสัมพันธ์', maxSlots: null },
  { key: 'av', label: 'ฝ่ายโสตทัศนศึกษา', maxSlots: null },
];
const POSITION_MAP = Object.fromEntries(REQUIRED_POSITIONS.map((p) => [p.key, p]));

function fail(error: string, status = 400) {
  return jsonResponse({ error }, status);
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'SW70-' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function cleanEmail(email: unknown) {
  return String(email || '').trim().toLowerCase();
}

function isSchoolEmail(email: string, domain: string) {
  const suffix = `@${domain.toLowerCase()}`;
  return email.endsWith(suffix) && email.length > suffix.length && !email.includes(' ');
}

function extractStudentIdFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const m = local.match(/^(\d{4,10})$/);
  return m ? m[1] : '';
}

async function lookupEligibleM4(
  admin: ReturnType<typeof getAdminClient>,
  studentId: string,
) {
  const cleanId = String(studentId || '').trim();
  if (!cleanId) return null;
  const { data, error } = await admin
    .from('recruitment_eligible_students')
    .select('student_id, prefix, full_name, classroom, student_no')
    .eq('academic_year', ACADEMIC_YEAR)
    .eq('student_id', cleanId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function lookupCouncilTestUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  fallbackStudentId = '',
) {
  const clean = cleanEmail(email);
  const isSpecial = COUNCIL_TEST_SPECIAL_EMAILS.has(clean);
  const sid = extractStudentIdFromEmail(clean) || fallbackStudentId.trim();
  if (!isSpecial && (!sid || sid === '00000')) return null;

  const { data: councilUsers, error: cErr } = await admin
    .from('users')
    .select('student_id')
    .neq('student_id', '00000')
    .eq('banned', false)
    .order('student_id', { ascending: true });
  if (cErr) throw cErr;

  const sortedIds = (councilUsers || [])
    .map((u) => String(u.student_id || '').trim())
    .filter(Boolean);

  let slotIndex = -1;
  if (isSpecial) {
    slotIndex = 0;
  } else {
    const idx = sortedIds.indexOf(sid);
    if (idx < 0) return null;
    slotIndex = idx + 1;
  }

  // Deterministically assign a unique real M.4 student spread round-robin across ม.4/1..ม.4/14
  // so council testers can verify real M.4 roster data + Google Drive M.4 photos end-to-end.
  const { data: m4Rows, error: mErr } = await admin
    .from('recruitment_eligible_students')
    .select('student_id, prefix, full_name, classroom, student_no')
    .eq('academic_year', ACADEMIC_YEAR)
    .order('student_id', { ascending: true });
  if (mErr) throw mErr;
  if (!m4Rows || m4Rows.length === 0) return null;

  const byRoom: Record<string, typeof m4Rows> = {};
  for (const r of m4Rows) {
    byRoom[r.classroom] = byRoom[r.classroom] || [];
    byRoom[r.classroom].push(r);
  }
  const rooms = Array.from({ length: 14 }, (_, i) => `ม.4/${i + 1}`).filter((rm) => (byRoom[rm]?.length || 0) > 0);
  const roundRobin: typeof m4Rows = [];
  let depth = 0;
  while (roundRobin.length < m4Rows.length) {
    let added = false;
    for (const rm of rooms) {
      if (byRoom[rm][depth]) {
        roundRobin.push(byRoom[rm][depth]);
        added = true;
      }
    }
    if (!added) break;
    depth += 1;
  }

  const picked = roundRobin[slotIndex % roundRobin.length];
  return {
    student_id: picked.student_id,
    prefix: picked.prefix,
    full_name: picked.full_name,
    classroom: picked.classroom,
    student_no: picked.student_no ?? null,
    simulated_m4: true,
  };
}

async function lookupEligibleApplicant(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  allowCouncilTest: boolean,
  fallbackStudentId = '',
) {
  const sid = extractStudentIdFromEmail(cleanEmail(email)) || fallbackStudentId.trim();
  if (sid) {
    const m4 = await lookupEligibleM4(admin, sid);
    if (m4) return { eligible: true, isTestAccount: false, student: m4 };
  }
  if (allowCouncilTest) {
    const council = await lookupCouncilTestUser(admin, email, fallbackStudentId);
    if (council) return { eligible: true, isTestAccount: true, student: council };
  }
  return { eligible: false, isTestAccount: false, student: null };
}

function isUuid(v: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
}

async function getCallerUser(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Missing Supabase Auth environment');
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await caller.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function getSettings(admin: ReturnType<typeof getAdminClient>) {
  const { data, error } = await admin
    .from('recruitment_settings')
    .select('*')
    .eq('academic_year', ACADEMIC_YEAR)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: insErr } = await admin
    .from('recruitment_settings')
    .insert({ academic_year: ACADEMIC_YEAR })
    .select('*')
    .single();
  if (insErr) throw insErr;
  return created;
}

async function requireCouncilAdmin(admin: ReturnType<typeof getAdminClient>, authUserId: string) {
  const { data, error } = await admin
    .from('users')
    .select('id,role,dept_id,banned')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.banned === true) return null;
  const isAllowed = data.role === 'admin' || data.role === 'president' || Number(data.dept_id) === 3;
  if (!isAllowed) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const admin = getAdminClient();
    const settings = await getSettings(admin);
    const domain = String(settings.allowed_email_domain || 'sappha.ac.th').toLowerCase();

    // ── 1. PUBLIC OVERVIEW (No auth required) ──
    if (action === 'public_overview') {
      let approvedParties: unknown[] = [];
      if (settings.publish_approved_parties) {
        const { data: parties, error: pErr } = await admin
          .from('recruitment_parties')
          .select('id, party_name, slogan, ideology, policies, party_number, approved_at:reviewed_at')
          .eq('academic_year', ACADEMIC_YEAR)
          .eq('status', 'approved')
          .order('party_number', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
        if (pErr) throw pErr;
        if (parties && parties.length > 0) {
          const ids = parties.map((p) => p.id);
          const { data: members } = await admin
            .from('recruitment_members')
            .select('party_id, prefix, full_name, classroom, position_key, position_label, is_leader, sort_order')
            .in('party_id', ids)
            .order('sort_order', { ascending: true })
            .order('is_leader', { ascending: false })
            .order('created_at', { ascending: true });
          const byParty: Record<string, unknown[]> = {};
          for (const m of members || []) {
            byParty[m.party_id] = byParty[m.party_id] || [];
            byParty[m.party_id].push(m);
          }
          approvedParties = parties.map((p) => ({ ...p, members: byParty[p.id] || [] }));
        }
      }
      return jsonResponse({ settings, approvedParties });
    }

    // ── AUTHENTICATED CALLER REQUIRED BELOW ──
    const callerUser = await getCallerUser(req);
    if (!callerUser) return fail('กรุณาเข้าสู่ระบบก่อนดำเนินการ', 401);

    // ── 2. ADMIN (คณะกรรมการสภานักเรียน) ACTIONS ──
    if (action.startsWith('admin_')) {
      const councilAdmin = await requireCouncilAdmin(admin, callerUser.id);
      if (!councilAdmin) return fail('เฉพาะผู้ดูแลระบบ (คณะกรรมการสภานักเรียน) เท่านั้น', 403);

      if (action === 'admin_overview') {
        const { data: parties, error: pErr } = await admin
          .from('recruitment_parties')
          .select('*')
          .eq('academic_year', ACADEMIC_YEAR)
          .order('created_at', { ascending: false });
        if (pErr) throw pErr;
        const { data: members, error: mErr } = await admin
          .from('recruitment_members')
          .select('*')
          .eq('academic_year', ACADEMIC_YEAR)
          .order('sort_order', { ascending: true })
          .order('is_leader', { ascending: false })
          .order('created_at', { ascending: true });
        if (mErr) throw mErr;

        const { data: councilUsers } = await admin
          .from('users')
          .select('student_id')
          .neq('student_id', '00000')
          .eq('banned', false);
        const councilIdSet = new Set((councilUsers || []).map((u) => String(u.student_id || '').trim()).filter(Boolean));
        const isTestEmailOrId = (email: unknown, studentId?: unknown) => {
          const clean = cleanEmail(email);
          if (COUNCIL_TEST_SPECIAL_EMAILS.has(clean)) return true;
          const sidFromEmail = extractStudentIdFromEmail(clean);
          if (sidFromEmail && councilIdSet.has(sidFromEmail)) return true;
          const sid = String(studentId || '').trim();
          return Boolean(sid && councilIdSet.has(sid));
        };

        const taggedMembers = (members || []).map((m) => ({
          ...m,
          is_test_account: isTestEmailOrId(m.email, m.student_id),
        }));
        const testPartyIds = new Set(taggedMembers.filter((m) => m.is_test_account).map((m) => m.party_id));
        const taggedParties = (parties || []).map((p) => ({
          ...p,
          has_test_members: testPartyIds.has(p.id) || isTestEmailOrId(p.leader_email),
        }));

        return jsonResponse({ settings, parties: taggedParties, members: taggedMembers });
      }

      if (action === 'admin_update_settings') {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof body.is_open === 'boolean') patch.is_open = body.is_open;
        if (typeof body.allow_council_test === 'boolean') patch.allow_council_test = body.allow_council_test;
        if (body.target_member_count !== undefined) {
          const n = Number(body.target_member_count);
          if (!Number.isInteger(n) || n < 1 || n > 50) return fail('จำนวนสมาชิกต้องอยู่ระหว่าง 1-50 คน');
          patch.target_member_count = n;
        }
        if (body.min_gpax !== undefined) {
          const g = Number(body.min_gpax);
          if (!Number.isFinite(g) || g < 0 || g > 4) return fail('GPAX ขั้นต่ำไม่ถูกต้อง');
          patch.min_gpax = Number(g.toFixed(2));
        }
        if (body.max_per_special_room !== undefined) {
          patch.max_per_special_room = body.max_per_special_room === '' || body.max_per_special_room === null
            ? null
            : Math.max(1, Number(body.max_per_special_room));
        }
        if (body.max_per_classroom !== undefined) {
          patch.max_per_classroom = body.max_per_classroom === '' || body.max_per_classroom === null
            ? null
            : Math.max(1, Number(body.max_per_classroom));
        }
        if (body.open_at !== undefined) {
          patch.open_at = body.open_at ? new Date(body.open_at).toISOString() : null;
        }
        if (body.deadline_at !== undefined) {
          patch.deadline_at = body.deadline_at ? new Date(body.deadline_at).toISOString() : null;
        }
        if (typeof body.publish_approved_parties === 'boolean') {
          patch.publish_approved_parties = body.publish_approved_parties;
        }
        if (typeof body.consent_template_url === 'string') {
          patch.consent_template_url = body.consent_template_url.trim().slice(0, 1000);
        }
        if (typeof body.announcement_note === 'string') {
          patch.announcement_note = body.announcement_note.trim().slice(0, 2000);
        }
        if (Array.isArray(body.timeline)) {
          patch.timeline = body.timeline.slice(0, 12);
        }
        const { data: updated, error } = await admin
          .from('recruitment_settings')
          .update(patch)
          .eq('academic_year', ACADEMIC_YEAR)
          .select('*')
          .single();
        if (error) throw error;
        return jsonResponse({ settings: updated });
      }

      if (action === 'admin_review_member') {
        if (!isUuid(body.memberId)) return fail('รหัสสมาชิกไม่ถูกต้อง');
        const allowed = new Set(['pending', 'approved', 'revision_requested']);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (allowed.has(body.doc_grade_status)) patch.doc_grade_status = body.doc_grade_status;
        if (allowed.has(body.doc_conduct_status)) patch.doc_conduct_status = body.doc_conduct_status;
        if (allowed.has(body.doc_consent_status)) patch.doc_consent_status = body.doc_consent_status;
        if (allowed.has(body.member_status)) patch.member_status = body.member_status;
        if (
          patch.member_status === 'revision_requested'
          || patch.doc_grade_status === 'revision_requested'
          || patch.doc_conduct_status === 'revision_requested'
          || patch.doc_consent_status === 'revision_requested'
        ) {
          patch.member_submitted_at = null;
        }
        if (typeof body.review_note === 'string') patch.review_note = body.review_note.trim().slice(0, 1000);
        if (body.clause14_checks && typeof body.clause14_checks === 'object' && !Array.isArray(body.clause14_checks)) {
          const validKeys = new Set(['1', '2', '3', '4', '5', '6', '7', '8', 'overall']);
          const validVals = new Set(['pass', 'fail', '']);
          const cleanChecks: Record<string, string> = {};
          for (const [k, v] of Object.entries(body.clause14_checks as Record<string, unknown>)) {
            const val = String(v || '');
            if (validKeys.has(k) && validVals.has(val)) {
              if (val) cleanChecks[k] = val;
            }
          }
          patch.clause14_checks = cleanChecks;
        }

        const { data: updated, error } = await admin
          .from('recruitment_members')
          .update(patch)
          .eq('id', body.memberId)
          .select('*')
          .single();
        if (error) throw error;
        return jsonResponse({ member: updated });
      }

      if (action === 'admin_bulk_approve_members') {
        if (!isUuid(body.partyId)) return fail('รหัสพรรคไม่ถูกต้อง');
        const nowIso = new Date().toISOString();
        const allPassChecks = {
          '1': 'pass', '2': 'pass', '3': 'pass', '4': 'pass',
          '5': 'pass', '6': 'pass', '7': 'pass', '8': 'pass',
          overall: 'pass',
        };
        const { data: updated, error } = await admin
          .from('recruitment_members')
          .update({
            doc_grade_status: 'approved',
            doc_conduct_status: 'approved',
            doc_consent_status: 'approved',
            member_status: 'approved',
            clause14_checks: allPassChecks,
            updated_at: nowIso,
          })
          .eq('party_id', body.partyId)
          .eq('academic_year', ACADEMIC_YEAR)
          .select('*');
        if (error) throw error;
        return jsonResponse({ members: updated || [] });
      }

      if (action === 'admin_review_party') {
        if (!isUuid(body.partyId)) return fail('รหัสพรรคไม่ถูกต้อง');
        const allowed = new Set(['draft', 'submitted', 'revision_requested', 'approved', 'rejected']);
        if (!allowed.has(body.status)) return fail('สถานะพรรคไม่ถูกต้อง');
        const patch: Record<string, unknown> = {
          status: body.status,
          review_note: typeof body.review_note === 'string' ? body.review_note.trim().slice(0, 2000) : '',
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (body.party_number !== undefined) {
          patch.party_number = body.party_number === '' || body.party_number === null
            ? null
            : Math.max(1, Number(body.party_number));
        }
        const { data: updated, error } = await admin
          .from('recruitment_parties')
          .update(patch)
          .eq('id', body.partyId)
          .select('*')
          .single();
        if (error) throw error;
        return jsonResponse({ party: updated });
      }

      if (action === 'admin_delete_party') {
        if (!isUuid(body.partyId)) return fail('รหัสพรรคไม่ถูกต้อง');
        const { error } = await admin
          .from('recruitment_parties')
          .delete()
          .eq('id', body.partyId)
          .eq('academic_year', ACADEMIC_YEAR);
        if (error) throw error;
        return jsonResponse({ deleted: true, partyId: body.partyId });
      }

      if (action === 'admin_get_doc_url') {
        const path = String(body.path || '').trim();
        if (!path || path.includes('..') || path.includes('\\') || !path.startsWith(`${ACADEMIC_YEAR}/`)) {
          return fail('เส้นทางไฟล์ไม่ถูกต้อง');
        }
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
        if (error) throw error;
        return jsonResponse({ signedUrl: data.signedUrl });
      }

      if (action === 'admin_get_student_photo') {
        const photo = await resolveStudentPhoto(admin, {
          studentId: String(body.student_id || ''),
          classroom: String(body.classroom || ''),
          photoPath: body.photo_path ? String(body.photo_path) : null,
        });
        return jsonResponse(photo);
      }

      return fail('ไม่พบคำสั่งหลังบ้านที่ร้องขอ', 404);
    }

    // ── 3. STUDENT ACTIONS (Strict @sappha.ac.th + Official M.4 Roster enforcement!) ──
    const userEmail = cleanEmail(callerUser.email);
    if (!isSchoolEmail(userEmail, domain)) {
      return fail(`กรุณาเข้าสู่ระบบด้วยอีเมลโรงเรียน (@${domain}) เท่านั้น`, 403);
    }

    const allowCouncilTest = Boolean(settings.allow_council_test);
    const eligibility = await lookupEligibleApplicant(admin, userEmail, allowCouncilTest);
    const eligibleStudent = eligibility.student;
    const isTestAccount = eligibility.isTestAccount;

    if (!eligibility.eligible || !eligibleStudent) {
      if (action === 'my_state') {
        return jsonResponse({
          settings,
          me: { email: userEmail, authUserId: callerUser.id },
          eligible: false,
          isTestAccount: false,
          eligibilityError: 'บัญชีนี้ไม่อยู่ในรายชื่อนักเรียนชั้นมัธยมศึกษาปีที่ 4 โรงเรียนสรรพวิทยาคม (เฉพาะนักเรียน ม.4 เท่านั้นที่มีสิทธิลงสมัครรับเลือกตั้ง)',
          eligibleStudent: null,
          party: null,
          myMember: null,
          members: [],
        });
      }
      return fail('ไม่มีสิทธิลงสมัครรับเลือกตั้ง — เฉพาะนักเรียนชั้นมัธยมศึกษาปีที่ 4 ตามรายชื่อโรงเรียนเท่านั้น', 403);
    }

    // Auto-link any pre-added member record matching this school email
    const { data: existingMember } = await admin
      .from('recruitment_members')
      .select('*')
      .eq('academic_year', ACADEMIC_YEAR)
      .ilike('email', userEmail)
      .maybeSingle();

    if (existingMember && !existingMember.auth_user_id) {
      await admin
        .from('recruitment_members')
        .update({ auth_user_id: callerUser.id, updated_at: new Date().toISOString() })
        .eq('id', existingMember.id);
      existingMember.auth_user_id = callerUser.id;
    }

    const loadMyState = async () => {
      const { data: myMember } = await admin
        .from('recruitment_members')
        .select('*')
        .eq('academic_year', ACADEMIC_YEAR)
        .ilike('email', userEmail)
        .maybeSingle();

      if (!myMember) {
        return {
          settings,
          me: { email: userEmail, authUserId: callerUser.id },
          eligible: true,
          isTestAccount,
          eligibleStudent,
          party: null,
          myMember: null,
          members: [],
        };
      }

      const { data: party } = await admin
        .from('recruitment_parties')
        .select('*')
        .eq('id', myMember.party_id)
        .maybeSingle();

      const { data: members } = await admin
        .from('recruitment_members')
        .select('*')
        .eq('party_id', myMember.party_id)
        .order('sort_order', { ascending: true })
        .order('is_leader', { ascending: false })
        .order('created_at', { ascending: true });

      return {
        settings,
        me: { email: userEmail, authUserId: callerUser.id },
        eligible: true,
        isTestAccount,
        eligibleStudent,
        party: party || null,
        myMember,
        members: members || [],
      };
    };

    if (action === 'my_state') {
      return jsonResponse(await loadMyState());
    }

    const checkRegistrationOpen = () => {
      if (!settings.is_open) return 'ระบบปิดรับสมัครแล้วในขณะนี้';
      if (!isTestAccount && settings.open_at && new Date(settings.open_at).getTime() > Date.now()) {
        const openDateText = new Date(settings.open_at).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Bangkok',
        });
        return `ยังไม่ถึงกำหนดเปิดรับสมัคร (เปิดรับสมัครวันที่ ${openDateText})`;
      }
      if (settings.deadline_at && new Date(settings.deadline_at).getTime() < Date.now()) {
        return 'เลยกำหนดเวลาปิดรับสมัครแล้ว';
      }
      return null;
    };

    if (action === 'create_party') {
      const closedMsg = checkRegistrationOpen();
      if (closedMsg) return fail(closedMsg, 403);
      if (existingMember) return fail('อีเมลนี้สังกัดพรรคอยู่แล้ว (1 คน สมัครได้เพียง 1 พรรค)', 409);

      const partyName = String(body.party_name || '').trim();
      if (!partyName || partyName.length > 160) return fail('กรุณาระบุชื่อพรรค (ไม่เกิน 160 ตัวอักษร)');
      const slogan = String(body.slogan || '').trim().slice(0, 300);
      const ideology = String(body.ideology || '').trim().slice(0, 2000);
      const policies = Array.isArray(body.policies)
        ? body.policies
            .map((p: Record<string, unknown>) => ({
              title: String(p?.title || '').trim().slice(0, 200),
              detail: String(p?.detail || '').trim().slice(0, 1000),
            }))
            .filter((p: { title: string }) => p.title)
            .slice(0, 20)
        : [];

      const inviteCode = generateInviteCode();
      const { data: party, error: pErr } = await admin
        .from('recruitment_parties')
        .insert({
          academic_year: ACADEMIC_YEAR,
          party_name: partyName,
          slogan,
          ideology,
          policies,
          invite_code: inviteCode,
          leader_auth_user_id: callerUser.id,
          leader_email: userEmail,
          status: 'draft',
        })
        .select('*')
        .single();
      if (pErr) throw pErr;

      // Strictly lock leader identity fields from official M.4 roster
      const { error: mErr } = await admin.from('recruitment_members').insert({
        party_id: party.id,
        academic_year: ACADEMIC_YEAR,
        auth_user_id: callerUser.id,
        email: userEmail,
        student_id: eligibleStudent.student_id,
        student_no: eligibleStudent.student_no ?? null,
        prefix: eligibleStudent.prefix || 'นาย',
        full_name: eligibleStudent.full_name,
        classroom: eligibleStudent.classroom,
        position_key: 'president',
        position_label: POSITION_MAP.president.label,
        is_leader: true,
      });
      if (mErr) {
        await admin.from('recruitment_parties').delete().eq('id', party.id);
        throw mErr;
      }
      return jsonResponse(await loadMyState(), 201);
    }

    if (action === 'join_party') {
      const closedMsg = checkRegistrationOpen();
      if (closedMsg) return fail(closedMsg, 403);
      if (existingMember) return fail('อีเมลนี้สังกัดพรรคอยู่แล้ว (1 คน สมัครได้เพียง 1 พรรค)', 409);

      const code = String(body.invite_code || '').trim().toUpperCase();
      if (!code) return fail('กรุณากรอกรหัสเชิญเข้าร่วมพรรค');

      const { data: party } = await admin
        .from('recruitment_parties')
        .select('*')
        .eq('academic_year', ACADEMIC_YEAR)
        .eq('invite_code', code)
        .maybeSingle();
      if (!party) return fail('ไม่พบพรรคตามรหัสเชิญนี้ กรุณาตรวจสอบรหัสอีกครั้ง', 404);
      if (!['draft', 'revision_requested'].includes(party.status)) {
        return fail('พรรคนี้ส่งใบสมัครแล้ว ไม่สามารถเข้าร่วมเพิ่มได้ในขณะนี้', 409);
      }

      const { count } = await admin
        .from('recruitment_members')
        .select('id', { count: 'exact', head: true })
        .eq('party_id', party.id);
      if ((count || 0) >= Number(settings.target_member_count || 29)) {
        return fail(`พรรคนี้มีสมาชิกครบ ${settings.target_member_count} คนแล้ว`, 409);
      }

      const posKey = POSITION_MAP[String(body.position_key || '')] ? String(body.position_key) : 'academic';

      const { error: mErr } = await admin.from('recruitment_members').insert({
        party_id: party.id,
        academic_year: ACADEMIC_YEAR,
        auth_user_id: callerUser.id,
        email: userEmail,
        student_id: eligibleStudent.student_id,
        student_no: eligibleStudent.student_no ?? null,
        prefix: eligibleStudent.prefix || 'นาย',
        full_name: eligibleStudent.full_name,
        classroom: eligibleStudent.classroom,
        position_key: posKey,
        position_label: POSITION_MAP[posKey].label,
        is_leader: false,
      });
      if (mErr) throw mErr;
      return jsonResponse(await loadMyState(), 201);
    }

    // All remaining student actions require belonging to a party
    if (!existingMember) return fail('คุณยังไม่ได้สังกัดพรรคใด', 404);
    const { data: myParty } = await admin
      .from('recruitment_parties')
      .select('*')
      .eq('id', existingMember.party_id)
      .single();

    const isLeader = existingMember.is_leader || myParty.leader_auth_user_id === callerUser.id;
    const isPartyEditable = ['draft', 'revision_requested'].includes(myParty.status);
    const isMemberLocked = (m: { member_submitted_at?: string | null; member_status?: string | null } | null) =>
      Boolean(m?.member_submitted_at) && m?.member_status !== 'revision_requested';

    if (action === 'update_party') {
      if (!isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่แก้ไขข้อมูลพรรคได้', 403);
      if (!isPartyEditable) return fail('ไม่สามารถแก้ไขข้อมูลพรรคหลังส่งใบสมัครแล้วได้', 409);
      const partyName = String(body.party_name || '').trim();
      if (!partyName || partyName.length > 160) return fail('กรุณาระบุชื่อพรรค');
      const policies = Array.isArray(body.policies)
        ? body.policies
            .map((p: Record<string, unknown>) => ({
              title: String(p?.title || '').trim().slice(0, 200),
              detail: String(p?.detail || '').trim().slice(0, 1000),
            }))
            .filter((p: { title: string }) => p.title)
            .slice(0, 20)
        : myParty.policies;

      const { error } = await admin
        .from('recruitment_parties')
        .update({
          party_name: partyName,
          slogan: String(body.slogan || '').trim().slice(0, 300),
          ideology: String(body.ideology || '').trim().slice(0, 2000),
          policies,
          updated_at: new Date().toISOString(),
        })
        .eq('id', myParty.id);
      if (error) throw error;
      return jsonResponse(await loadMyState());
    }

    if (action === 'delete_party') {
      if (!isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่ลบพรรคได้', 403);
      if (!isPartyEditable) return fail('ไม่สามารถลบพรรคหลังส่งใบสมัครให้ คณะกรรมการสภานักเรียน แล้วได้', 409);

      // Collect any uploaded storage paths of party members for best-effort cleanup
      const { data: partyMembers } = await admin
        .from('recruitment_members')
        .select('doc_grade_path, doc_conduct_path, doc_consent_path, photo_path')
        .eq('party_id', myParty.id);
      const storagePaths = (partyMembers || [])
        .flatMap((m) => [m.doc_grade_path, m.doc_conduct_path, m.doc_consent_path, m.photo_path])
        .filter((p): p is string => typeof p === 'string' && p.startsWith(`${ACADEMIC_YEAR}/${myParty.id}/`));
      if (storagePaths.length > 0) {
        await admin.storage.from(BUCKET).remove(storagePaths).catch(() => {});
      }

      // Cascade delete removes the party and all recruitment_members rows
      const { error } = await admin
        .from('recruitment_parties')
        .delete()
        .eq('id', myParty.id);
      if (error) throw error;
      return jsonResponse(await loadMyState());
    }

    if (action === 'upsert_member') {
      if (!isPartyEditable) return fail('ไม่สามารถแก้ไขข้อมูลหลังส่งใบสมัครแล้วได้ (รอผลตรวจจาก คณะกรรมการสภานักเรียน)', 409);
      const targetId = body.memberId ? String(body.memberId) : null;
      const isSelf = !targetId || targetId === existingMember.id;
      if (!isSelf && !isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่เพิ่ม/แก้ไขข้อมูลสมาชิกคนอื่นได้', 403);

      const posKey = POSITION_MAP[String(body.position_key || '')] ? String(body.position_key) : '';
      const gpaxVal = body.gpax === '' || body.gpax === null || body.gpax === undefined ? null : Number(body.gpax);
      if (gpaxVal !== null && (!Number.isFinite(gpaxVal) || gpaxVal < 0 || gpaxVal > 4)) {
        return fail('เกรดเฉลี่ยสะสม (GPAX) ต้องอยู่ระหว่าง 0.00 - 4.00');
      }

      if (targetId) {
        if (!isUuid(targetId)) return fail('รหัสสมาชิกไม่ถูกต้อง');
        const { data: target } = await admin
          .from('recruitment_members')
          .select('*')
          .eq('id', targetId)
          .eq('party_id', myParty.id)
          .maybeSingle();
        if (!target) return fail('ไม่พบสมาชิกในพรรคนี้', 404);
        if (isMemberLocked(target)) {
          return fail('ใบสมัครนี้ถูกยืนยันส่งและล็อกแล้ว ไม่สามารถแก้ไขได้ (ยกเว้น คณะกรรมการสภานักเรียน ส่งตีกลับให้แก้ไข)', 409);
        }
        const resolvedPosKey = posKey || (POSITION_MAP[target.position_key] ? target.position_key : 'academic');

        // Official identity fields (student_id, prefix, full_name, classroom, student_no) are strictly locked to roster
        let lockedIdentity = null as null | { student_id: string; prefix: string; full_name: string; classroom: string; student_no?: number | null };
        if (target.id === existingMember.id) {
          lockedIdentity = eligibleStudent;
        } else {
          const targetLookup = await lookupEligibleApplicant(admin, target.email, allowCouncilTest, target.student_id || '');
          lockedIdentity = targetLookup.student;
        }

        const birthDateVal = body.birth_date ? String(body.birth_date).trim().slice(0, 10) : null;
        const patch: Record<string, unknown> = {
          student_id: lockedIdentity?.student_id || target.student_id,
          student_no: lockedIdentity?.student_no ?? target.student_no ?? null,
          prefix: lockedIdentity?.prefix || target.prefix || 'นาย',
          full_name: lockedIdentity?.full_name || target.full_name,
          classroom: lockedIdentity?.classroom || target.classroom,
          nickname: String(body.nickname || '').trim().slice(0, 60),
          study_plan: String(body.study_plan || '').trim().slice(0, 120),
          birth_date: birthDateVal && /^\d{4}-\d{2}-\d{2}$/.test(birthDateVal) ? birthDateVal : null,
          nationality: String(body.nationality || 'ไทย').trim().slice(0, 60),
          religion: String(body.religion || 'พุทธ').trim().slice(0, 60),
          experience: String(body.experience || '').trim().slice(0, 2000),
          is_special_room: Boolean(body.is_special_room),
          special_room_or_club: String(body.special_room_or_club || '').trim().slice(0, 120),
          gpax: gpaxVal !== null ? Number(gpaxVal.toFixed(2)) : null,
          phone: String(body.phone || '').trim().slice(0, 30),
          position_key: resolvedPosKey,
          position_label: POSITION_MAP[resolvedPosKey].label,
          updated_at: new Date().toISOString(),
        };

        if (body.student_signature_data !== undefined) {
          const cleanSig = sanitizeSignatureData(body.student_signature_data);
          if (cleanSig === null) return fail('ไฟล์ลายเซ็นนักเรียนไม่ถูกต้องหรือขนาดใหญ่เกินไป');
          patch.student_signature_data = cleanSig;
        }
        if (body.guardian_name !== undefined) {
          patch.guardian_name = String(body.guardian_name || '').trim().slice(0, 160);
        }
        if (body.guardian_relation !== undefined) {
          patch.guardian_relation = String(body.guardian_relation || '').trim().slice(0, 60);
        }
        if (body.guardian_phone !== undefined) {
          patch.guardian_phone = String(body.guardian_phone || '').trim().slice(0, 30);
        }
        if (body.guardian_comment !== undefined) {
          patch.guardian_comment = String(body.guardian_comment || '').trim().slice(0, 500);
        }
        if (body.guardian_signature_data !== undefined) {
          const cleanGSig = sanitizeSignatureData(body.guardian_signature_data);
          if (cleanGSig === null) return fail('ไฟล์ลายเซ็นผู้ปกครองไม่ถูกต้องหรือขนาดใหญ่เกินไป');
          patch.guardian_signature_data = cleanGSig;
        }

        const nextGName = String(patch.guardian_name ?? target.guardian_name ?? '').trim();
        const nextGPhone = String(patch.guardian_phone ?? target.guardian_phone ?? '').trim();
        const nextGSig = String(patch.guardian_signature_data ?? target.guardian_signature_data ?? '').trim();
        if (nextGName && nextGPhone && nextGSig) {
          if (!target.guardian_consent_signed_at || nextGSig !== (target.guardian_signature_data || '')) {
            patch.guardian_consent_signed_at = new Date().toISOString();
            patch.doc_consent_status = 'pending';
          }
        } else if (body.guardian_signature_data === '') {
          patch.guardian_consent_signed_at = null;
        }
        if (typeof body.doc_grade_path === 'string') {
          if (!isValidMemberStoragePath(body.doc_grade_path, myParty.id, target.id)) {
            return fail('เส้นทางไฟล์ใบแสดงผลการเรียนไม่ถูกต้อง', 403);
          }
          patch.doc_grade_path = body.doc_grade_path.trim() || null;
          if (patch.doc_grade_path !== target.doc_grade_path) patch.doc_grade_status = 'pending';
        }
        if (typeof body.doc_conduct_path === 'string') {
          if (!isValidMemberStoragePath(body.doc_conduct_path, myParty.id, target.id)) {
            return fail('เส้นทางไฟล์หลักฐานคุณลักษณะฯ ไม่ถูกต้อง', 403);
          }
          patch.doc_conduct_path = body.doc_conduct_path.trim() || null;
          if (patch.doc_conduct_path !== target.doc_conduct_path) patch.doc_conduct_status = 'pending';
        }
        if (typeof body.doc_consent_path === 'string') {
          if (!isValidMemberStoragePath(body.doc_consent_path, myParty.id, target.id)) {
            return fail('เส้นทางไฟล์หนังสือยินยอมผู้ปกครองไม่ถูกต้อง', 403);
          }
          patch.doc_consent_path = body.doc_consent_path.trim() || null;
          if (patch.doc_consent_path !== target.doc_consent_path) patch.doc_consent_status = 'pending';
        }

        const { error } = await admin.from('recruitment_members').update(patch).eq('id', target.id);
        if (error) {
          if (error.code === '23505') return fail('เลขประจำตัวนักเรียนหรืออีเมลนี้ถูกใช้ในพรรคอื่นแล้ว', 409);
          throw error;
        }
        return jsonResponse(await loadMyState());
      } else {
        // Leader pre-adding a new member by @sappha.ac.th email
        if (!isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่เพิ่มสมาชิกใหม่ได้', 403);
        const newPosKey = posKey || 'academic';
        const closedMsg = checkRegistrationOpen();
        if (closedMsg && myParty.status === 'draft') return fail(closedMsg, 403);

        const { count } = await admin
          .from('recruitment_members')
          .select('id', { count: 'exact', head: true })
          .eq('party_id', myParty.id);
        if ((count || 0) >= Number(settings.target_member_count || 29)) {
          return fail(`พรรคมีสมาชิกครบ ${settings.target_member_count} คนแล้ว`, 409);
        }

        const newEmail = cleanEmail(body.email);
        if (!isSchoolEmail(newEmail, domain)) {
          return fail(`กรุณากรอกอีเมลโรงเรียน (@${domain}) ของสมาชิกให้ถูกต้อง`);
        }
        const preAddCheck = await lookupEligibleApplicant(
          admin,
          newEmail,
          allowCouncilTest,
          String(body.student_id || '').trim(),
        );
        const preAddEligible = preAddCheck.student;
        if (!preAddCheck.eligible || !preAddEligible) {
          return fail('อีเมลหรือเลขประจำตัวนักเรียนนี้ไม่อยู่ในรายชื่อนักเรียนชั้น ม.4 ไม่สามารถเพิ่มเข้าพรรคได้', 403);
        }
        const birthDateVal = body.birth_date ? String(body.birth_date).trim().slice(0, 10) : null;
        const { error } = await admin.from('recruitment_members').insert({
          party_id: myParty.id,
          academic_year: ACADEMIC_YEAR,
          email: newEmail,
          student_id: preAddEligible.student_id,
          student_no: preAddEligible.student_no ?? null,
          prefix: preAddEligible.prefix || 'นาย',
          full_name: preAddEligible.full_name,
          nickname: String(body.nickname || '').trim().slice(0, 60),
          classroom: preAddEligible.classroom,
          study_plan: String(body.study_plan || '').trim().slice(0, 120),
          birth_date: birthDateVal && /^\d{4}-\d{2}-\d{2}$/.test(birthDateVal) ? birthDateVal : null,
          nationality: String(body.nationality || 'ไทย').trim().slice(0, 60),
          religion: String(body.religion || 'พุทธ').trim().slice(0, 60),
          experience: String(body.experience || '').trim().slice(0, 2000),
          is_special_room: Boolean(body.is_special_room),
          special_room_or_club: String(body.special_room_or_club || '').trim().slice(0, 120),
          gpax: gpaxVal !== null ? Number(gpaxVal.toFixed(2)) : null,
          phone: String(body.phone || '').trim().slice(0, 30),
          position_key: newPosKey,
          position_label: POSITION_MAP[newPosKey].label,
          is_leader: false,
        });
        if (error) {
          if (error.code === '23505') return fail('อีเมลหรือเลขประจำตัวนักเรียนนี้สังกัดพรรคอื่นอยู่แล้ว', 409);
          throw error;
        }
        return jsonResponse(await loadMyState(), 201);
      }
    }

    if (action === 'remove_member') {
      if (!isPartyEditable) return fail('ไม่สามารถลบสมาชิกหลังส่งใบสมัครแล้วได้', 409);
      const targetId = String(body.memberId || '');
      if (!isUuid(targetId)) return fail('รหัสสมาชิกไม่ถูกต้อง');
      const isSelf = targetId === existingMember.id;
      if (!isSelf && !isLeader) return fail('ไม่มีสิทธิ์ลบสมาชิกคนอื่น', 403);
      if (isSelf && isLeader) return fail('หัวหน้าพรรคไม่สามารถออกจากพรรคเองได้ (หากต้องการยกเลิกพรรค ให้ลบสมาชิกอื่นออกก่อน)', 400);

      const { error } = await admin
        .from('recruitment_members')
        .delete()
        .eq('id', targetId)
        .eq('party_id', myParty.id);
      if (error) throw error;
      return jsonResponse(await loadMyState());
    }

    if (action === 'get_upload_url') {
      if (!isPartyEditable) return fail('ไม่สามารถอัปโหลดเอกสารหลังส่งใบสมัครแล้วได้', 409);
      const targetId = String(body.memberId || existingMember.id);
      const docType = String(body.docType || '');
      const mimeType = String(body.mimeType || '');
      if (!isUuid(targetId) || !ALLOWED_DOC_TYPES.has(docType)) return fail('ประเภทเอกสารไม่ถูกต้อง');
      if (!ALLOWED_MIME_TYPES.has(mimeType)) return fail('รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF เท่านั้น');
      if (targetId !== existingMember.id && !isLeader) return fail('ไม่มีสิทธิ์อัปโหลดเอกสารแทนสมาชิกคนอื่น', 403);

      const { data: target } = await admin
        .from('recruitment_members')
        .select('id, member_submitted_at, member_status')
        .eq('id', targetId)
        .eq('party_id', myParty.id)
        .maybeSingle();
      if (!target) return fail('ไม่พบสมาชิกในพรรคนี้', 404);
      if (isMemberLocked(target)) {
        return fail('ใบสมัครนี้ถูกยืนยันส่งและล็อกแล้ว ไม่สามารถอัปโหลดเอกสารเพิ่มได้', 409);
      }

      const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${ACADEMIC_YEAR}/${myParty.id}/${targetId}/${docType}-${Date.now()}.${ext}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return jsonResponse({ path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'get_doc_url') {
      const targetId = String(body.memberId || existingMember.id);
      const path = String(body.path || '').trim();
      if (!isUuid(targetId) || !path || !path.startsWith(`${ACADEMIC_YEAR}/${myParty.id}/${targetId}/`)) {
        return fail('ไม่มีสิทธิ์เข้าถึงเอกสารนี้', 403);
      }
      if (targetId !== existingMember.id && !isLeader) {
        return fail('ดูเอกสารได้เฉพาะของตนเองหรือหัวหน้าพรรคเท่านั้น', 403);
      }
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 180);
      if (error) throw error;
      return jsonResponse({ signedUrl: data.signedUrl });
    }

    if (action === 'reorder_members') {
      if (!isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่จัดลำดับสมาชิกได้', 403);
      if (!isPartyEditable) return fail('ไม่สามารถจัดลำดับสมาชิกหลังส่งใบสมัครแล้วได้', 409);
      const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map((id: unknown) => String(id || '')) : [];
      if (orderedIds.length === 0 || orderedIds.some((id: string) => !isUuid(id))) {
        return fail('รายการลำดับสมาชิกไม่ถูกต้อง');
      }
      const { data: partyMembers, error: pmErr } = await admin
        .from('recruitment_members')
        .select('id')
        .eq('party_id', myParty.id);
      if (pmErr) throw pmErr;
      const validIds = new Set((partyMembers || []).map((m) => m.id));
      for (const id of orderedIds) {
        if (!validIds.has(id)) return fail('พบสมาชิกที่ไม่ได้สังกัดพรรคนี้ในรายการจัดลำดับ', 403);
      }
      const nowIso = new Date().toISOString();
      await Promise.all(
        orderedIds.map((id: string, idx: number) =>
          admin
            .from('recruitment_members')
            .update({ sort_order: idx + 1, updated_at: nowIso })
            .eq('id', id)
            .eq('party_id', myParty.id),
        ),
      );
      return jsonResponse(await loadMyState());
    }

    if (action === 'get_student_photo') {
      const targetId = body.memberId ? String(body.memberId) : existingMember.id;
      if (!isUuid(targetId)) return fail('รหัสสมาชิกไม่ถูกต้อง');
      let target = existingMember;
      if (targetId !== existingMember.id) {
        if (!isLeader) return fail('ไม่มีสิทธิ์ดึงรูปของสมาชิกคนอื่น', 403);
        const { data } = await admin
          .from('recruitment_members')
          .select('*')
          .eq('id', targetId)
          .eq('party_id', myParty.id)
          .maybeSingle();
        if (!data) return fail('ไม่พบสมาชิกในพรรคนี้', 404);
        target = data;
      }
      const safePhotoPath = target.photo_path && isValidMemberStoragePath(target.photo_path, myParty.id, target.id)
        ? target.photo_path
        : null;
      const photo = await resolveStudentPhoto(admin, {
        studentId: String(body.student_id || target.student_id || ''),
        classroom: String(body.classroom || target.classroom || ''),
        photoPath: safePhotoPath,
      });
      return jsonResponse(photo);
    }

    if (action === 'submit_member') {
      if (!isPartyEditable) return fail('พรรคนี้ส่งใบสมัครไปแล้ว ไม่สามารถแก้ไขหรือส่งซ้ำได้', 409);
      if (myParty.status === 'draft') {
        const closedMsg = checkRegistrationOpen();
        if (closedMsg) return fail(closedMsg, 403);
      }
      if (isMemberLocked(existingMember)) {
        return fail('คุณยืนยันและส่งใบสมัครส่วนตัวไปแล้ว', 409);
      }
      const minGpax = Number(settings.min_gpax ?? 3.0);
      const missing: string[] = [];
      if (!String(existingMember.full_name || '').trim() || !String(existingMember.student_id || '').trim() || !ALLOWED_CLASSROOMS.has(String(existingMember.classroom || '').trim())) {
        missing.push('ข้อมูลประจำตัวนักเรียน ม.4');
      }
      if (!POSITION_MAP[existingMember.position_key]) missing.push('ตำแหน่งในพรรค');
      if (existingMember.gpax === null || existingMember.gpax === undefined || Number(existingMember.gpax) < minGpax) {
        missing.push(`GPAX ≥ ${minGpax.toFixed(2)}`);
      }
      if (!existingMember.student_signature_data) missing.push('ลายเซ็นนักเรียนผู้สมัคร');
      const hasConsent = Boolean(existingMember.doc_consent_path)
        || Boolean(existingMember.guardian_signature_data && String(existingMember.guardian_name || '').trim() && String(existingMember.guardian_phone || '').trim());
      if (!hasConsent) missing.push('คำยินยอมและลายเซ็นผู้ปกครอง');
      if (!existingMember.doc_grade_path) missing.push('ใบแสดงผลการเรียน (ปพ.6)');
      if (!existingMember.doc_conduct_path) missing.push('หลักฐานคุณลักษณะอันพึงประสงค์');
      if (missing.length > 0) {
        return fail(`กรุณากรอกข้อมูลและแนบเอกสารให้ครบก่อนกดส่ง: ${missing.join(', ')}`);
      }

      const nowIso = new Date().toISOString();
      const { error: smErr } = await admin
        .from('recruitment_members')
        .update({
          member_submitted_at: nowIso,
          member_status: 'pending',
          updated_at: nowIso,
        })
        .eq('id', existingMember.id);
      if (smErr) throw smErr;
      return jsonResponse(await loadMyState());
    }

    if (action === 'submit_party') {
      if (!isLeader) return fail('เฉพาะหัวหน้าพรรคเท่านั้นที่กดยืนยันส่งใบสมัครพรรคได้', 403);
      if (!isPartyEditable) return fail('พรรคนี้ส่งใบสมัครไปแล้ว', 409);
      if (myParty.status === 'draft') {
        const closedMsg = checkRegistrationOpen();
        if (closedMsg) return fail(closedMsg, 403);
      }

      if (!String(myParty.party_name || '').trim()) {
        return fail('กรุณากรอกชื่อพรรคก่อนส่งใบสมัคร');
      }

      const { data: members, error: mErr } = await admin
        .from('recruitment_members')
        .select('*')
        .eq('party_id', myParty.id);
      if (mErr) throw mErr;
      const list = members || [];
      const targetCount = Number(settings.target_member_count || 29);
      const minGpax = Number(settings.min_gpax ?? 3.0);

      if (list.length !== targetCount) {
        return fail(`ต้องมีสมาชิกครบ ${targetCount} คนก่อนส่งใบสมัคร (ปัจจุบัน ${list.length} คน)`);
      }

      const posCounts: Record<string, number> = {};
      const classrooms = new Set<string>();
      const classroomCounts: Record<string, number> = {};
      const specialCounts: Record<string, number> = {};
      let specialTotal = 0;

      for (const m of list) {
        posCounts[m.position_key] = (posCounts[m.position_key] || 0) + 1;
        if (!String(m.full_name || '').trim() || !String(m.student_id || '').trim() || !ALLOWED_CLASSROOMS.has(String(m.classroom || '').trim())) {
          return fail(`สมาชิก ${m.email} ยังกรอกข้อมูลส่วนตัวหรือห้องเรียน ม.4 ไม่ครบถ้วน`);
        }
        if (m.gpax === null || Number(m.gpax) < minGpax) {
          return fail(`สมาชิก ${m.full_name || m.email} มี GPAX ต่ำกว่าเกณฑ์ (${minGpax.toFixed(2)})`);
        }
        const hasConsent = Boolean(m.doc_consent_path)
          || Boolean(m.guardian_signature_data && String(m.guardian_name || '').trim() && String(m.guardian_phone || '').trim());
        if (!m.doc_grade_path || !m.doc_conduct_path || !hasConsent) {
          return fail(`สมาชิก ${m.full_name || m.email} ยังส่งเอกสารหรือเซ็นหนังสือยินยอมผู้ปกครองไม่ครบทั้ง 3 รายการ`);
        }
        if (!m.student_signature_data) {
          return fail(`สมาชิก ${m.full_name || m.email} ยังไม่ได้ลงลายเซ็นผู้สมัคร`);
        }
        if (!isMemberLocked(m)) {
          return fail(`สมาชิก ${m.full_name || m.email} ยังไม่ได้กด "ยืนยันและส่งใบสมัครของฉัน" ในขั้นที่ 4`);
        }
        classrooms.add(m.classroom);
        classroomCounts[m.classroom] = (classroomCounts[m.classroom] || 0) + 1;
        if (m.is_special_room) {
          specialTotal += 1;
          const tag = String(m.special_room_or_club || '').trim() || m.classroom;
          specialCounts[tag] = (specialCounts[tag] || 0) + 1;
        }
      }

      for (const p of REQUIRED_POSITIONS) {
        const c = posCounts[p.key] || 0;
        if (c < 1) return fail(`ยังไม่มีผู้ดำรงตำแหน่ง "${p.label}"`);
        if (p.maxSlots && c > p.maxSlots) return fail(`ตำแหน่ง "${p.label}" มีผู้ดำรงตำแหน่งเกิน ${p.maxSlots} คน`);
      }

      if (classrooms.size <= 1) {
        return fail('สมาชิกพรรคทุกคนมาจากห้องเรียนเดียวกันทั้งหมด (ขัดระเบียบข้อ 22)');
      }
      if (specialTotal === list.length) {
        return fail('สมาชิกพรรคทุกคนมาจากห้องเรียนพิเศษทั้งหมด (ขัดระเบียบข้อ 21(8) และข้อ 22)');
      }
      if (settings.max_per_special_room) {
        const cap = Number(settings.max_per_special_room);
        const over = Object.entries(specialCounts).find(([, c]) => c > cap);
        if (over) return fail(`สมาชิกจากห้องเรียนพิเศษ/ชมรม "${over[0]}" เกินโควต้า (${over[1]}/${cap} คน)`);
      }
      if (settings.max_per_classroom) {
        const cap = Number(settings.max_per_classroom);
        const over = Object.entries(classroomCounts).find(([, c]) => c > cap);
        if (over) return fail(`สมาชิกจากห้อง ${over[0]} เกินโควต้า (${over[1]}/${cap} คน)`);
      }

      const { error: uErr } = await admin
        .from('recruitment_parties')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', myParty.id);
      if (uErr) throw uErr;

      return jsonResponse(await loadMyState());
    }

    return fail('ไม่พบคำสั่งที่ร้องขอ', 404);
  } catch (err) {
    console.error('recruitment function error:', err);
    return fail(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในระบบ', 500);
  }
});
