import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { publicNavItems } from './publicNavItems';
import './publicNavigation.css';

// Icons are static, trusted markup copied from the site's own navigation.
function NavIcon({ html }) { return <span className="pf-nav-gold" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }}/>; }
export default function PublicNavigation({ activeHref = 'portfolios/' } = {}) {
  const base = import.meta.env.BASE_URL;
  const [mobile, setMobile] = useState(false), [opened, setOpened] = useState(null);
  const nav = useRef(null), burger = useRef(null), triggers = useRef({});
  const destination = href => href.startsWith('#/') ? base + href : href.startsWith('./') ? base + href.slice(2) : href.startsWith('/') ? base + href.slice(1) : href;
  useEffect(() => {
    const dismiss = e => { if (!nav.current?.contains(e.target)) { setOpened(null); setMobile(false); } };
    const key = e => { if (e.key !== 'Escape') return; if (opened !== null) { triggers.current[opened]?.focus(); setOpened(null); } else if (mobile) { burger.current?.focus(); setMobile(false); } };
    const query = window.matchMedia('(max-width: 1100px)');
    const resize = () => { setMobile(false); setOpened(null); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key); query.addEventListener('change', resize);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key); query.removeEventListener('change', resize); };
  }, [mobile, opened]);
  function renderLink(item) {
    const active = item.href.includes(activeHref);
    const external = item.href.startsWith('https://');
    return <a href={destination(item.href)} aria-current={active ? 'page' : undefined} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={() => { setOpened(null); setMobile(false); }}><NavIcon html={item.icon}/><span>{item.label}</span></a>;
  }
  return <header className="pf-site-header" ref={nav}>
    <nav className="pf-site-nav" aria-label="เมนูหลัก">
      <svg width="0" height="0" className="pf-nav-defs" aria-hidden="true"><defs><linearGradient id="pfRoyalGoldGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#FFE27A"/><stop offset="35%" stopColor="#F59E0B"/><stop offset="70%" stopColor="#D97706"/><stop offset="100%" stopColor="#B45309"/></linearGradient></defs></svg>
      <a className="pf-site-brand" href={base + '#/home'}><img src={base + 'all-logos.png'} alt="ตราสัญลักษณ์โรงเรียนสรรพวิทยาคมและสภานักเรียน SWSC"/><span>SWSC.OFFICIAL</span></a>
      <button className="pf-nav-burger" ref={burger} aria-label={mobile ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={mobile} aria-controls="pf-site-menu" onClick={() => { setMobile(!mobile); setOpened(null); }}>{mobile ? <X size={23}/> : <Menu size={23}/>}</button>
      <ul id="pf-site-menu" className={`pf-site-menu${mobile ? ' pf-site-menu-open' : ''}`}>
        {publicNavItems.map((item, index) => <li key={item.label} className={item.children ? 'pf-nav-group' : ''}>
          {item.children ? <><button ref={el => { triggers.current[index] = el; }} aria-expanded={opened === index} aria-controls={`pf-nav-panel-${index}`} className={item.children.some(child => child.href.includes(activeHref)) ? 'pf-nav-current-group' : ''} onClick={() => setOpened(opened === index ? null : index)}><NavIcon html={item.icon}/><span>{item.label}</span><ChevronDown size={12} className={opened === index ? 'pf-nav-chevron-open' : ''}/></button><ul id={`pf-nav-panel-${index}`} className="pf-nav-panel" hidden={opened !== index}>{item.children.map(child => <li key={child.label}>{renderLink(child)}</li>)}</ul></> : renderLink(item)}
        </li>)}
      </ul>
    </nav>
  </header>;
}
