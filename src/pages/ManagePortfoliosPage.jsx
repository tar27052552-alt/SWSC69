import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import PortfolioItemForm from '../portfolio/PortfolioItemForm';
import { academicYear } from '../lib/councilPermissions';
import { portfolioQuery, portfolioImages, uploadPortfolioImage, validatePortfolioImage, sortPortfolioItems } from '../lib/portfolio';
import { PortfolioDetail } from '../portfolio/PortfolioContent';
import '../styles/portfolio.css';
import './managePortfolios.css';
import { Search, Trophy, FileText, CheckCircle2, Newspaper } from 'lucide-react';
import { newsAsPortfolio, mergePortfolioYears } from '../lib/newsPortfolio';

const emptyYear = () => ({ academic_year: academicYear(), cohort_name: '', summary: '', cover_path: null });
const emptyItem = year => ({ id: crypto.randomUUID(), academic_year: year, title: '', description: '', outcomes: '', activity_date: '', department_id: '', cover_path: null, image_paths: [], featured: false, status: 'draft' });
async function write(query) {
  let timer;
  try {
    const result = await Promise.race([query, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('หมดเวลาระหว่างบันทึก ผลอาจสำเร็จแล้ว กรุณารีเฟรชตรวจรายการก่อนส่งใหม่')), 30000); })]);
    if (result.error) throw result.error;
    if (!result.data?.length && result.data?.saved !== true) throw new Error('บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ผู้ดูแล');
    return result.data?.saved ? result.data : result.data[0];
  } finally { clearTimeout(timer); }
}
export default function ManagePortfoliosPage() {
  const { isAdmin } = useAuth();
  const [years, setYears] = useState([]), [items, setItems] = useState([]), [year, setYear] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [yearForm, setYearForm] = useState(null), [itemForm, setItemForm] = useState(null), [existing, setExisting] = useState(false);
  const [cover, setCover] = useState(null), [gallery, setGallery] = useState([]), [preview, setPreview] = useState(null), [images, setImages] = useState({});
  const [newsItems, setNewsItems] = useState([]), [newsForm, setNewsForm] = useState(null), [archiveReady, setArchiveReady] = useState(false);
  const [listMode, setListMode] = useState('manual'), [search, setSearch] = useState('');
  const editor = useRef(null);
  const epoch = useRef(0), lock = useRef(false), previewRef = useRef(null);
  const load = useCallback(async selected => {
    const version = ++epoch.current;
    setLoading(true); setError('');
    try {
      const taggedNews = [];
      let newsPage;
      do { newsPage = await portfolioQuery(supabase.from('web_news').select('*').eq('category', 'ผลงาน').order('id').range(taggedNews.length, taggedNews.length + 999)); taggedNews.push(...newsPage); } while (newsPage.length === 1000);
      const mappedNews = taggedNews.map(n => { const item = newsAsPortfolio({ ...n, portfolio_hidden: false }); return item ? { ...item, hidden: n.portfolio_hidden === true, newsId: String(n.id), metadataReady: Object.hasOwn(n, 'portfolio_academic_year') } : null; }).filter(Boolean);
      let storedYears = [], ready = true;
      try { storedYears = await portfolioQuery(supabase.from('council_portfolio_years').select('*').order('academic_year', { ascending: false })); }
      catch (e) { if (!['PGRST205', '42P01'].includes(e.code)) throw e; ready = false; }
      const nextYears = mergePortfolioYears(storedYears, mappedNews).map(y => ({ ...y, stored: storedYears.some(s => s.academic_year === y.academic_year) }));
      const nextYear = nextYears.some(y => y.academic_year === selected) ? selected : nextYears[0]?.academic_year || null;
      const nextItems = [];
      if (nextYear && ready) {
        let page;
        do { page = await portfolioQuery(supabase.from('council_portfolio_items').select('*').eq('academic_year', nextYear).order('id').range(nextItems.length, nextItems.length + 999)); nextItems.push(...page); } while (page.length === 1000);
      }
      if (version !== epoch.current) return;
      setYears(nextYears); setYear(nextYear); setItems(sortPortfolioItems(nextItems)); setNewsItems(sortPortfolioItems(mappedNews.filter(n => n.academic_year === nextYear))); setArchiveReady(ready); if (selected === null) setListMode(nextItems.length ? 'manual' : mappedNews.length ? 'news' : 'manual');
    } catch (e) { if (version === epoch.current) setError(e.message); }
    finally { if (version === epoch.current) setLoading(false); }
  }, []);
  useEffect(() => { let active = true; const requestEpoch = epoch; Promise.resolve().then(() => { if (active && isAdmin) load(null); }); return () => { active = false; requestEpoch.current++; }; }, [isAdmin, load]);
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement;
    previewRef.current?.focus();
    const key = e => { if (e.key === 'Escape') setPreview(null); if (e.key === 'Tab') { const buttons = previewRef.current?.querySelectorAll('button,a[href]'); if (!buttons?.length) { e.preventDefault(); return; } const first = buttons[0], last = buttons[buttons.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === previewRef.current)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } };
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
  }, [preview]);
  const editorKind = yearForm ? 'year' : itemForm ? 'item' : newsForm ? 'news' : null;
  useEffect(() => {
    if (!editorKind) return;
    const frame = requestAnimationFrame(() => {
      editor.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      editor.current?.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editorKind]);
  async function act(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  function chooseFiles(e, multiple = false) {
    try { const files = [...e.target.files]; files.forEach(validatePortfolioImage); if (multiple && files.length + (itemForm?.image_paths.length || 0) > 20) throw new Error('แนบภาพเพิ่มเติมได้ไม่เกิน 20 ภาพ'); if (multiple) setGallery(files); else setCover(files[0] || null); }
    catch (e) { setError(e.message); }
    e.target.value = '';
  }
  function editItem(item) { setNewsForm(null); setItemForm(item ? { ...item } : emptyItem(year)); setExisting(Boolean(item)); setYearForm(null); setCover(null); setGallery([]); setNotice(''); }
  async function saveYear(e) {
    e.preventDefault();
    await act(async () => {
      const yearFields = { ...yearForm }; delete yearFields.stored;
      const selectedYear = Number(yearForm.academic_year);
      const form = { ...yearFields, academic_year: selectedYear, cohort_name: yearFields.cohort_name || `สภานักเรียน ปีการศึกษา ${selectedYear}`, updated_at: new Date().toISOString() };
      await write(existing ? supabase.from('council_portfolio_years').update(form).eq('academic_year', form.academic_year).select() : supabase.from('council_portfolio_years').insert(form).select());
      setYearForm(null); setNotice('บันทึกปีการศึกษาแล้ว ปีนี้จะแสดงบนเว็บเมื่อมีผลงานเผยแพร่'); await load(form.academic_year);
    });
  }
  async function saveItem(e) {
    e.preventDefault();
    await act(async () => {
      const form = { ...itemForm, academic_year: Number(itemForm.academic_year), department_id: itemForm.department_id ? Number(itemForm.department_id) : null, updated_at: new Date().toISOString() };
      if (cover) { form.cover_path = await uploadPortfolioImage(cover, form.academic_year); setItemForm({ ...form }); setCover(null); }
      for (let index = 0; index < gallery.length; index++) {
        form.image_paths = [...form.image_paths, await uploadPortfolioImage(gallery[index], form.academic_year)];
        setItemForm({ ...form }); setGallery(gallery.slice(index + 1));
      }
      if (form.status === 'published' && !form.cover_path) throw new Error('กรุณาเพิ่มภาพปกก่อนเผยแพร่');
      // Stable UUID and explicit insert/update: never silently overwrite a conflicting create.
      await write(existing ? supabase.from('council_portfolio_items').update(form).eq('id', form.id).select() : supabase.from('council_portfolio_items').insert(form).select());
      setItemForm(null); setNotice(form.status === 'published' ? 'เผยแพร่ผลงานแล้ว' : 'บันทึกฉบับร่างแล้ว'); await load(form.academic_year);
    });
  }
  if (!isAdmin) return <div className="pf-empty" role="alert">เฉพาะผู้ดูแลระบบเท่านั้น</div>;
  function switchTabWithKeyboard(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'manual' : e.key === 'End' ? 'news' : listMode === 'manual' ? 'news' : 'manual';
    setListMode(next);
    document.getElementById(next === 'manual' ? 'pf-manual-tab' : 'pf-news-tab')?.focus();
  }
  const currentYear = years.find(y => y.academic_year === year);
  const query = search.trim().toLocaleLowerCase('th-TH');
  const matches = item => !query || `${item.title} ${item.description || ''}`.toLocaleLowerCase('th-TH').includes(query);
  const visibleItems = items.filter(matches), visibleNews = newsItems.filter(matches);
  const publishedCount = items.filter(i => i.status === 'published').length + newsItems.filter(i => !i.hidden).length;
  const unpublishedCount = items.length + newsItems.length - publishedCount;
  return <div className="pf-admin">
    <div className="pf-admin-heading"><div><div className="pf-eyebrow">COUNCIL ARCHIVE</div><h1>จัดการผลงานรายปี</h1><p>เก็บเรื่องราวของรุ่นปัจจุบันและรุ่นพี่ แยกตามปีการศึกษา</p></div><a href={import.meta.env.BASE_URL + 'portfolios/'} target="_blank" rel="noopener noreferrer">ดูหน้าผลงาน ↗</a></div>
    <div className="pf-toolbar"><label>ปีการศึกษา <select aria-label="ปีที่จัดการ" disabled={busy} value={year || ''} onChange={e => { setItemForm(null); setYearForm(null); setNewsForm(null); setSearch(''); load(Number(e.target.value)); }}><option value="" disabled>เลือกปี</option>{years.map(y => <option key={y.academic_year} value={y.academic_year}>{y.academic_year} · {y.cohort_name}</option>)}</select></label><button disabled={busy || !archiveReady} onClick={() => { setNewsForm(null); setYearForm(emptyYear()); setItemForm(null); setExisting(false); setCover(null); }}>＋ เพิ่มปี</button><button disabled={!year || busy || !archiveReady} onClick={() => { setNewsForm(null); setYearForm({ ...currentYear }); setItemForm(null); setExisting(Boolean(currentYear?.stored)); setCover(null); }}>แก้ไขปี</button><button disabled={busy || loading} onClick={() => load(year)}>รีเฟรช</button></div>
    {error && <div className="pf-error" role="alert">{error} <button disabled={busy} onClick={() => load(year)}>ลองโหลดใหม่</button></div>}{notice && <p role="status" className="pf-success">{notice}</p>}
    {!loading && !archiveReady && <div className="pf-setup-note" role="status"><strong>ยังไม่ได้เปิดฐานข้อมูลผลงานย้อนหลัง</strong><p>ดูข่าวหมวดผลงานได้แล้ว การเพิ่มปีและผลงานย้อนหลังต้องใช้ migration ที่เตรียมไว้ก่อน</p></div>}
    <div className="pf-admin-summary" aria-label="สรุปผลงานของปีที่เลือก"><div><span className="pf-summary-icon"><Trophy size={21}/></span><div><small>ผลงานทั้งหมด</small><strong>{loading || error ? '—' : items.length + newsItems.length}</strong></div></div><div><span className="pf-summary-icon pf-summary-green"><CheckCircle2 size={21}/></span><div><small>แสดงบนเว็บ</small><strong>{loading || error ? '—' : publishedCount}</strong></div></div><div><span className="pf-summary-icon pf-summary-gold"><FileText size={21}/></span><div><small>ร่าง / ซ่อนจากผลงาน</small><strong>{loading || error ? '—' : unpublishedCount}</strong></div></div></div>
    {year && !currentYear?.stored && archiveReady && !yearForm && <p className="pf-admin-hint">ปีนี้มีผลงานจากข่าวแล้ว หากต้องการเพิ่มผลงานเอง ให้กด “แก้ไขปี” แล้วบันทึกข้อมูลปีครั้งแรกก่อน</p>}
    <div ref={editor} className="pf-editor-anchor"/>
    {newsForm && <form className="pf-form" onSubmit={e => { e.preventDefault(); act(async () => {
      const data = await write(supabase.rpc('manage_news_portfolio', { p_id: newsForm.newsId, p_year: Number(newsForm.academic_year), p_featured: newsForm.featured, p_hidden: newsForm.hidden }));
      if (!data?.saved) throw new Error('บันทึกไม่สำเร็จ กรุณารีเฟรชตรวจรายการ');
      const targetYear = Number(newsForm.academic_year); setNewsForm(null); setNotice('บันทึกการแสดงผลงานจากข่าวแล้ว'); await load(targetYear);
    }); }}><h2>จัดการผลงานจากข่าว</h2><p>{newsForm.title}</p><fieldset disabled={busy}><label>ปีการศึกษาของสภา *<input type="number" required min="2400" max="2800" value={newsForm.academic_year} onChange={e => setNewsForm({ ...newsForm, academic_year: e.target.value })}/></label><label className="pf-checkbox"><input type="checkbox" checked={newsForm.featured} onChange={e => setNewsForm({ ...newsForm, featured: e.target.checked })}/>เลือกเป็นผลงานเด่น</label><label className="pf-checkbox"><input type="checkbox" checked={newsForm.hidden} onChange={e => setNewsForm({ ...newsForm, hidden: e.target.checked })}/>ซ่อนจากหน้าผลงาน (ข่าวยังแสดงในหน้าข่าว)</label><div className="pf-actions"><button type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึกการแสดงผลงาน'}</button><button type="button" onClick={() => setNewsForm(null)}>ยกเลิก</button></div></fieldset></form>}
    {yearForm && <form className="pf-form" onSubmit={saveYear}><h2>{existing ? 'แก้ไขปีการศึกษา' : 'เพิ่มปีการศึกษา'}</h2><fieldset disabled={busy}><label>ปีการศึกษา พ.ศ. *<select required disabled={existing} value={yearForm.academic_year} onChange={e => setYearForm({ ...yearForm, academic_year: Number(e.target.value) })}>{Array.from({ length: 401 }, (_, index) => 2800 - index).map(value => <option key={value} value={value}>{value}</option>)}</select></label><div className="pf-actions"><button type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึกปีการศึกษา'}</button><button type="button" onClick={() => setYearForm(null)}>ยกเลิก</button>{existing && <button type="button" className="pf-danger" onClick={() => { if (window.confirm('ลบปีนี้ได้เฉพาะเมื่อไม่มีผลงาน ต้องการลบหรือไม่?')) act(async () => { await write(supabase.from('council_portfolio_years').delete().eq('academic_year', yearForm.academic_year).select()); setYearForm(null); await load(null); }); }}>ลบปีที่ว่าง</button>}</div></fieldset></form>}
    {itemForm && <PortfolioItemForm item={itemForm} setItem={setItemForm} years={years} existing={existing} busy={busy} cover={cover} setCover={setCover} gallery={gallery} setGallery={setGallery} chooseFiles={chooseFiles} onSave={saveItem} onCancel={() => setItemForm(null)}/>}
    <div className="pf-management-controls"><div className="pf-management-tabs" role="tablist" aria-label="ประเภทผลงาน"><button role="tab" id="pf-manual-tab" tabIndex={listMode === 'manual' ? 0 : -1} onKeyDown={switchTabWithKeyboard} aria-selected={listMode === 'manual'} aria-controls="pf-manual-panel" onClick={() => setListMode('manual')}><Trophy size={17}/>ผลงานที่เพิ่มเอง <span>{items.length}</span></button><button role="tab" id="pf-news-tab" tabIndex={listMode === 'news' ? 0 : -1} onKeyDown={switchTabWithKeyboard} aria-selected={listMode === 'news'} aria-controls="pf-news-panel" onClick={() => setListMode('news')}><Newspaper size={17}/>ผลงานจากข่าว <span>{newsItems.length}</span></button></div><label className="pf-admin-search"><Search size={18} aria-hidden="true"/><input aria-label="ค้นหาผลงานในปีนี้" placeholder="ค้นหาผลงานในปีนี้…" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
    <section id="pf-manual-panel" role="tabpanel" aria-labelledby="pf-manual-tab" hidden={listMode !== 'manual'}>
    <div className="pf-section-heading"><h2>{currentYear ? `ผลงานปี ${year}` : 'เริ่มเก็บผลงานของสภาแต่ละรุ่น'}</h2><button disabled={!year || busy || loading || !currentYear?.stored} onClick={() => editItem(null)}>＋ เพิ่มผลงาน</button></div>
    {loading ? <div className="pf-loading" role="status">กำลังโหลดผลงาน…</div> : !visibleItems.length ? <div className="pf-empty"><Trophy size={32} aria-hidden="true"/><h3>{query ? 'ไม่พบผลงานที่ค้นหา' : 'ยังไม่มีผลงานที่เพิ่มเอง'}</h3><p>{query ? 'ลองเปลี่ยนคำค้น หรือดูผลงานจากข่าว' : year ? 'กดเพิ่มผลงานเพื่อเก็บเรื่องราวของปีนี้' : 'กดเพิ่มปี เพื่อเริ่มบันทึกผลงานย้อนหลัง'}</p></div> : <div className="pf-admin-list">{visibleItems.map(item => <article key={item.id}><div><span className={'pf-badge ' + (item.status === 'draft' ? 'pf-draft' : '')}>{item.status === 'draft' ? 'ฉบับร่าง' : 'เผยแพร่แล้ว'}</span>{item.featured && <span className="pf-badge">★ ผลงานเด่น</span>}<h3>{item.title}</h3><p>{item.activity_date} · ปี {item.academic_year}</p></div><div className="pf-actions"><button disabled={busy} onClick={() => editItem(item)}>แก้ไข</button><button disabled={busy} onClick={() => act(async () => { setImages(await portfolioImages([item.cover_path, ...item.image_paths])); setPreview(item); })}>ดูตัวอย่าง</button><button disabled={busy} onClick={() => act(async () => { if (item.status === 'draft' && !item.cover_path) throw new Error('กรุณาแก้ไขและเพิ่มภาพปกก่อนเผยแพร่'); await write(supabase.from('council_portfolio_items').update({ status: item.status === 'draft' ? 'published' : 'draft', updated_at: new Date().toISOString() }).eq('id', item.id).select()); await load(year); })}>{item.status === 'draft' ? 'เผยแพร่' : 'ถอนเผยแพร่'}</button></div></article>)}</div>}
    </section>
    <section id="pf-news-panel" role="tabpanel" aria-labelledby="pf-news-tab" hidden={listMode !== 'news'} className="pf-news-management"><div className="pf-section-heading"><div><h2>ผลงานจากข่าวประชาสัมพันธ์</h2><p>ข่าวหมวด “ผลงาน” ใช้รายการเดิม แก้เนื้อหาและรูปจากหน้าข่าวได้</p></div><span className="pf-badge">{newsItems.length} รายการ</span></div>{loading ? <p role="status">กำลังโหลดข่าว…</p> : !visibleNews.length ? <div className="pf-empty"><Newspaper size={32} aria-hidden="true"/><h3>{query ? 'ไม่พบข่าวผลงานที่ค้นหา' : 'ยังไม่มีผลงานจากข่าวในปีนี้'}</h3><p>{query ? 'ลองเปลี่ยนคำค้น' : 'ข่าวที่เลือกหมวดผลงานจะมาแสดงที่นี่โดยอัตโนมัติ'}</p></div> : <div className="pf-admin-list">{visibleNews.map(item => <article key={item.id}><div><span className="pf-badge">{item.hidden ? 'ซ่อนจากผลงาน' : 'แสดงในผลงาน'}</span>{item.featured && <span className="pf-badge">★ ผลงานเด่น</span>}<h3>{item.title}</h3><p>{item.activity_date} · ปีการศึกษา {item.academic_year}</p>{!item.metadataReady && <small>ต้องอัปเดตฐานข้อมูลก่อนแก้ปีและสถานะ</small>}</div><div className="pf-actions"><button disabled={busy || !item.metadataReady} onClick={() => { setNewsForm({ ...item }); setItemForm(null); setYearForm(null); }}>จัดการการแสดงผล</button><button disabled={busy} onClick={() => act(async () => { setImages(Object.fromEntries([item.cover_path, ...item.image_paths].filter(Boolean).map(url => [url, url]))); setPreview(item); })}>ดูตัวอย่าง</button><a className="pf-news-edit-link" href="#/av">แก้เนื้อหาและรูปข่าว ↗</a></div></article>)}</div>}</section>
    {preview && <div className="pf-preview-backdrop"><div className="pf-preview" ref={previewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="ตัวอย่างผลงาน"><div className="pf-preview-bar"><strong>ตัวอย่าง · {preview.status === 'draft' ? 'ยังไม่เผยแพร่' : 'เผยแพร่แล้ว'}</strong><button onClick={() => setPreview(null)}>ปิดตัวอย่าง ✕</button></div><PortfolioDetail item={preview} year={years.find(y => y.academic_year === preview.academic_year)} images={images}/></div></div>}
  </div>;
}
