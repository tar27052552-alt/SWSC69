import { Printer, X } from 'lucide-react';
import { ACADEMIC_YEAR } from './recruitmentConfig';
import { toThaiDigits } from './thaiDateUtils';

export default function ConsentFormPrint({ member, party, blank = false, onClose }) {
  const fullName = blank
    ? '........................................................................'
    : `${member?.prefix || ''}${member?.full_name || '............................................'}`;
  const studentId = blank ? '........................' : toThaiDigits(member?.student_id || '........................');
  const classroom = blank ? 'ม.๔/......' : toThaiDigits(member?.classroom || 'ม.๔/......');
  const studentNo = blank ? '......' : (member?.student_no ? toThaiDigits(String(member.student_no)) : '......');
  const partyName = blank ? '....................................................................' : toThaiDigits(party?.party_name || '....................................................');
  const positionLabel = blank ? '....................................................................' : toThaiDigits(member?.position_label || '....................................................');
  const phone = blank ? '....................................' : toThaiDigits(member?.phone || '....................................');

  const guardianName = !blank && member?.guardian_name ? member.guardian_name : '';
  const guardianRelation = !blank && member?.guardian_relation ? member.guardian_relation : '';
  const guardianPhone = !blank && member?.guardian_phone ? toThaiDigits(member.guardian_phone) : '';
  const studentSig = !blank && member?.student_signature_data ? member.student_signature_data : '';
  const guardianSig = !blank && member?.guardian_signature_data ? member.guardian_signature_data : '';
  const isOnlineSigned = Boolean(guardianName && guardianPhone && guardianSig);
  const signedDateObj = !blank && member?.guardian_consent_signed_at ? new Date(member.guardian_consent_signed_at) : null;
  const signedDateText = signedDateObj && !Number.isNaN(signedDateObj.getTime())
    ? toThaiDigits(signedDateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }))
    : '';
  const yearThai = toThaiDigits(ACADEMIC_YEAR);
  const prevYearThai = toThaiDigits(ACADEMIC_YEAR - 1);

  return (
    <div className="consent-print-overlay" role="dialog" aria-modal="true" aria-label="หนังสือยินยอมผู้ปกครอง">
      <div className="consent-print-toolbar no-print">
        <div className="consent-print-meta">
          <div className="consent-print-icon"><Printer size={19} /></div>
          <div>
            <strong>
              {blank
                ? 'แบบฟอร์มหนังสือยินยอมผู้ปกครอง (แบบเปล่า)'
                : isOnlineSigned
                  ? 'หนังสือยินยอมผู้ปกครอง (ลงนามออนไลน์แล้ว)'
                  : 'หนังสือยินยอมผู้ปกครอง (เติมข้อมูลอัตโนมัติ)'}
            </strong>
            <span>
              {isOnlineSigned
                ? 'เอกสารฉบับนี้ลงลายมือชื่อออนไลน์เรียบร้อยแล้ว กดปุ่มเพื่อบันทึกเป็น PDF หรือพิมพ์เก็บเป็นหลักฐาน'
                : 'กดปุ่ม “พิมพ์ / บันทึกเป็น PDF” เพื่อนำไปให้ผู้ปกครองลงลายมือชื่อ หรือกลับไปเซ็นออนไลน์ในระบบได้ทันที'}
            </span>
          </div>
        </div>
        <div className="consent-print-actions">
          <button type="button" className="btn-purple" onClick={() => window.print()}>
            <Printer size={15} /> พิมพ์ / บันทึก PDF
          </button>
          <button type="button" className="btn-outline" onClick={onClose}>
            <X size={15} /> ปิดหน้าต่าง
          </button>
        </div>
      </div>

      <article className="consent-sheet">
        <header className="consent-sheet-head">
          <div className="consent-sheet-school">โรงเรียนสรรพวิทยาคม อำเภอแม่สอด จังหวัดตาก</div>
          <div className="consent-sheet-sub">งานส่งเสริมประชาธิปไตยในโรงเรียน กลุ่มงานกิจกรรมนักเรียน ฝ่ายบริหารงานบุคคล</div>
          <h1>หนังสือยินยอมและอนุญาตจากผู้ปกครอง</h1>
          <p className="consent-sheet-topic">
            เรื่อง ขอรับรองและอนุญาตให้นักเรียนลงสมัครรับเลือกตั้งคณะกรรมการสภานักเรียน ปีการศึกษา {yearThai}
          </p>
        </header>

        <div className="consent-date-row">
          เขียนที่ {isOnlineSigned ? 'ระบบรับสมัครออนไลน์ SWSC.OFFICIAL' : '............................................................'}<br />
          {signedDateText
            ? <>วันที่ <strong>{signedDateText}</strong></>
            : <>วันที่ ......... เดือน ............................ พ.ศ. {prevYearThai} / {yearThai}</>}
        </div>

        <div className="consent-body">
          <p className="consent-salutation">
            <strong>เรียน</strong> ผู้อำนวยการโรงเรียนสรรพวิทยาคม / คณะกรรมการจัดการเลือกตั้งคณะกรรมการสภานักเรียน
          </p>

          <p className="consent-indent">
            ข้าพเจ้า (นาย/นาง/นางสาว) <strong>{guardianName || '............................................................................................................'}</strong>{' '}
            หมายเลขโทรศัพท์ติดต่อ <strong>{guardianPhone || '......................................................'}</strong>{' '}
            เกี่ยวข้องเป็น (บิดา/มารดา/ผู้ปกครอง) <strong>{guardianRelation || '........................................'}</strong>{' '}
            ของนักเรียนชื่อ <strong>{fullName}</strong> เลขประจำตัวนักเรียน <strong>{studentId}</strong> กำลังศึกษาอยู่ระดับชั้น <strong>{classroom}</strong> เลขที่ <strong>{studentNo}</strong>{' '}
            โรงเรียนสรรพวิทยาคม หมายเลขโทรศัพท์นักเรียน <strong>{phone}</strong>
          </p>

          <p className="consent-indent">
            ขอรับรองว่าข้าพเจ้ารับทราบและ <strong>อนุญาต</strong> ให้นักเรียนในความปกครองของข้าพเจ้าลงสมัครรับเลือกตั้งเป็นคณะกรรมการสภานักเรียน
            โรงเรียนสรรพวิทยาคม ประจำปีการศึกษา {yearThai} ในสังกัดพรรค <strong>{partyName}</strong> ตำแหน่ง <strong>{positionLabel}</strong>
            ตามระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนโรงเรียนสรรพวิทยาคม พ.ศ. ๒๕๖๑ (ฉบับแก้ไข พ.ศ. ๒๕๖๙) ข้อ ๒๑ (๙)
          </p>

          <p className="consent-indent">
            ทั้งนี้ ข้าพเจ้ายินดีให้ความร่วมมือ สนับสนุน และดูแลนักเรียนในการปฏิบัติหน้าที่ กิจกรรมการหาเสียง การเข้าค่ายภาวะความเป็นผู้นำ
            รวมถึงการดำเนินงานของคณะกรรมการสภานักเรียนตลอดวาระ ๑ ปีการศึกษา โดยไม่กระทบต่อการเรียนและอยู่ภายใต้กฎระเบียบของโรงเรียนอย่างเคร่งครัด
          </p>

          <div className="consent-checks">
            <div>{isOnlineSigned ? '☑' : '☐'} อนุญาตให้นักเรียนลงสมัครรับเลือกตั้งและปฏิบัติหน้าที่คณะกรรมการสภานักเรียน ปีการศึกษา {yearThai}</div>
            <div>☐ ไม่อนุญาต</div>
          </div>

          <div className="consent-signatures">
            <div className="consent-sig-box">
              {studentSig && (
                <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: -8 }}>
                  <img src={studentSig} alt="ลายเซ็นนักเรียน" style={{ maxHeight: 46, maxWidth: 180, objectFit: 'contain' }} />
                </div>
              )}
              <div>ลงชื่อ .................................................................... นักเรียนผู้สมัคร</div>
              <div>({blank ? '........................................................' : fullName})</div>
              <div>วันที่ {signedDateText || '......... / .................. / ............'}</div>
            </div>
            <div className="consent-sig-box">
              {guardianSig && (
                <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: -8 }}>
                  <img src={guardianSig} alt="ลายเซ็นผู้ปกครอง" style={{ maxHeight: 46, maxWidth: 180, objectFit: 'contain' }} />
                </div>
              )}
              <div>ลงชื่อ .................................................................... ผู้ปกครอง</div>
              <div>({guardianName || '....................................................................'})</div>
              <div>เบอร์โทรศัพท์ {guardianPhone || '....................................................'}</div>
            </div>
          </div>
        </div>

        <footer className="consent-sheet-footer">
          อ้างอิง: คู่มือแนวทางการปฏิบัติงานสภานักเรียน โรงเรียนสรรพวิทยาคม (ฉบับแก้ไข พ.ศ. 2569) หมวด 5 ข้อ 21 (9)
          {isOnlineSigned && signedDateText ? ` • ลงนามอิเล็กทรอนิกส์เมื่อ ${signedDateText}` : ''}
        </footer>
      </article>
    </div>
  );
}
