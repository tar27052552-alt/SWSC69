import { useEffect, useState } from 'react';
import { portfolioQuery, portfolioImages, sortPortfolioItems } from '../lib/portfolio';
import { PortfolioCard, PortfolioDetail } from './PortfolioContent';
import { newsAsPortfolio, mergePortfolioYears } from '../lib/newsPortfolio';
import PortfolioHero from './PortfolioHero';
import { CalendarDays, History, RotateCw, Trophy } from 'lucide-react';
import PublicNavigation from './PublicNavigation';

function locationState() { const q = new URLSearchParams(window.location.search); return { year: Number(q.get('year')) || null, id: q.get('id') || null }; }
export default function PortfolioPublic({ client }) {
  const [route, setRoute] = useState(locationState);
  const [state, setState] = useState({ loading: true, years: [], items: [], images: {}, year: null, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => { const pop = () => setRoute(locationState()); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setState(s => ({ ...s, loading: true, error: '' }));
      try {
        const news = [];
        let newsPage;
        do {
          newsPage = await portfolioQuery(client.from('web_news').select('*').eq('category', 'ผลงาน').order('id').range(news.length, news.length + 999), controller.signal);
          news.push(...newsPage);
        } while (newsPage.length === 1000);
        const newsItems = news.map(newsAsPortfolio).filter(Boolean);
        // Tagged news works even before the separate archive tables are installed.
        const optionalArchive = async query => {
          try { return await portfolioQuery(query, controller.signal); }
          catch (e) { if (['PGRST205', '42P01'].includes(e.code)) return []; throw e; }
        };
        const storedYears = await optionalArchive(client.from('council_portfolio_years').select('*').order('academic_year', { ascending: false }));
        const years = mergePortfolioYears(storedYears, newsItems);
        let selectedYear = route.year || years[0]?.academic_year;
        if (route.id) {
          const item = route.id.startsWith('news-') ? newsItems.find(i => i.id === route.id) : await portfolioQuery(client.from('council_portfolio_items').select('academic_year').eq('id', route.id).eq('status', 'published').maybeSingle(), controller.signal);
          if (!item) throw new Error('ไม่พบผลงานนี้ หรือผลงานยังไม่ได้เผยแพร่');
          selectedYear = item.academic_year;
        }
        const year = years.find(y => y.academic_year === selectedYear);
        const items = [];
        if (year) {
          let page = [];
          do {
            page = await optionalArchive(client.from('council_portfolio_items').select('*').eq('academic_year', selectedYear).eq('status', 'published').order('id').range(items.length, items.length + 999));
            items.push(...page);
          } while (page.length === 1000);
        }
        const images = await portfolioImages([year?.cover_path, ...items.flatMap(i => [i.cover_path, ...i.image_paths])], client);
        const matchingNews = newsItems.filter(i => i.academic_year === selectedYear);
        for (const item of matchingNews) for (const url of [item.cover_path, ...item.image_paths].filter(Boolean)) images[url] = url;
        items.push(...matchingNews);
        if (active) setState({ loading: false, years, items: sortPortfolioItems(items), images, year, error: '' });
      } catch (e) { if (active) setState(s => ({ ...s, loading: false, error: e.message })); }
    });
    return () => { active = false; controller.abort(); };
  }, [client, route, reload]);
  function navigate(year, id) {
    const q = new URLSearchParams(); if (year) q.set('year', year); if (id) q.set('id', id);
    window.history.pushState(null, '', `${window.location.pathname}${q.size ? '?' + q : ''}`);
    setRoute({ year, id }); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const selected = state.items.find(i => i.id === route.id);
  const base = import.meta.env.BASE_URL;
  const selectedYearValue = route.year || state.year?.academic_year || '';
  const missingSelectedYear = route.year && !state.years.some(year => year.academic_year === route.year);
  const showingCurrentYear = !state.loading && !state.error && (!route.year || state.year?.academic_year === route.year);
  return <div className="pf-public">
    <PublicNavigation/>
    <main className="pf-main">
      {!route.id && <PortfolioHero year={showingCurrentYear ? state.year || { academic_year: route.year } : { academic_year: route.year }} items={showingCurrentYear ? state.items : []} images={state.images} loading={state.loading}/>}
      <div className="pf-toolbar" id="portfolio-collection"><a href={base + 'portfolios/'} onClick={e => { e.preventDefault(); navigate(null, null); }}><span className="pf-toolbar-icon"><History size={21} aria-hidden="true"/></span><span>แฟ้มผลงานแต่ละปี<small>เลือกปีเพื่อย้อนดูผลงานของแต่ละรุ่น</small></span></a><label><CalendarDays size={18} aria-hidden="true"/>ปีการศึกษา <select aria-label="เลือกปีการศึกษา" value={selectedYearValue} onChange={e => navigate(Number(e.target.value), null)}><option value="" disabled>เลือกปี</option>{missingSelectedYear && <option value={route.year}>{route.year} · ยังไม่มีผลงานเผยแพร่</option>}{state.years.map(y => <option key={y.academic_year} value={y.academic_year}>{y.academic_year} · {y.cohort_name}</option>)}</select></label><button onClick={() => setReload(x => x + 1)} disabled={state.loading}><RotateCw size={16} aria-hidden="true"/>รีเฟรช</button></div>
      {state.loading ? <section className="pf-loading" role="status"><span className="pf-spinner"/><h2>กำลังเปิดแฟ้มผลงาน</h2><p>เรื่องราวของสภานักเรียนแต่ละรุ่น</p></section>
        : state.error ? <section className="pf-empty" role="alert"><h1>ยังเปิดผลงานไม่ได้</h1><p>{state.error}</p><button onClick={() => setReload(x => x + 1)}>ลองใหม่</button></section>
        : selected ? <><button className="pf-back" onClick={() => navigate(selected.academic_year, null)}>← ผลงานทั้งหมดของปี {selected.academic_year}</button><PortfolioDetail item={selected} year={state.year} images={state.images}/></>
        : !state.year ? <section className="pf-empty"><h1>ยังไม่มีผลงานเผยแพร่ในปีนี้</h1><p>เลือกปีอื่นเพื่อชมเรื่องราวของสภานักเรียน</p></section>
        : <><div className="pf-section-heading"><div><div className="pf-eyebrow">THE YEAR IN REVIEW</div><h2>ผลงานของปี {state.year.academic_year}</h2>{state.year.summary && <p className="pf-year-summary">{state.year.summary}</p>}</div><span className="pf-total"><Trophy size={17} aria-hidden="true"/>{state.items.length} ผลงาน</span></div><div className="pf-cards">{state.items.map(item => <PortfolioCard key={item.id} item={item} images={state.images} href={`?year=${item.academic_year}&id=${item.id}`} onClick={e => { if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(item.academic_year, item.id); } }}/>)}</div></>}
    </main><footer className="pf-footer"><strong>SWSC<span>.OFFICIAL</span></strong><p>สภานักเรียนโรงเรียนสรรพวิทยาคม</p><small>เก็บเรื่องราว ส่งต่อผลงาน จากรุ่นสู่รุ่น</small></footer>
  </div>;
}
