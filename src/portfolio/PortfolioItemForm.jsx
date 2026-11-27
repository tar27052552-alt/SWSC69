import { useEffect, useRef, useState } from 'react';
import { DEPARTMENTS } from '../data/mockData';
import { portfolioImages } from '../lib/portfolio';

function ImagePreview({ file, url, alt, onRemove }) {
  const img = useRef(null);
  useEffect(() => {
    const src = file ? URL.createObjectURL(file) : url;
    if (img.current && src) img.current.src = src;
    return () => { if (file && src) URL.revokeObjectURL(src); };
  }, [file, url]);
  return <div className="pf-upload-preview">{file || url ? <img ref={img} alt={alt}/> : <div className="pf-upload-placeholder">กำลังเปิดภาพ</div>}<button type="button" onClick={onRemove}>ลบรูปภาพ</button></div>;
}
export default function PortfolioItemForm({ item, setItem, years, existing, busy, cover, setCover, gallery, setGallery, chooseFiles, onSave, onCancel }) {
  const [images, setImages] = useState({}), [imageError, setImageError] = useState('');
  const pathKey = JSON.stringify([item.cover_path, ...item.image_paths].filter(Boolean));
  useEffect(() => {
    let active = true;
    portfolioImages(JSON.parse(pathKey)).then(result => { if (active) { setImages(result); setImageError(''); } }).catch(() => { if (active) setImageError('ยังเปิดภาพเดิมไม่ได้ กดดูตัวอย่างหลังบันทึกเพื่อลองอีกครั้ง'); });
    return () => { active = false; };
  }, [pathKey]);
  return <form className="pf-form pf-news-style-form" onSubmit={onSave}>
    <h2>{existing ? '✏️ แก้ไขผลงาน' : '📣 เพิ่มผลงาน'}</h2>
    <fieldset disabled={busy}>
      <label>หัวข้อผลงาน *<input type="text" required maxLength={250} placeholder="กรอกหัวข้อผลงาน เช่น รางวัลหรือกิจกรรมของสภานักเรียน" value={item.title} onChange={e => setItem({ ...item, title: e.target.value })}/></label>
      <label>รายละเอียดผลงาน *<textarea required maxLength={20000} rows={5} placeholder="กรอกรายละเอียดเนื้อหาผลงานที่นี่…" value={item.description} onChange={e => setItem({ ...item, description: e.target.value })}/></label>
      <div className="pf-form-grid"><label>ปีการศึกษา *<select required value={item.academic_year} onChange={e => setItem({ ...item, academic_year: Number(e.target.value) })}>{years.filter(y => y.stored).map(y => <option key={y.academic_year} value={y.academic_year}>{y.academic_year}</option>)}</select></label><label>วันที่ผลงาน *<input type="date" required value={item.activity_date} onChange={e => setItem({ ...item, activity_date: e.target.value })}/></label></div>
      <label>หมวดหมู่<input value="ผลงาน" readOnly/></label>
      <label>🖼️ รูปภาพประกอบผลงาน (แนะนำสัดส่วน 4:5)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFiles}/></label>
      <p className="pf-upload-help">JPG, PNG หรือ WebP ไม่เกิน 10 MB ต่อภาพ · พรีวิว 4:5 ไม่เปลี่ยนไฟล์ต้นฉบับ</p>
      {imageError && <p role="status" className="pf-upload-help">{imageError}</p>}
      {(cover || item.cover_path) && <ImagePreview file={cover} url={images[item.cover_path]} alt="ตัวอย่างภาพปกผลงาน" onRemove={() => { setCover(null); setItem({ ...item, cover_path: null }); }}/>}
      <label>📸 รูปภาพเพิ่มเติม<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => chooseFiles(e, true)}/></label><p className="pf-upload-help">เพิ่มได้สูงสุด 20 ภาพ ภาพละไม่เกิน 10 MB</p>
      <div className="pf-upload-gallery">{item.image_paths.map((path, index) => <ImagePreview key={path} url={images[path]} alt={`ภาพเพิ่มเติม ${index + 1}`} onRemove={() => setItem({ ...item, image_paths: item.image_paths.filter(p => p !== path) })}/>)}{gallery.map((file, index) => <ImagePreview key={`${file.name}-${file.lastModified}-${index}`} file={file} alt={`ภาพที่เลือก ${index + 1}`} onRemove={() => setGallery(gallery.filter((_, i) => i !== index))}/>)}</div>
      <details className="pf-form-more"><summary>ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary><label>ผลสำเร็จ<textarea maxLength={10000} rows={4} value={item.outcomes} onChange={e => setItem({ ...item, outcomes: e.target.value })}/></label><label>ฝ่ายที่เกี่ยวข้อง<select value={item.department_id || ''} onChange={e => setItem({ ...item, department_id: e.target.value })}><option value="">สภานักเรียน / หลายฝ่าย</option>{DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label></details>
      <label className="pf-checkbox"><input type="checkbox" checked={item.featured} onChange={e => setItem({ ...item, featured: e.target.checked })}/>เลือกเป็นผลงานเด่นของปี</label>
      <label>การเผยแพร่<select value={item.status} onChange={e => setItem({ ...item, status: e.target.value })}><option value="draft">ฉบับร่าง — ยังไม่แสดงบนเว็บ</option><option value="published">เผยแพร่ — แสดงบนเว็บ</option></select></label>
      <div className="pf-actions"><button type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึกผลงาน'}</button><button type="button" onClick={onCancel}>ยกเลิก</button></div>
    </fieldset>
  </form>;
}
