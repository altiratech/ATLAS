import { APP_NAME, PG } from '../config.js';
import { api } from '../auth.js';
import { playbookBadgeClass } from '../shared/playbooks.js';
import { thesisBadgeClass } from '../shared/thesis-lenses.js';

function CmdPalette({ isOpen, onClose, nav, activeThesis }) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [results, setResults] = React.useState([]);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (isOpen && ref.current) {
      ref.current.focus();
      setQ('');
      setSel(0);
      setResults([]);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q)}`).then((d) => setResults(d)).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (!isOpen) return null;

  const pages = [
    { name: 'About', desc: 'What Atlas is, how it works, and where it is going', action: () => nav(PG.ABOUT) },
    { name: 'Home', desc: 'Choose a perspective, pick a thesis lens, and resume work', action: () => nav(PG.HOME) },
    {
      name: 'Perspective Home',
      desc: activeThesis?.label
        ? `Current perspective home with ${activeThesis.label}`
        : 'Current perspective home',
      action: () => nav(PG.DASH),
    },
    { name: 'Research Workspace', desc: 'Capture thesis, tags, and conviction', action: () => nav(PG.RESEARCH) },
    { name: 'Screener', desc: 'Filter counties', action: () => nav(PG.SCREEN) },
    { name: 'Watchlist', desc: 'Tracked counties', action: () => nav(PG.WATCH) },
    { name: 'Comparison', desc: 'Side-by-side', action: () => nav(PG.COMPARE) },
    { name: 'Scenario Lab', desc: 'What-if analysis', action: () => nav(PG.SCENARIO) },
    { name: 'Backtest', desc: 'Historical testing', action: () => nav(PG.BACKTEST) },
    { name: 'Portfolio', desc: 'Holdings', action: () => nav(PG.PORTFOLIO) },
    { name: 'Saved Views', desc: 'Reusable perspective- and thesis-aware screens', action: () => nav(PG.SCREENS_MGR) },
  ];

  const pageResults = pages.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase()));
  const allResults = [
    ...pageResults.map((p) => ({ ...p, type: 'page' })),
    ...results.map((r) => ({
      name: r.label,
      desc: r.sublabel,
      type: r.type,
      action: () => {
        if (r.type === 'county') nav(PG.COUNTY, { fips: r.id });
        else if (r.type === 'screen') nav(PG.SCREENS_MGR);
      },
    })),
  ];

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((sel + 1) % Math.max(allResults.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((sel - 1 + allResults.length) % Math.max(allResults.length, 1));
    } else if (e.key === 'Enter' && allResults[sel]) {
      allResults[sel].action();
      onClose();
    }
  };

  return <div className="cp-overlay" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()}>
      <input ref={ref} className="cp-input" type="text" placeholder="Search counties, pages, metrics... (Esc to close)" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}/>
      {(q.trim() || allResults.length > 0) && <div className="cp-list">
        {allResults.length === 0 && q.trim() ? <div style={{ padding: '.75rem 1rem', color: 'var(--text2)', fontSize: '.85rem' }}>No results</div>
          : allResults.map((r, i) => <div key={i} className={`cp-item ${i === sel ? 'sel' : ''}`} onClick={() => { r.action(); onClose(); }}>
            <div><span style={{ color: 'var(--text1)' }}>{r.name}</span>{r.desc && <span style={{ fontSize: '.8rem', color: 'var(--text2)', marginLeft: '.5rem' }}>{r.desc}</span>}</div>
            <span className={`badge ${r.type === 'county' ? 'badge-g' : r.type === 'page' ? 'badge-b' : 'badge-a'}`}>{r.type}</span>
          </div>)}
      </div>}
    </div>
  </div>;
}

const titles = {
  [PG.HOME]: 'Atlas Home',
  [PG.MISSION]: 'About',
  [PG.ABOUT]: 'About',
  [PG.RESEARCH]: 'Research Workspace',
  [PG.DASH]: 'Perspective Home',
  [PG.SCREEN]: 'Screener',
  [PG.COUNTY]: 'County Detail',
  [PG.WATCH]: 'Watchlist',
  [PG.COMPARE]: 'Comparison',
  [PG.SCENARIO]: 'Scenario Lab',
  [PG.BACKTEST]: 'Backtest',
  [PG.PORTFOLIO]: 'Portfolio',
  [PG.SCREENS_MGR]: 'Saved Views',
  [PG.ASSUME]: 'Assumptions',
  [PG.SOURCES]: 'Data Sources',
};

function buildNavItems() {
  return [
    {
      section: 'Start Here',
      items: [
        { id: PG.ABOUT, label: 'About', icon: 'AB' },
        { id: PG.HOME, label: 'Home', icon: 'HM' },
      ],
    },
    {
      section: 'Explore',
      items: [
        { id: PG.DASH, label: 'Perspective Home', icon: 'PB' },
        { id: PG.SCREEN, label: 'Screener', icon: 'SC' },
        { id: PG.WATCH, label: 'Watchlist', icon: 'WL' },
        { id: PG.COMPARE, label: 'Comparison', icon: 'CP' },
      ],
    },
    {
      section: 'Research',
      items: [
        { id: PG.RESEARCH, label: 'Workspace', icon: 'RW' },
        { id: PG.SCENARIO, label: 'Scenario Lab', icon: 'SL' },
        { id: PG.BACKTEST, label: 'Backtest', icon: 'BT' },
        { id: PG.PORTFOLIO, label: 'Portfolio', icon: 'PF' },
      ],
    },
    {
      section: 'Settings',
      items: [
        { id: PG.SCREENS_MGR, label: 'Saved Views', icon: 'SV' },
        { id: PG.ASSUME, label: 'Assumptions', icon: 'AS' },
        { id: PG.SOURCES, label: 'Data Sources', icon: 'DS' },
      ],
    },
  ];
}

export function AppShell({
  currentPage,
  nav,
  content,
  activePlaybook,
  activeThesis,
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
  const navItems = React.useMemo(() => buildNavItems(), []);
  const authSourceLabel = authSource === 'edge_identity'
    ? 'edge identity'
    : authSource === 'dev_header'
      ? 'dev header'
      : authSource === 'anonymous'
        ? 'demo session'
        : authSource || '--';
  const pageTitle = currentPage === PG.DASH
    ? (activePlaybook?.label || titles[currentPage] || APP_NAME)
    : titles[currentPage] || APP_NAME;

  return <div className="app">
    <div className="side">
      <div className="side-logo">{APP_NAME}</div>
      {navItems.map((sec) => <div key={sec.section} className="nav-sec">
        <div className="nav-lbl">{sec.section}</div>
        {sec.items.map((it) => <div key={it.id} className={`nav-i ${currentPage === it.id ? 'act' : ''}`} onClick={() => nav(it.id)}>
          <div className="nav-ic">{it.icon}</div><span>{it.label}</span>
        </div>)}
      </div>)}
    </div>
    <div className="main">
      <div className="top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
          <div className="top-t">{pageTitle}</div>
          {activePlaybook && currentPage !== PG.HOME && currentPage !== PG.MISSION && currentPage !== PG.ABOUT && (
            <span className={`badge ${playbookBadgeClass(activePlaybook.status)}`}>PERSPECTIVE {activePlaybook.shortLabel}</span>
          )}
          {activeThesis && currentPage !== PG.HOME && currentPage !== PG.MISSION && currentPage !== PG.ABOUT && (
            <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>LENS {activeThesis.shortLabel}</span>
          )}
        </div>
        <div className="top-a">
          <button className="btn btn-sm" disabled title={`Session source: ${authSourceLabel}`}>
            User: {researchUser || '--'}
          </button>
          <button className="btn btn-sm" onClick={resetSession} disabled={!authReady} title="Reset auth session">
            Reset Session
          </button>
          <button className="btn btn-sm" onClick={() => setCmdOpen(true)} title="Cmd+K">Cmd+K Search</button>
        </div>
      </div>
      {legacyRedirectNote && <div className="legacy-b">
        <span>Legacy domain migrated. Canonical URL is atlas.altiratech.com.</span>
        <button className="btn btn-sm" onClick={dismissLegacy}>Dismiss</button>
      </div>}
      <div className="content">{content}</div>
    </div>
    <CmdPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} nav={nav} activeThesis={activeThesis}/>
    <div className="toast-c">{toasts.map((t) => <div key={t.id} className={`toast ${t.type === 'ok' ? 'ok' : t.type === 'err' ? 'err' : ''}`}>
      <div style={{ fontSize: '.85rem', flex: 1 }}>{t.msg}</div>
      <button className="toast-x" onClick={() => dismissToast(t.id)}>✕</button>
    </div>)}</div>
  </div>;
}
