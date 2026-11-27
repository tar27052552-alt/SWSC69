import { useEffect, useState } from 'react';
import {
  Download, FileText, Image as ImageIcon, Plus, Printer, RefreshCw, Trash2, Upload, Users,
} from 'lucide-react';
import { callRecruitment } from './recruitmentApi';
import {
  ACADEMIC_YEAR,
  CLASSROOMS,
  DEFAULT_TARGET_MEMBERS,
  POSITIONS,
  POSITION_MAP,
  PREFIXES,
} from './recruitmentConfig';
import {
  calculateAge,
  downloadMemberApplicationPdf,
  downloadPartyRosterPdf,
} from './recruitmentPdf';
import ApplicationFormPrint from './ApplicationFormPrint';

const STORAGE_KEY_SINGLE = 'swsc_apply70_quick_single';
const STORAGE_KEY_ROSTER = 'swsc_apply70_quick_roster';

const EMPTY_SINGLE = {
  prefix: 'นาย',
  full_name: '',
  nickname: '',
  student_id: '',
  classroom: 'ม.4/1',
  study_plan: '',
  gpax: '',
  birth_date: '',
  nationality: 'ไทย',
  religion: 'พุทธ',
  phone: '',
  email: '',
  party_name: '',
  position_key: 'president',
  experience: '',
};

function makeEmptyRosterRows(count = DEFAULT_TARGET_MEMBERS) {
  return Array.from({ length: count }, (_, idx) => {
    const pos = POSITIONS[idx] || POSITIONS[POSITIONS.length - 1];
    return {
      prefix: 'นาย',
      full_name: '',
      nickname: '',
      classroom: 'ม.4/1',
      position_key: pos.key,
    };
  });
}

