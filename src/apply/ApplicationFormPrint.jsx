import { useEffect, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import './printForms.css';
import { calculateAge, formatThaiBirthDate, toThaiDigits } from './thaiDateUtils';
import { CLAUSE_14_ITEMS, hasOnlineGuardianConsent, resolveStudyPlan } from './recruitmentConfig';
import schoolLogoUrl from './assets/form1_image3.png';
import councilLogoUrl from './assets/form1_image2.png';
import swscLogoUrl from './assets/form1_image1.png';

const A4_WIDTH_PX = 793.7;
const A4_HEIGHT_PX = 1122.5;

function computePreviewScale() {
  if (typeof window === 'undefined') return 1;
  const available = window.innerWidth - 20;
  return available < A4_WIDTH_PX ? Math.max(0.32, available / A4_WIDTH_PX) : 1;
}

function ScaledA4Page({ scale, children }) {
  const isScaled = scale < 0.999;
  return (
    <div
      className="app-a4-page-frame"
      style={isScaled ? { width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` } : undefined}
    >
      <div
        className="app-a4-page-scaler"
        style={isScaled ? { transform: `scale(${scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function extractRoomNumber(classroom) {
  const match = String(classroom || '').match(/\/\s*(\d+)/);
  return match ? match[1] : String(classroom || '').replace(/^ม\.?\s*[4๔]\/?/i, '').trim();
}

function PageWatermark() {
  return <img src={councilLogoUrl} alt="" aria-hidden="true" className="app-a4-watermark" />;
}

function OfficialLogosHeader() {
  return (
    <div className="app-a4-logos" aria-label="ตราสัญลักษณ์โรงเรียนสรรพวิทยาคมและสภานักเรียน">
      <img src={schoolLogoUrl} alt="ตราโรงเรียนสรรพวิทยาคม" className="app-a4-logo-school" />
      <img src={councilLogoUrl} alt="ตราสภานักเรียนโรงเรียนสรรพวิทยาคม" className="app-a4-logo-council" />
      <img src={swscLogoUrl} alt="ตรา SWSC 69" className="app-a4-logo-swsc" />
    </div>
  );
}

function CheckMarkBox({ checked = false, label }) {
  return (
    <span className="app-a4-checkbox">
      <span className="app-a4-box">{checked ? '✓' : ''}</span>
      <span>{label}</span>
    </span>
  );
}

function SingleApplicationSheet({ member, party, photoData, attachments = [], scale = 1 }) {
  const fullName = member?.full_name ? `${member.prefix || ''}${member.full_name}` : '';
  const roomNo = toThaiDigits(extractRoomNumber(member?.classroom));
  const studentIdThai = toThaiDigits(member?.student_id || '');
  const studyPlanText = toThaiDigits(resolveStudyPlan(member?.classroom, member?.study_plan) || member?.study_plan || '');
  const gpaxStr = member?.gpax !== null && member?.gpax !== undefined && member?.gpax !== ''
    ? toThaiDigits(Number(member.gpax).toFixed(2))
    : '';
  const birthStr = toThaiDigits(formatThaiBirthDate(member?.birth_date));
  const ageStr = toThaiDigits(calculateAge(member?.birth_date));
  const phoneThai = toThaiDigits(member?.phone || '');
  const partyNameThai = toThaiDigits(party?.party_name || '');
  const positionLabelThai = toThaiDigits(member?.position_label || '');
  const rawExperienceThai = toThaiDigits(member?.experience || '').replace(/\r\n?/g, '\n').trim();
  const expParts = rawExperienceThai.split('\n');
  const expLine1 = expParts.length >= 2 ? expParts[0].trim().slice(0, 62) : rawExperienceThai.slice(0, 62);
  const expLine2 = expParts.length >= 2 ? expParts.slice(1).join(' ').trim().slice(0, 83) : rawExperienceThai.slice(62, 145);
  const guardianName = member?.guardian_name || '';
  const guardianCommentThai = toThaiDigits(member?.guardian_comment || '');
  const isGuardianApproved = hasOnlineGuardianConsent(member);
  const c14 = (member?.clause14_checks && typeof member.clause14_checks === 'object') ? member.clause14_checks : {};
  const c14Page1Items = CLAUSE_14_ITEMS.slice(0, 7);
  const c14Item8 = CLAUSE_14_ITEMS[7];

  return (
    <>
      {/* ── Page 3 of Official PDF: ใบสมัคร + ผู้ปกครอง + ข้อ ๑๔ (๑)-(๗) ── */}
      <ScaledA4Page scale={scale}>
      <article className="app-a4-sheet app-a4-single">
        <PageWatermark />
        <OfficialLogosHeader />

        <h1 className="app-a4-title">ใบสมัครคณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐</h1>

        <div className="app-a4-photo-box">
          {photoData?.found && photoData?.base64 ? (
            <img
              src={`data:${photoData.mimeType || 'image/jpeg'};base64,${photoData.base64}`}
              alt="รูปถ่ายขนาด ๑.๕ นิ้ว"
            />
          ) : (
            <div className="app-a4-photo-placeholder">
              <div>รูปถ่าย</div>
              <div>ขนาด ๑.๕ นิ้ว</div>
            </div>
          )}
        </div>

        <div className="app-a4-lines">
          <div className="app-a4-row">
            <span className="app-a4-lbl">ชื่อ-สกุล</span>
            <span className="app-a4-fill" style={{ flex: 2.6 }}>{fullName}</span>
            <span className="app-a4-lbl">ชื่อเล่น</span>
            <span className="app-a4-fill" style={{ flex: 0.95 }}>{member?.nickname || ''}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">เลขประจำตัวนักเรียน</span>
            <span className="app-a4-fill app-a4-fill-center" style={{ flex: '0 0 18mm' }}>{studentIdThai}</span>
            <span className="app-a4-lbl">ระดับชั้น ม.๔/</span>
            <span className="app-a4-fill app-a4-fill-center" style={{ flex: '0 0 9mm' }}>{roomNo}</span>
            <span className="app-a4-lbl">แผนการเรียน</span>
            <span
              className="app-a4-fill"
              style={{
                flex: 1,
                fontSize: studyPlanText.length > 46 ? '10.5px' : studyPlanText.length > 30 ? '12px' : undefined,
                letterSpacing: studyPlanText.length > 46 ? '-0.2px' : undefined,
              }}
            >
              {studyPlanText}
            </span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">ผลการเรียนเฉลี่ยภาคเรียนที่ผ่านมา</span>
            <span className="app-a4-fill app-a4-fill-center" style={{ flex: '0 0 15mm' }}>{gpaxStr}</span>
            <span className="app-a4-lbl">(แนบใบ ปพ.๖) วัน/เดือน/ปีเกิด</span>
            <span className="app-a4-fill" style={{ flex: 1 }}>{birthStr}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">อายุ</span>
            <span className="app-a4-fill" style={{ flex: 0.45, textAlign: 'center' }}>{ageStr}</span>
            <span className="app-a4-lbl">ปี สัญชาติ</span>
            <span className="app-a4-fill" style={{ flex: 1.05 }}>{member?.nationality || 'ไทย'}</span>
            <span className="app-a4-lbl">ศาสนา</span>
            <span className="app-a4-fill" style={{ flex: 1.25 }}>{member?.religion || 'พุทธ'}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">เบอร์โทรศัพท์</span>
            <span className="app-a4-fill" style={{ flex: 1 }}>{phoneThai}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">E-mail</span>
            <span className="app-a4-fill" style={{ flex: 1 }}>{member?.email || ''}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">พรรค</span>
            <span className="app-a4-fill" style={{ flex: 0.9 }}>{partyNameThai}</span>
            <span className="app-a4-lbl">ดำรงตำแหน่ง</span>
            <span className="app-a4-fill" style={{ flex: 1.5 }}>{positionLabelThai}</span>
          </div>

          <div className="app-a4-row">
            <span className="app-a4-lbl">ประสบการณ์หรือผลงาน (ถ้ามี)</span>
            <span className="app-a4-fill" style={{ flex: 1 }}>{expLine1}</span>
          </div>
          <div className="app-a4-row">
            <span className="app-a4-fill" style={{ flex: 1 }}>{expLine2}</span>
          </div>
        </div>

        <div className="app-a4-consent-block">
          <div className="app-a4-consent-right">
            <div className="app-a4-check-row">
              <CheckMarkBox checked={isGuardianApproved} label="อนุญาต" />
              <CheckMarkBox checked={false} label="ไม่อนุญาต" />
            </div>
            <div className="app-a4-row">
              <span className="app-a4-lbl">ความคิดเห็น</span>
              <span className="app-a4-fill" style={{ flex: 1 }}>{guardianCommentThai}</span>
            </div>
          </div>

          <div className="app-a4-dual-sig">
            <div className="app-a4-sig-col">
              <div className="app-a4-sig-top">
                <span className="app-a4-lbl">ลงชื่อ</span>
                <span className="app-a4-sig-img-slot">
                  {member?.student_signature_data && (
                    <img src={member.student_signature_data} alt="ลายเซ็นผู้สมัคร" />
                  )}
                </span>
              </div>
              <div className="app-a4-sig-row">
                <span>(</span>
                <span className="app-a4-fill app-a4-fill-center" style={{ width: '48mm' }}>{fullName}</span>
                <span>)</span>
              </div>
              <div>ผู้สมัคร</div>
            </div>

            <div className="app-a4-sig-col">
              <div className="app-a4-sig-top">
                <span className="app-a4-lbl">ลงชื่อ</span>
                <span className="app-a4-sig-img-slot">
                  {member?.guardian_signature_data && (
                    <img src={member.guardian_signature_data} alt="ลายเซ็นผู้ปกครอง" />
                  )}
                </span>
              </div>
              <div className="app-a4-sig-row">
                <span>(</span>
                <span className="app-a4-fill app-a4-fill-center" style={{ width: '48mm' }}>{guardianName}</span>
                <span>)</span>
              </div>
              <div>ผู้ปกครอง</div>
            </div>
          </div>
        </div>

        <div className="app-a4-c14-inline">
          <div className="app-a4-c14-heading">ผลการตรวจสอบคุณสมบัติตามระเบียบข้อ ๑๔</div>
          <div className="app-a4-c14-list">
            {c14Page1Items.map((item) => {
              const val = c14[item.key] || '';
              return (
                <div key={item.key} className="app-a4-c14-item">
                  <div>({item.numThai}) {item.text}</div>
                  <div className="app-a4-c14-checks">
                    <CheckMarkBox checked={val === 'pass'} label="ผ่าน" />
                    <CheckMarkBox checked={val === 'fail'} label="ไม่ผ่าน" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </article>
      </ScaledA4Page>

      {/* ── Page 4 of Official PDF: ข้อ (๘) + แถบน้ำเงิน + รายชื่อผู้ลงนามทั้ง 9 ตำแหน่ง ── */}
      <ScaledA4Page scale={scale}>
      <article className="app-a4-sheet app-a4-clause14">
        <PageWatermark />

        {c14Item8 && (
          <div className="app-a4-c14-item">
            <div>({c14Item8.numThai}) {c14Item8.text}</div>
            <div className="app-a4-c14-checks">
              <CheckMarkBox checked={c14[c14Item8.key] === 'pass'} label="ผ่าน" />
              <CheckMarkBox checked={c14[c14Item8.key] === 'fail'} label="ไม่ผ่าน" />
            </div>
          </div>
        )}

        <div className="app-a4-navy-bar">ผลการตรวจสอบคุณสมบัติทั้งหมด</div>

        <div className="app-a4-c14-overall">
          <div className="app-a4-row" style={{ paddingLeft: '12mm' }}>
            <span style={{ whiteSpace: 'nowrap' }}>เป็นผู้สมัครคณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐ พรรค</span>
            <span className="app-a4-fill app-a4-fill-center" style={{ flex: 1, fontWeight: 700 }}>{partyNameThai}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12mm', flexWrap: 'wrap' }}>
            <CheckMarkBox checked={c14.overall === 'pass'} label="ผ่าน" />
            <CheckMarkBox checked={c14.overall === 'fail'} label="ไม่ผ่าน" />
            <span>การตรวจสอบคุณสมบัติคณะกรรมการสภานักเรียนตามระเบียบโรงเรียน</span>
          </div>
          <div>สรรพวิทยาคมว่าด้วยสภานักเรียน โรงเรียนสรรพวิทยาคม พ.ศ.๒๕๖๑ (ฉบับแก้ไข พ.ศ.๒๕๖๙)</div>
        </div>

        <div className="app-a4-official-sigs">
          <div className="app-a4-official-row">
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นางสาวศุภากนต์ เทมียะโก)</div>
              <div>ประธานคณะกรรมการการเลือกตั้ง</div>
            </div>
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นายวชิรวิชญ์ บุญนพไท)</div>
              <div>ประธานคณะกรรมการสภานักเรียน</div>
            </div>
          </div>

          <div className="app-a4-official-row">
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นายธาราวุฒิ สุวรรณใจ)</div>
              <div>หัวหน้างานส่งเสริมประชาธิปไตยในโรงเรียน</div>
            </div>
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นายวิชญ์ภาส ทนะขว้าง)</div>
              <div>ครูที่ปรึกษาคณะกรรมการสภานักเรียน</div>
            </div>
          </div>

          <div className="app-a4-official-row">
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(............................................)</div>
              <div>ครูที่ปรึกษาคณะกรรมการสภานักเรียน</div>
            </div>
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นางสาวนวพรรณ ประชัน)</div>
              <div>ครูที่ปรึกษาคณะกรรมการสภานักเรียน</div>
            </div>
          </div>

          <div className="app-a4-official-row">
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นายพีรพัฒน์ เฮิงโม)</div>
              <div>ผู้ช่วยผู้อำนวยการฝ่ายบริหารงานบุคคล</div>
            </div>
            <div className="app-a4-official-cell">
              <div className="app-a4-official-sign-label">ลงชื่อ</div>
              <div>(นางนารินทร์ โทนปั่น)</div>
              <div>รองผู้อำนวยการฝ่ายบริหารงานบุคคล</div>
            </div>
          </div>

          <div className="app-a4-director-block">
            <div style={{ display: 'flex', gap: '20mm', marginBottom: '4mm' }}>
              <CheckMarkBox checked={false} label="อนุมัติ" />
              <CheckMarkBox checked={false} label="ไม่อนุมัติ" />
            </div>
            <div style={{ width: '74mm', textAlign: 'left' }}>ลงชื่อ</div>
            <div>(นายทวีศักดิ์ คำภีระ)</div>
            <div>ผู้อำนวยการโรงเรียนสรรพวิทยาคม</div>
          </div>
        </div>
      </article>
      </ScaledA4Page>

      {/* ── Attachments in official order: ปพ.6 -> ใบรับรองความประพฤติ (pure white full-page A4) ── */}
      {attachments.map((att) => (
        <ScaledA4Page key={att.key} scale={scale}>
          <article className="app-a4-sheet app-a4-attachment">
            <img src={att.src} alt="" />
          </article>
        </ScaledA4Page>
      ))}
    </>
  );
}

function RosterSheets({ party, members = [], targetCount = 29, scale = 1 }) {
  const totalSlots = Math.max(targetCount, members.length, 29);
  const rosterSlots = Array.from({ length: totalSlots }, (_, i) => members[i] || null);
  const page1Slots = rosterSlots.slice(0, 14);
  const page2Slots = rosterSlots.slice(14);
  const partyNameThai = toThaiDigits(party?.party_name || '');

  return (
    <>
      {/* ── Page 1 of Official PDF: บัญชีรายชื่อ ๑-๑๔ ── */}
      <ScaledA4Page scale={scale}>
      <article className="app-a4-sheet app-a4-roster">
        <PageWatermark />
        <div className="app-a4-doc-tag">เอกสารสภานักเรียนหมายเลข ๑</div>
        <OfficialLogosHeader />
        <h1 className="app-a4-title app-a4-roster-title">บัญชีรายชื่อคณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐</h1>
        <div className="app-a4-row" style={{ marginBottom: 6 }}>
          <span className="app-a4-lbl">ชื่อพรรค</span>
          <span className="app-a4-fill" style={{ flex: 1 }}>{partyNameThai}</span>
        </div>

        {page1Slots.map((m, idx) => (
          <div key={idx} className="app-a4-roster-item">
            <div className="app-a4-row">
              <span className="app-a4-lbl app-a4-roster-lbl">{toThaiDigits(idx + 1)}. ชื่อ-สกุล</span>
              <span className="app-a4-fill" style={{ flex: 2.3 }}>{m?.full_name ? `${m.prefix || ''}${m.full_name}` : ''}</span>
              <span className="app-a4-lbl app-a4-roster-lbl">ชื่อเล่น</span>
              <span className="app-a4-fill" style={{ flex: 0.85 }}>{m?.nickname || ''}</span>
            </div>
            <div className="app-a4-row app-a4-roster-sub">
              <span className="app-a4-lbl app-a4-roster-lbl">ระดับชั้น ม.๔/</span>
              <span className="app-a4-fill" style={{ flex: 0.35 }}>{m ? toThaiDigits(extractRoomNumber(m.classroom)) : ''}</span>
              <span className="app-a4-lbl app-a4-roster-lbl">ดำรงตำแหน่ง/ฝ่าย</span>
              <span className="app-a4-fill" style={{ flex: 2 }}>{toThaiDigits(m?.position_label || '')}</span>
            </div>
          </div>
        ))}
      </article>
      </ScaledA4Page>

      {/* ── Page 2 of Official PDF: บัญชีรายชื่อ ๑๕-๒๙ (ไม่มีหัวโลโก้) ── */}
      <ScaledA4Page scale={scale}>
      <article className="app-a4-sheet app-a4-roster app-a4-roster-p2">
        <PageWatermark />
        {page2Slots.map((m, idx) => (
          <div key={idx + 14} className="app-a4-roster-item">
            <div className="app-a4-row">
              <span className="app-a4-lbl app-a4-roster-lbl">{toThaiDigits(idx + 15)}. ชื่อ-สกุล</span>
              <span className="app-a4-fill" style={{ flex: 2.3 }}>{m?.full_name ? `${m.prefix || ''}${m.full_name}` : ''}</span>
              <span className="app-a4-lbl app-a4-roster-lbl">ชื่อเล่น</span>
              <span className="app-a4-fill" style={{ flex: 0.85 }}>{m?.nickname || ''}</span>
            </div>
            <div className="app-a4-row app-a4-roster-sub">
              <span className="app-a4-lbl app-a4-roster-lbl">ระดับชั้น ม.๔/</span>
              <span className="app-a4-fill" style={{ flex: 0.35 }}>{m ? toThaiDigits(extractRoomNumber(m.classroom)) : ''}</span>
              <span className="app-a4-lbl app-a4-roster-lbl">ดำรงตำแหน่ง/ฝ่าย</span>
              <span className="app-a4-fill" style={{ flex: 2 }}>{toThaiDigits(m?.position_label || '')}</span>
            </div>
          </div>
        ))}
      </article>
      </ScaledA4Page>
    </>
  );
}

export function InlineApplicationPreview({ member, party, photoData, attachments = [] }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(computePreviewScale);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth;
      if (!w) return;
      setScale(w < A4_WIDTH_PX ? Math.max(0.3, (w - 4) / A4_WIDTH_PX) : 1);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div ref={wrapRef} className="app-a4-inline-wrap">
      <div className="app-a4-stack">
        <SingleApplicationSheet member={member} party={party} photoData={photoData} attachments={attachments} scale={scale} />
      </div>
    </div>
  );
}

export default function ApplicationFormPrint({
  mode = 'single',
  member,
  party,
  members = [],
  photoData,
  photoMap = {},
  attachments = [],
  attachmentsMap = {},
  targetCount = 29,
  onClose,
}) {
  const [previewScale, setPreviewScale] = useState(computePreviewScale);

  useEffect(() => {
    const onResize = () => setPreviewScale(computePreviewScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const titleText =
    mode === 'single'
      ? 'เอกสารสภานักเรียนหมายเลข ๑ — ใบสมัคร + ผลตรวจข้อ ๑๔ (๒ หน้า A4)'
      : mode === 'roster'
        ? `เอกสารสภานักเรียนหมายเลข ๑ — บัญชีรายชื่อคณะกรรมการสภานักเรียน (${toThaiDigits(targetCount)} คน)`
        : `เอกสารสภานักเรียนหมายเลข ๑ — รวมเล่มทั้งพรรค ${party?.party_name || ''} (บัญชีรายชื่อ + ใบสมัคร ${toThaiDigits(members.length)} คน)`;

  return (
    <div className="consent-print-overlay" role="dialog" aria-modal="true" aria-label={titleText}>
      <div className="consent-print-toolbar no-print">
        <div className="consent-print-meta">
          <div className="consent-print-icon"><Printer size={19} /></div>
          <div>
            <strong>{titleText}</strong>
            <span>กดปุ่ม &ldquo;บันทึกเป็น PDF / พิมพ์&rdquo; แล้วเลือกปลายทาง Save as PDF (ตั้งค่า Margins: None และเปิด Background graphics)</span>
          </div>
        </div>
        <div className="consent-print-actions">
          <button type="button" className="btn-purple" onClick={() => window.print()}>
            <Printer size={15} /> บันทึกเป็น PDF / พิมพ์
          </button>
          <button type="button" className="btn-outline" onClick={onClose}>
            <X size={15} /> ปิดหน้าต่าง
          </button>
        </div>
      </div>

      <div className="app-a4-stack">
        {mode === 'single' && (
          <SingleApplicationSheet member={member} party={party} photoData={photoData} attachments={attachments} scale={previewScale} />
        )}

        {mode === 'roster' && (
          <RosterSheets party={party} members={members} targetCount={targetCount} scale={previewScale} />
        )}

        {mode === 'bundle' && (
          <>
            <RosterSheets party={party} members={members} targetCount={targetCount} scale={previewScale} />
            {members.map((m) => (
              <SingleApplicationSheet
                key={m.id}
                member={m}
                party={party}
                photoData={photoMap[m.id] || null}
                attachments={attachmentsMap[m.id] || []}
                scale={previewScale}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
