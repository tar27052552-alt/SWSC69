import { DEPARTMENTS } from '../data/mockData';

export function PortfolioImage({ path, images, alt, className = '' }) {
  return images[path] ? <img className={className} src={images[path]} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; e.currentTarget.nextElementSibling.hidden = false; }} /> : <div className={`pf-image-placeholder ${className}`}>🏛️<span>ยังไม่มีภาพที่เปิดได้</span></div>;
}
export function PortfolioCard({ item, images, href, onClick }) {
  return <article className="pf-card">
    <a href={href} onClick={onClick}><PortfolioImage path={item.cover_path} images={images} alt={item.title}/><span hidden className="pf-image-placeholder">ภาพโหลดไม่สำเร็จ กรุณารีเฟรช</span>
      <div className="pf-card-body"><div className="pf-meta">{item.featured && <span className="pf-badge">★ ผลงานเด่น</span>}<time dateTime={item.activity_date}>{new Date(item.activity_date + 'T12:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div><h3>{item.title}</h3><p>{item.outcomes || item.description}</p><span className="pf-read">อ่านผลงาน →</span></div>
    </a>
  </article>;
}
export function PortfolioDetail({ item, year, images }) {
  return <article className="pf-detail">
    <div className="pf-eyebrow">ปีการศึกษา {item.academic_year} · {year?.cohort_name}</div><h1>{item.title}</h1>
    <div className="pf-meta"><time dateTime={item.activity_date}>{new Date(item.activity_date + 'T12:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</time><span>{DEPARTMENTS.find(d => d.id === item.department_id)?.name || 'สภานักเรียน'}</span>{item.featured && <span className="pf-badge">★ ผลงานเด่น</span>}</div>
    <PortfolioImage path={item.cover_path} images={images} alt={item.title} className="pf-detail-cover"/><span hidden className="pf-image-placeholder">ภาพโหลดไม่สำเร็จ กรุณารีเฟรช</span>
    <h2>เรื่องราวของผลงาน</h2><p className="pf-prose">{item.description}</p>
    {item.outcomes && <section className="pf-outcomes"><h2>สิ่งที่เกิดขึ้นจากผลงานนี้</h2><p className="pf-prose">{item.outcomes}</p></section>}
    {item.image_paths.length > 0 && <section><h2>ภาพกิจกรรม</h2><div className="pf-gallery">{item.image_paths.map((path, index) => <figure key={path}><PortfolioImage path={path} images={images} alt={`${item.title} ภาพที่ ${index + 1}`}/><span hidden className="pf-image-placeholder">ภาพโหลดไม่สำเร็จ</span></figure>)}</div></section>}
  </article>;
}