export default function QuickPdfBuilder({ onOpenConsent, onNotice }) {
  const [mode, setMode] = useState('single'); // 'single' | 'roster'
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SINGLE) || 'null');
      return saved ? { ...EMPTY_SINGLE, ...saved } : EMPTY_SINGLE;
    } catch {
      return EMPTY_SINGLE;
    }
  });

  const [rosterPartyName, setRosterPartyName] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ROSTER) || 'null');
      return saved?.partyName || '';
    } catch {
      return '';
    }
  });
  const [rosterRows, setRosterRows] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ROSTER) || 'null');
      if (Array.isArray(saved?.rows) && saved.rows.length > 0) return saved.rows;
    } catch {
      // ignore
    }
    return makeEmptyRosterRows(DEFAULT_TARGET_MEMBERS);
  });

  const [photo, setPhoto] = useState(null); // { found, source, mimeType, base64 }
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printPreview, setPrintPreview] = useState(null); // 'single' | 'roster' | null

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_SINGLE, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_ROSTER, JSON.stringify({ partyName: rosterPartyName, rows: rosterRows })); } catch { /* ignore */ }
  }, [rosterPartyName, rosterRows]);

  const fetchDrivePhoto = async (sid = form.student_id, room = form.classroom) => {
    const cleanId = String(sid || '').trim();
    if (!cleanId) {
      onNotice?.('error', 'กรุณากรอกเลขประจำตัวนักเรียนก่อนกดดึงรูปจาก Google Drive');
      return null;
    }
    setPhotoBusy(true);
    try {
      const res = await callRecruitment(
        { action: 'public_student_photo', student_id: cleanId, classroom: room },
        { requireAuth: false },
      );
      setPhoto(res);
      if (res?.found) {
        onNotice?.('success', `พบรูปถ่ายของรหัส ${cleanId} ในโฟลเดอร์ "รวมรูปนักเรียน 2569" แล้ว`);
      } else {
        onNotice?.('info', `ไม่พบรูปของรหัส ${cleanId} ในโฟลเดอร์ M4 — สามารถกดเลือกไฟล์รูปจากเครื่องได้`);
      }
      return res;
    } catch (err) {
      onNotice?.('error', err.message || 'ดึงรูปจาก Google Drive ไม่สำเร็จ');
      return null;
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleLocalPhoto = (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      onNotice?.('error', 'รองรับเฉพาะไฟล์ภาพ JPG หรือ PNG เท่านั้น');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (base64) {
        setPhoto({ found: true, source: 'local', mimeType: file.type, base64 });
        onNotice?.('success', 'แนบรูปถ่ายขนาด 1.5 นิ้วเรียบร้อยแล้ว');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadSinglePdf = async () => {
    setPdfBusy(true);
    try {
      let currentPhoto = photo;
      if (!currentPhoto && String(form.student_id || '').trim()) {
        currentPhoto = await fetchDrivePhoto(form.student_id, form.classroom);
      }
      const posLabel = POSITION_MAP[form.position_key]?.label || '';
      await downloadMemberApplicationPdf(
        { ...form, position_label: posLabel },
        { party_name: form.party_name },
        currentPhoto,
      );
      onNotice?.('success', 'สร้างและดาวน์โหลดไฟล์ PDF ใบสมัครรายบุคคลเรียบร้อยแล้ว');
    } catch (err) {
      onNotice?.('error', err.message || 'สร้างไฟล์ PDF ไม่สำเร็จ');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadRosterPdf = async () => {
    setPdfBusy(true);
    try {
      const normalized = rosterRows.map((r) => ({
        ...r,
        position_label: POSITION_MAP[r.position_key]?.label || '',
      }));
      await downloadPartyRosterPdf(
        { party_name: rosterPartyName },
        normalized,
        Math.max(DEFAULT_TARGET_MEMBERS, normalized.length),
      );
      onNotice?.('success', 'สร้างและดาวน์โหลดไฟล์ PDF บัญชีรายชื่อพรรค 29 คนเรียบร้อยแล้ว');
    } catch (err) {
      onNotice?.('error', err.message || 'สร้างไฟล์ PDF บัญชีรายชื่อไม่สำเร็จ');
    } finally {
      setPdfBusy(false);
    }
  };

  const updateRosterRow = (idx, patch) => {
    setRosterRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  return (
    <section id="apply-form-section" className="apply-card">
      <h2 className="apply-card-title">
        <FileText size={18} /> กรอกข้อมูลและสร้างไฟล์ PDF ใบสมัคร ปีการศึกษา {ACADEMIC_YEAR}
      </h2>
      <p className="apply-card-sub">
        กรอกข้อมูลเป็นข้อความแล้วกดดาวน์โหลดเป็นไฟล์ <strong>PDF ใบสมัครทางการ</strong> ได้ทันที (ระบบบันทึกข้อมูลร่างไว้ในเครื่องให้อัตโนมัติ)
      </p>

      {/* Mode Switcher */}
      <div className="apply-tabs" style={{ marginBottom: 20 }}>
        <button type="button" className={`apply-tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          <FileText size={15} /> 1. ใบสมัครรายบุคคล (1 หน้า + รูป 1.5 นิ้ว)
        </button>
        <button type="button" className={`apply-tab ${mode === 'roster' ? 'active' : ''}`} onClick={() => setMode('roster')}>
          <Users size={15} /> 2. บัญชีรายชื่อพรรค ({rosterRows.length} คน)
        </button>
      </div>

      {/* ── MODE 1: INDIVIDUAL APPLICATION FORM ── */}
      {mode === 'single' && (
        <>
          {/* 1.5" Photo Preview + Auto-Fetch from Drive */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, borderRadius: 14, background: '#fdfaf6', border: '1px solid #fcd34d', marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 72, height: 92, borderRadius: 8, border: '1.5px solid #2d0a6e', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11.5, color: '#645c7a', textAlign: 'center', padding: 4 }}>
              {photoBusy ? (
                'กำลังดึงรูป...'
              ) : photo?.found && photo?.base64 ? (
                <img src={`data:${photo.mimeType || 'image/jpeg'};base64,${photo.base64}`} alt="รูปถ่าย 1.5 นิ้ว" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div><ImageIcon size={18} style={{ display: 'block', margin: '0 auto 4px' }} />รูป ๑.๕ นิ้ว</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#2d0a6e' }}>รูปถ่ายขนาด 1.5 นิ้ว (ดึงอัตโนมัติจาก Google Drive โรงเรียน)</div>
              <div style={{ fontSize: 13, color: '#52525b', marginTop: 2 }}>
                กรอก <strong>เลขประจำตัวนักเรียน</strong> + <strong>ห้อง ม.4</strong> แล้วกดปุ่มดึงรูป ระบบจะค้นหาจากโฟลเดอร์ &ldquo;รวมรูปนักเรียน 2569&rdquo; มาใส่ในใบสมัคร PDF ให้เลย
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" className="btn-purple" style={{ padding: '7px 14px', fontSize: 13 }} disabled={photoBusy} onClick={() => fetchDrivePhoto()}>
                  <RefreshCw size={14} /> {photoBusy ? 'กำลังค้นหารูป...' : 'ดึงรูปจาก Google Drive'}
                </button>
                <label className="btn-outline" style={{ padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
                  <Upload size={14} /> เลือกรูปจากเครื่อง (สำรอง)
                  <input type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={(e) => handleLocalPhoto(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>คำนำหน้า</label>
              <select value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })}>
                {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>ชื่อ-สกุล *</label>
              <input placeholder="เช่น สมชาย รักเรียน" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>ชื่อเล่น</label>
              <input placeholder="เช่น บาส" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </div>
            <div className="form-field">
              <label>เลขประจำตัวนักเรียน *</label>
              <input
                placeholder="เช่น 32997"
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>ระดับชั้น (ม.๔/...)</label>
              <select value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })}>
                {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>แผนการเรียน</label>
              <input placeholder="เช่น วิทย์-คณิต / ศิลป์-ภาษา / SMTE" value={form.study_plan} onChange={(e) => setForm({ ...form, study_plan: e.target.value })} />
            </div>
            <div className="form-field">
              <label>ผลการเรียนเฉลี่ยภาคเรียนที่ผ่านมา (GPAX ≥ 3.00)</label>
              <input type="number" step="0.01" min="0" max="4" placeholder="เช่น 3.65" value={form.gpax} onChange={(e) => setForm({ ...form, gpax: e.target.value })} />
            </div>
            <div className="form-field">
              <label>วัน/เดือน/ปีเกิด {form.birth_date ? `(อายุ ${calculateAge(form.birth_date)} ปี)` : ''}</label>
              <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>
            <div className="form-field">
              <label>สัญชาติ</label>
              <input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
            <div className="form-field">
              <label>ศาสนา</label>
              <input value={form.religion} onChange={(e) => setForm({ ...form, religion: e.target.value })} />
            </div>
            <div className="form-field">
              <label>เบอร์โทรศัพท์</label>
              <input placeholder="เช่น 08x-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-field">
              <label>E-mail</label>
              <input type="email" placeholder="เช่น 32997@sappha.ac.th" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-field">
              <label>พรรค</label>
              <input placeholder="ชื่อพรรคที่สังกัด" value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>ดำรงตำแหน่ง/ฝ่าย</label>
              <select value={form.position_key} onChange={(e) => setForm({ ...form, position_key: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field full">
              <label>ประสบการณ์หรือผลงาน (ถ้ามี)</label>
              <textarea
                rows={4}
                placeholder="พิมพ์ประสบการณ์การทำกิจกรรม ตำแหน่งเดิม หรือรางวัลที่เคยได้รับ (ระบบจะจัดลงบรรทัดจุดไข่ปลา 5 บรรทัดให้อัตโนมัติ)"
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
              />
            </div>

            <div className="form-field full" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <button
                type="button"
                className="btn-gold"
                onClick={async () => {
                  if (!photo && String(form.student_id || '').trim()) {
                    await fetchDrivePhoto(form.student_id, form.classroom);
                  }
                  setPrintPreview('single');
                }}
              >
                <Printer size={16} /> ดูตัวอย่าง & บันทึก PDF ใบสมัคร (ตรงแบบ 100%)
              </button>
              <button type="button" className="btn-purple" disabled={pdfBusy} onClick={handleDownloadSinglePdf}>
                <Download size={15} /> {pdfBusy ? 'กำลังสร้างไฟล์ PDF...' : 'ดาวน์โหลดไฟล์ .pdf ทันที'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => onOpenConsent?.({
                  blank: false,
                  member: { ...form, position_label: POSITION_MAP[form.position_key]?.label || '' },
                  party: { party_name: form.party_name },
                })}
              >
                <Printer size={15} /> พิมพ์หนังสือยินยอมผู้ปกครอง
              </button>
              <button
                type="button"
                className="btn-ghost-dark"
                onClick={() => {
                  if (window.confirm('ล้างข้อความที่กรอกไว้ทั้งหมด?')) {
                    setForm(EMPTY_SINGLE);
                    setPhoto(null);
                  }
                }}
              >
                <Trash2 size={14} /> ล้างข้อมูล
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── MODE 2: 29-MEMBER PARTY ROSTER FORM ── */}
      {mode === 'roster' && (
        <div>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-field full">
              <label>ชื่อพรรค *</label>
              <input
                placeholder="กรอกชื่อพรรค (จะแสดงบนหัวใบสมัครรวมพรรค 29 คน)"
                value={rosterPartyName}
                onChange={(e) => setRosterPartyName(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto', border: '1px solid #e9dff2', borderRadius: 12 }}>
            <table className="apply-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>ที่</th>
                  <th style={{ width: 105 }}>คำนำหน้า</th>
                  <th>ชื่อ-สกุล</th>
                  <th style={{ width: 120 }}>ชื่อเล่น</th>
                  <th style={{ width: 110 }}>ระดับชั้น</th>
                  <th>ดำรงตำแหน่ง/ฝ่าย</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: '#4a1270' }}>{idx + 1}</td>
                    <td>
                      <select
                        style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid #dfd2eb' }}
                        value={row.prefix}
                        onChange={(e) => updateRosterRow(idx, { prefix: e.target.value })}
                      >
                        {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        style={{ width: '100%', minWidth: 160, padding: '7px 10px', borderRadius: 8, border: '1px solid #dfd2eb' }}
                        placeholder={`ชื่อ-นามสกุล คนที่ ${idx + 1}`}
                        value={row.full_name}
                        onChange={(e) => updateRosterRow(idx, { full_name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #dfd2eb' }}
                        placeholder="ชื่อเล่น"
                        value={row.nickname}
                        onChange={(e) => updateRosterRow(idx, { nickname: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid #dfd2eb' }}
                        value={row.classroom}
                        onChange={(e) => updateRosterRow(idx, { classroom: e.target.value })}
                      >
                        {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        style={{ width: '100%', minWidth: 190, padding: '7px 8px', borderRadius: 8, border: '1px solid #dfd2eb' }}
                        value={row.position_key}
                        onChange={(e) => updateRosterRow(idx, { position_key: e.target.value })}
                      >
                        {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" className="btn-gold" onClick={() => setPrintPreview('roster')}>
              <Printer size={16} /> ดูตัวอย่าง & บันทึก PDF บัญชีรายชื่อ ({rosterRows.length} คน)
            </button>
            <button type="button" className="btn-purple" disabled={pdfBusy} onClick={handleDownloadRosterPdf}>
              <Download size={15} /> {pdfBusy ? 'กำลังสร้างไฟล์ PDF...' : 'ดาวน์โหลด .pdf ทันที'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setRosterRows((prev) => [...prev, { prefix: 'นาย', full_name: '', nickname: '', classroom: 'ม.4/1', position_key: 'academic' }])}
            >
              <Plus size={14} /> เพิ่มแถว
            </button>
            <button
              type="button"
              className="btn-ghost-dark"
              onClick={() => {
                if (window.confirm('รีเซ็ตตารางรายชื่อทั้งหมด?')) {
                  setRosterPartyName('');
                  setRosterRows(makeEmptyRosterRows(DEFAULT_TARGET_MEMBERS));
                }
              }}
            >
              <Trash2 size={14} /> ล้างตาราง
            </button>
          </div>
        </div>
      )}
      {printPreview && (
        <ApplicationFormPrint
          mode={printPreview}
          member={{ ...form, position_label: POSITION_MAP[form.position_key]?.label || '' }}
          party={{ party_name: printPreview === 'roster' ? rosterPartyName : form.party_name }}
          members={rosterRows.map((r) => ({ ...r, position_label: POSITION_MAP[r.position_key]?.label || '' }))}
          photoData={photo}
          onClose={() => setPrintPreview(null)}
        />
      )}
    </section>
  );
}
