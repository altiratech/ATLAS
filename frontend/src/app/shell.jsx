import { APP_NAME, PG } from '../config.js';
import { api } from '../auth.js';

function CmdPalette({isOpen, onClose, nav}) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [results, setResults] = React.useState([]);
  const ref = React.useRef(null);

  React.useEffect(() => { if (isOpen && ref.current) { ref.current.focus(); setQ(''); setSel(0); setResults([]); } }, [isOpen]);

  React.useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q)}`).then(d=>setResults(d)).catch(()=>setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (!isOpen) return null;

  const pages = [
    {name:'Mission',desc:'What this platform does and why',action:()=>nav(PG.MISSION)},
    {name:'About',desc:'Project purpose and scope',action:()=>nav(PG.ABOUT)},
    {name:'Dashboard',desc:'Market overview',action:()=>nav(PG.DASH)},
    {name:'Research Workspace',desc:'Capture thesis, tags, and conviction',action:()=>nav(PG.RESEARCH)},
    {name:'Screener',desc:'Filter counties',action:()=>nav(PG.SCREEN)},
    {name:'Watchlist',desc:'Tracked counties',action:()=>nav(PG.WATCH)},
    {name:'Comparison',desc:'Side-by-side',action:()=>nav(PG.COMPARE)},
    {name:'Scenario Lab',desc:'What-if analysis',action:()=>nav(PG.SCENARIO)},
    {name:'Backtest',desc:'Historical testing',action:()=>nav(PG.BACKTEST)},
    {name:'Portfolio',desc:'Holdings',action:()=>nav(PG.PORTFOLIO)},
  ];

  const pageResults = pages.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase()));
  const allResults = [
    ...pageResults.map(p => ({...p, type:'page'})),
    ...results.map(r => ({name:r.label, desc:r.sublabel, type:r.type, action:()=>{
      if(r.type==='county') nav(PG.COUNTY, {fips:r.id});
      else if(r.type==='screen') nav(PG.SCREENS_MGR);
    }})),
  ];

  const onKey = (e) => {
    if(e.key==='Escape'){onClose();}
    else if(e.key==='ArrowDown'){e.preventDefault();setSel((sel+1)%Math.max(allResults.length,1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setSel((sel-1+allResults.length)%Math.max(allResults.length,1));}
    else if(e.key==='Enter'&&allResults[sel]){allResults[sel].action();onClose();}
  };

  return <div className="cp-overlay" onClick={onClose}>
    <div onClick={e=>e.stopPropagation()}>
      <input ref={ref} className="cp-input" type="text" placeholder="Search counties, pages, metrics... (Esc to close)" value={q} onChange={e=>{setQ(e.target.value);setSel(0);}} onKeyDown={onKey}/>
      {(q.trim()||allResults.length>0) && <div className="cp-list">
        {allResults.length===0 && q.trim() ? <div style={{padding:'.75rem 1rem',color:'var(--text2)',fontSize:'.85rem'}}>No results</div>
         : allResults.map((r,i)=><div key={i} className={`cp-item ${i===sel?'sel':''}`} onClick={()=>{r.action();onClose();}}>
          <div><span style={{color:'var(--text1)'}}>{r.name}</span>{r.desc && <span style={{fontSize:'.8rem',color:'var(--text2)',marginLeft:'.5rem'}}>{r.desc}</span>}</div>
          <span className={`badge ${r.type==='county'?'badge-g':r.type==='page'?'badge-b':'badge-a'}`}>{r.type}</span>
        </div>)}
      </div>}
    </div>
  </div>;
}

const titles = {
  [PG.MISSION]:'Mission',
  [PG.ABOUT]:'About',
  [PG.RESEARCH]:'Research Workspace',
  [PG.DASH]:'Dashboard',[PG.SCREEN]:'Screener',[PG.COUNTY]:'County Detail',
  [PG.WATCH]:'Watchlist',[PG.COMPARE]:'Comparison',[PG.SCENARIO]:'Scenario Lab',
  [PG.BACKTEST]:'Backtest',[PG.PORTFOLIO]:'Portfolio',[PG.SCREENS_MGR]:'Screens',
  [PG.ASSUME]:'Assumptions',[PG.SOURCES]:'Data Sources',
};

const navItems = [
  {section:'Start Here', items:[
    {id:PG.MISSION,label:'Mission',icon:'MN'},
    {id:PG.ABOUT,label:'About',icon:'AB'},
  ]},
  {section:'Analysis', items:[
    {id:PG.DASH,label:'Dashboard',icon:'D1'},
    {id:PG.SCREEN,label:'Screener',icon:'SC'},
    {id:PG.WATCH,label:'Watchlist',icon:'WL'},
    {id:PG.COMPARE,label:'Comparison',icon:'CP'},
  ]},
  {section:'Research', items:[
    {id:PG.RESEARCH,label:'Workspace',icon:'RW'},
    {id:PG.SCENARIO,label:'Scenario Lab',icon:'SL'},
    {id:PG.BACKTEST,label:'Backtest',icon:'BT'},
    {id:PG.PORTFOLIO,label:'Portfolio',icon:'PF'},
  ]},
  {section:'Settings', items:[
    {id:PG.SCREENS_MGR,label:'Screens',icon:'SM'},
    {id:PG.ASSUME,label:'Assumptions',icon:'AS'},
    {id:PG.SOURCES,label:'Data Sources',icon:'DS'},
  ]},
];

export function AppShell({
  currentPage,
  nav,
  content,
  authSource,
  researchUser,
  authReady,
  resetSession,
  legacyRedirectNote,
  dismissLegacy,
  cmdOpen,
  setCmdOpen,
  toasts,
  dismissToast,
}) {
  return <div className="app">
    <div className="side">
      <div className="side-logo">{APP_NAME}</div>
      {navItems.map(sec => <div key={sec.section} className="nav-sec">
        <div className="nav-lbl">{sec.section}</div>
        {sec.items.map(it => <div key={it.id} className={`nav-i ${currentPage===it.id?'act':''}`} onClick={()=>nav(it.id)}>
          <div className="nav-ic">{it.icon}</div><span>{it.label}</span>
        </div>)}
      </div>)}
    </div>
    <div className="main">
      <div className="top">
        <div className="top-t">{titles[currentPage]||APP_NAME}</div>
        <div className="top-a">
          <button className="btn btn-sm" disabled title={`Identity source: ${authSource}`}>
            User: {researchUser || '--'}
          </button>
          <button className="btn btn-sm" onClick={resetSession} disabled={!authReady} title="Reset auth session">
            Reset Session
          </button>
          <button className="btn btn-sm" onClick={()=>setCmdOpen(true)} title="Cmd+K">Cmd+K Search</button>
        </div>
      </div>
      {legacyRedirectNote && <div className="legacy-b">
        <span>Legacy domain migrated. Canonical URL is atlas.altiratech.com.</span>
        <button className="btn btn-sm" onClick={dismissLegacy}>Dismiss</button>
      </div>}
      <div className="content">{content}</div>
    </div>
    <CmdPalette isOpen={cmdOpen} onClose={()=>setCmdOpen(false)} nav={nav}/>
    <div className="toast-c">{toasts.map(t => <div key={t.id} className={`toast ${t.type==='ok'?'ok':t.type==='err'?'err':''}`}>
      <div style={{fontSize:'.85rem',flex:1}}>{t.msg}</div>
      <button className="toast-x" onClick={()=>dismissToast(t.id)}>✕</button>
    </div>)}</div>
  </div>;
}
