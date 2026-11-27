import { ArrowDown, Sparkles, Trophy } from 'lucide-react';
import { PortfolioImage } from './PortfolioContent';

export default function PortfolioHero({ year, items, images, loading }) {
  const cover = year?.cover_path || items.find(item => images[item.cover_path])?.cover_path;
  return <section className="pf-showcase" aria-label="ผลงานสภานักเรียนจากรุ่นสู่รุ่น">
    <div className="pf-showcase-orbit" aria-hidden="true"/>
    <div className="pf-showcase-grid" aria-hidden="true"/>
    <div className="pf-showcase-copy">
      <div className="pf-showcase-kicker"><span/><span>SWSC · STUDENT COUNCIL</span></div>
      <h1>ผลงานสภานักเรียน<br/><span>จากรุ่นสู่รุ่น</span></h1>
      <p className="pf-showcase-description">เก็บเรื่องราว ความตั้งใจ และผลงานของสภานักเรียน<br className="pf-desktop-break"/>โรงเรียนสรรพวิทยาคมในแต่ละปีการศึกษา</p>
      <div className="pf-showcase-bottom"><span className="pf-showcase-year"><Sparkles size={17} aria-hidden="true"/>{year?.academic_year ? `ปีการศึกษา ${year.academic_year}` : 'เรื่องราวของสภานักเรียน'}</span><a href="#portfolio-collection">ชมผลงาน <ArrowDown size={17} aria-hidden="true"/></a></div>
    </div>
    <div className={`pf-showcase-art${cover ? ' pf-showcase-has-image' : ''}`}>
      <div className="pf-showcase-halo" aria-hidden="true"/>
      {cover ? <div className="pf-showcase-photo"><PortfolioImage path={cover} images={images} alt={`ผลงานสภานักเรียนปี ${year?.academic_year || ''}`}/><span hidden className="pf-image-placeholder">ภาพโหลดไม่สำเร็จ กรุณารีเฟรช</span><div className="pf-showcase-photo-caption"><Trophy size={19} aria-hidden="true"/><span>{year?.cohort_name || 'ผลงานของสภานักเรียน'}</span></div></div>
        : <div className="pf-showcase-medallion"><Trophy size={64} strokeWidth={1.25} aria-hidden="true"/><span className="pf-medallion-label">ปีการศึกษา</span><strong>{year?.academic_year || 'SWSC'}</strong><span className="pf-medallion-school">สภานักเรียน · สรรพวิทยาคม</span></div>}
      <div className="pf-showcase-seal" aria-hidden="true"><span>SWSC</span><Trophy size={22} strokeWidth={1.4}/><span>OFFICIAL</span></div>
      {!loading && year?.academic_year && <span className="pf-showcase-year-watermark" aria-hidden="true">{year.academic_year}</span>}
    </div>
  </section>;
}
