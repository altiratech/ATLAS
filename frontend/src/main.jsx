import { APP_NAME, APP_TAGLINE, PG } from './config.js';
import {
  $,
  $$,
  $chg,
  $pct,
  toast,
} from './formatting.js';
import {
  api,
  bootstrapAuth,
  clearAuthState,
  logoutAuth,
} from './auth.js';
import { AccessGate, ErrBox, Loading } from './shared/system.jsx';
import { AppShell } from './app/shell.jsx';
import { CountyPage } from './features/county-page.jsx';
import { Dashboard } from './features/dashboard.jsx';
import { AssumptionsMgr, ScreensMgr, SourcesPage } from './features/admin-pages.jsx';
import { PortfolioPage } from './features/portfolio-page.jsx';
import { ResearchWorkspace } from './features/research-workspace.jsx';
import { ScenarioLab } from './features/scenario-lab.jsx';
import { Screener } from './features/screener.jsx';
import { CountyPicker, STable } from './shared/data-ui.jsx';

// ═══════════════════════════════════════════════════════════════════
// MISSION / START HERE
// ═══════════════════════════════════════════════════════════════════
function MissionPage({nav}) {
  const workflow = [
    {id:'01', title:'Discover the market', body:'Scan county-level signals and recent movers to see where valuation and rent trends are diverging.'},
    {id:'02', title:'Test assumptions', body:'Run scenario and backtest modules before making commitments, so decisions are based on modeled outcomes.'},
    {id:'03', title:'Focus your research', body:'Build watchlists, notes, and screens that keep attention on the highest-conviction locations.'},
    {id:'04', title:'Build portfolio context', body:'Track exposure, risk concentration, and fair-value gaps across target holdings and active assets.'},
  ];

  const toolGuide = [
    {tool:'Dashboard', why:'Find where market conditions are shifting right now.', next:'Review top movers and open 2-3 counties.'},
    {tool:'Screener', why:'Filter opportunities instead of reviewing every county manually.', next:'Set minimum cap rate and access score.'},
    {tool:'County Detail', why:'Inspect valuation logic, history, sensitivity, and notes in one place.', next:'Open one county and record your thesis.'},
    {tool:'Watchlist', why:'Monitor high-priority counties over time.', next:'Track valuation and rent changes week to week.'},
    {tool:'Comparison', why:'Evaluate counties side by side before committing capital.', next:'Compare at least 3 target counties.'},
    {tool:'Research Workspace', why:'Capture thesis, status, conviction, and notes in one research system.', next:'Create workspace records for top 10 counties.'},
    {tool:'Scenario Lab', why:'Test upside/downside by changing growth, risk, and rent assumptions.', next:'Run best/base/worst-case scenarios.'},
    {tool:'Backtest', why:'Check whether your screening logic would have worked historically.', next:'Backtest your screen over 3-5 years.'},
    {tool:'Portfolio', why:'Quantify concentration risk and unrealized value gaps.', next:'Create one model portfolio and assess HHI.'},
    {tool:'Data Sources', why:'Verify where every input comes from and how often it updates.', next:'Confirm cadence before presenting outputs.'},
  ];

  return <div>
    <div className="card hero-card">
      <div className="hero-k">Altira Platform</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">{APP_TAGLINE}. This product combines property-level discovery, institutional research workflows, and investment modeling so users can move from raw data to decisions without juggling disconnected tools.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={()=>nav(PG.DASH)}>Open Market Dashboard</button>
        <button className="btn" onClick={()=>nav(PG.ABOUT)}>Read About</button>
      </div>
    </div>

    <div className="workflow-grid">
      {workflow.map(step => <div key={step.id} className="workflow-card">
        <div className="workflow-step">Step {step.id}</div>
        <div className="workflow-h">{step.title}</div>
        <div className="workflow-p">{step.body}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:'.8rem'}}>
      <h3 style={{fontSize:'.94rem',marginBottom:'.55rem'}}>Why Each Tool Exists</h3>
      <div className="why-grid">
        {toolGuide.map(item => <div key={item.tool} className="why-row">
          <div className="why-tool">{item.tool}</div>
          <div className="why-why">{item.why}</div>
          <div className="why-next">{item.next}</div>
        </div>)}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ABOUT
// ═══════════════════════════════════════════════════════════════════
function AboutPage() {
  return <div>
    <div className="card hero-card" style={{marginBottom:'.8rem'}}>
      <div className="hero-k">About</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">Altira Atlas is an agriculture intelligence platform built to connect land economics, market research, and investment workflows. It is designed for users who need clarity, defensible assumptions, and faster decisions.</p>
    </div>

    <div className="about-grid">
      <div className="about-block">
        <div className="about-h">Why This Project</div>
        <div className="about-p">Key farmland decisions still require pulling fragmented data from USDA datasets, macro feeds, county research, and manual spreadsheets. Altira Atlas exists to reduce that friction and make analysis repeatable.</div>
      </div>
      <div className="about-block">
        <div className="about-h">What It Merges</div>
        <div className="about-p">The platform blends financial modeling, property intelligence, market research, and deal workflow support into one operating system so users can move from discovery to diligence without context switching.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Who It Serves</div>
        <div className="about-p">Independent operators, advisors, lenders, investment teams, and analysts who need a rigorous way to research counties, test assumptions, and track conviction over time.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Current Product Scope</div>
        <div className="about-p">Current releases prioritize research and modeling workflows first: market scanning, county deep dives, scenarios, and backtests. Transaction and network layers are planned after this foundation is stable.</div>
      </div>
    </div>

    <div className="card">
      <h3 style={{fontSize:'.94rem',marginBottom:'.45rem'}}>Product Description</h3>
      <p className="about-p" style={{marginBottom:'.5rem'}}>Altira Atlas helps users answer three practical questions: where should we focus, what could happen under different conditions, and which opportunities are strong enough to act on. The design emphasizes data density, traceability, and fast iteration.</p>
      <p className="about-p">For a standalone company projects homepage concept, open <a className="lnk" href="/altiratech-home" target="_blank" rel="noreferrer">/altiratech-home</a>.</p>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════════════
function Watchlist({addToast, nav}) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  const load = () => {
    setLoading(true); setErr(null);
    api('/watchlist')
      .then(d=>setItems(d.items || []))
      .catch(e=>setErr(e.message))
      .finally(()=>setLoading(false));
  };
  React.useEffect(load, []);

  const remove = async (fips) => {
    try {
      await api(`/watchlist/${fips}`, {method:'DELETE'});
      setItems(items.filter(w=>w.fips!==fips));
      addToast(toast('Removed','ok'));
    } catch(e) { addToast(toast('Error','err')); }
  };

  if (loading) return <Loading/>;
  if (err) return <ErrBox title="Watchlist Error" msg={err} onRetry={load}/>;
  if (items.length === 0) return <div className="empty"><h3>Watchlist empty</h3><p>Add counties from the screener or county detail page</p></div>;

  return <div className="card">
    <h3 style={{fontSize:'1rem',marginBottom:'1rem'}}>Watched Counties ({items.length})</h3>
    <div style={{display:'grid',gap:'.75rem'}}>
      {items.map(w => {
        const m = w.metrics || {};
        const ch = w.changes || {};
        return <div key={w.fips} className="sc" style={{cursor:'pointer'}} onClick={()=>nav(PG.COUNTY,{fips:w.fips})}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:600,marginBottom:'.25rem'}}>{w.county}, {w.state}</div>
              <div style={{fontSize:'.8rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
                Cap: {$pct(m.implied_cap_rate)} | Rent: {$$(m.cash_rent)} | FV: {$$(m.fair_value)} | Access: {$(m.access_score,1)}
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{display:'flex',gap:'.375rem',justifyContent:'flex-end',flexWrap:'wrap',marginBottom:'.375rem'}}>
                {ch.cash_rent != null && <span className={`badge ${ch.cash_rent>=0?'badge-g':'badge-r'}`}>Rent {$chg(ch.cash_rent)}</span>}
                {ch.benchmark_value != null && <span className={`badge ${ch.benchmark_value>=0?'badge-g':'badge-r'}`}>Val {$chg(ch.benchmark_value)}</span>}
              </div>
              <button className="btn btn-sm btn-d" onClick={e=>{e.stopPropagation();remove(w.fips);}}>Remove</button>
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// COMPARISON
// ═══════════════════════════════════════════════════════════════════
function Comparison({addToast, params}) {
  const [selected, setSelected] = React.useState(params?.fips ? [params.fips] : []);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const compare = () => {
    if (selected.filter(Boolean).length < 2) { addToast(toast('Select at least 2 counties','err')); return; }
    setLoading(true);
    api(`/compare?fips=${selected.filter(Boolean).join(',')}`)
      .then(d=>setData(d))
      .catch(e=>addToast(toast('Comparison failed','err')))
      .finally(()=>setLoading(false));
  };

  React.useEffect(() => { if (selected.filter(Boolean).length >= 2) compare(); }, []);

  const metricRows = [
    {key:'cash_rent',label:'Cash Rent ($/ac)',fmt:v=>$$(v)},
    {key:'benchmark_value',label:'Land Value ($/ac)',fmt:v=>$$(v)},
    {key:'noi_per_acre',label:'NOI ($/ac)',fmt:v=>$$(v)},
    {key:'implied_cap_rate',label:'Implied Cap Rate',fmt:v=>$pct(v)},
    {key:'fair_value',label:'Fair Value ($/ac)',fmt:v=>$$(v)},
    {key:'rent_multiple',label:'Rent Multiple',fmt:v=>$(v,1)+'x'},
    {key:'required_return',label:'Required Return',fmt:v=>$pct(v)},
    {key:'cap_spread_to_10y',label:'Cap Spread (bps)',fmt:v=>$(v,0)},
    {key:'access_score',label:'Access Score',fmt:v=>$(v,1)},
    {key:'dscr',label:'DSCR',fmt:v=>$(v,2)},
    {key:'payback_period',label:'Payback (yrs)',fmt:v=>$(v,1)},
  ];

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Select Counties to Compare (up to 6)</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'.75rem',marginBottom:'1rem'}}>
        {[0,1,2,3,4,5].map(i => <CountyPicker key={i} value={selected[i]||''} onChange={f=>{const u=[...selected];u[i]=f;setSelected(u.filter(Boolean));}} placeholder={`County ${i+1}`}/>)}
      </div>
      <button className="btn btn-p" onClick={compare} disabled={loading||selected.filter(Boolean).length<2}>{loading?'Loading...':'Compare'}</button>
    </div>

    {data && data.counties && data.counties.length > 0 && <div className="card">
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Side-by-Side Comparison</h3>
      <div className="tc"><table>
        <thead><tr><th>Metric</th>{data.counties.map(c=><th key={c.geo_key}>{c.county_name}, {c.state}</th>)}</tr></thead>
        <tbody>{metricRows.map(mr => <tr key={mr.key}>
          <td style={{fontWeight:500}}>{mr.label}</td>
          {data.counties.map(c=><td key={c.geo_key} className="n">{mr.fmt(c.metrics?.[mr.key])}</td>)}
        </tr>)}</tbody>
      </table></div>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// BACKTEST
// ═══════════════════════════════════════════════════════════════════
function Backtest({addToast}) {
  const [screens, setScreens] = React.useState([]);
  const [selScreen, setSelScreen] = React.useState('');
  const [startYear, setStartYear] = React.useState('2018');
  const [evalYears, setEvalYears] = React.useState(3);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { api('/screens').then(d=>setScreens(d)).catch(()=>{}); }, []);

  const run = async () => {
    if (!selScreen) { addToast(toast('Select a screen','err')); return; }
    setLoading(true);
    try {
      const d = await api('/run/backtest', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({screen_id: parseInt(selScreen), start_year: startYear, eval_years: evalYears})
      });
      setResult(d);
    } catch(e) { addToast(toast('Backtest failed','err')); }
    finally { setLoading(false); }
  };

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Backtest Configuration</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.75rem'}}>
        <div className="fg"><label>Screen</label>
          <select value={selScreen} onChange={e=>setSelScreen(e.target.value)}>
            <option value="">Select...</option>
            {screens.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="fg"><label>Start Year</label><input type="number" value={startYear} onChange={e=>setStartYear(e.target.value)} min="2015" max="2024"/></div>
        <div className="fg"><label>Eval Years</label><input type="number" value={evalYears} onChange={e=>setEvalYears(parseInt(e.target.value))} min="1" max="7"/></div>
      </div>
      <button className="btn btn-p" onClick={run} disabled={loading}>{loading?'Running...':'Run Backtest'}</button>
    </div>

    {result && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Screen</div><div className="sc-v" style={{fontSize:'1rem'}}>{result.screen?.name}</div></div>
        <div className="sc"><div className="sc-l">Counties Screened</div><div className="sc-v">{result.counties_screened}</div></div>
        <div className="sc"><div className="sc-l">Counties Flagged</div><div className="sc-v">{result.counties_flagged}</div></div>
        <div className="sc"><div className="sc-l">Period</div><div className="sc-v" style={{fontSize:'1rem'}}>{result.start_year} + {result.eval_years}yr</div></div>
      </div>
      <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>Backtest Results</h3>
        <STable
          cols={[
            {key:'county',label:'County'},
            {key:'state',label:'ST'},
            {key:'value_change_pct',label:'Value Chg',num:true,fmt:v=><span className={v>=0?'pos':'neg'}>{$chg(v)}</span>},
            {key:'rent_change_pct',label:'Rent Chg',num:true,fmt:v=><span className={v>=0?'pos':'neg'}>{$chg(v)}</span>},
            {key:'total_return_est',label:'Est Return',num:true,fmt:v=><span className={v>=0?'pos':'neg'}>{$chg(v)}</span>},
          ]}
          rows={result.results||[]}
          initSort={['total_return_est','desc']}
        />
      </div>
    </div>}
  </div>;
}

function App() {
  const [pg, setPg] = React.useState(PG.MISSION);
  const [pp, setPp] = React.useState({});
  const [toasts, setToasts] = React.useState([]);
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const [legacyRedirectNote, setLegacyRedirectNote] = React.useState(false);
  const [authReady, setAuthReady] = React.useState(false);
  const [authState, setAuthState] = React.useState(null);
  const [authErr, setAuthErr] = React.useState('');
  const [authRequiresLogin, setAuthRequiresLogin] = React.useState(false);

  const runAuthBootstrap = React.useCallback(async (force = false) => {
    setAuthReady(false);
    setAuthErr('');
    setAuthRequiresLogin(false);
    try {
      const data = await bootstrapAuth(force);
      setAuthState(data || null);
      return data;
    } catch (e) {
      setAuthState(null);
      if (e?.authRequired) {
        setAuthRequiresLogin(true);
      } else {
        setAuthErr(e?.message || 'Authentication bootstrap failed');
      }
      throw e;
    } finally {
      setAuthReady(true);
    }
  }, []);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('legacy_redirect') !== '1') return;
    setLegacyRedirectNote(true);
    url.searchParams.delete('legacy_redirect');
    const q = url.searchParams.toString();
    const cleaned = `${url.pathname}${q ? `?${q}` : ''}${url.hash || ''}`;
    window.history.replaceState({}, '', cleaned);
  }, []);

  React.useEffect(() => {
    const h = e => { if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setCmdOpen(o=>!o);} };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  }, []);

  React.useEffect(() => {
    if (toasts.length===0) return;
    const t = setTimeout(()=>setToasts(ts=>ts.slice(1)), toasts[0].dur);
    return ()=>clearTimeout(t);
  }, [toasts]);

  React.useEffect(() => {
    runAuthBootstrap().catch(() => {});
  }, [runAuthBootstrap]);

  const addToast = t => setToasts(ts=>[...ts,t]);
  const nav = (p,params={}) => { setPg(p); setPp(params); setCmdOpen(false); };
  const researchUser = authState?.user_key || '';
  const authSource = authState?.source || '--';

  const resetSession = async () => {
    await logoutAuth();
    try {
      await runAuthBootstrap(true);
      addToast(toast('Session reset', 'ok'));
    } catch {
      addToast(toast('Session reset failed', 'err'));
    }
  };

  const render = () => {
    if (!authReady) return <Loading/>;
    if (authRequiresLogin) return (
      <AccessGate onRetry={() => { clearAuthState(); runAuthBootstrap(true).catch(() => {}); }} />
    );
    if (authErr) return (
      <ErrBox
        title="Authentication Error"
        msg={`${authErr}. Retry to continue.`}
        onRetry={() => runAuthBootstrap(true).catch(() => {})}
      />
    );
    switch(pg) {
      case PG.MISSION: return <MissionPage nav={nav}/>;
      case PG.ABOUT: return <AboutPage/>;
      case PG.RESEARCH: return <ResearchWorkspace addToast={addToast} nav={nav} params={pp} researchUser={researchUser}/>;
      case PG.DASH: return <Dashboard addToast={addToast} nav={nav}/>;
      case PG.SCREEN: return <Screener addToast={addToast} nav={nav}/>;
      case PG.COUNTY: return <CountyPage addToast={addToast} params={pp} nav={nav}/>;
      case PG.WATCH: return <Watchlist addToast={addToast} nav={nav}/>;
      case PG.COMPARE: return <Comparison addToast={addToast} params={pp}/>;
      case PG.SCENARIO: return <ScenarioLab addToast={addToast} params={pp} researchUser={researchUser}/>;
      case PG.BACKTEST: return <Backtest addToast={addToast}/>;
      case PG.PORTFOLIO: return <PortfolioPage addToast={addToast}/>;
      case PG.SCREENS_MGR: return <ScreensMgr addToast={addToast}/>;
      case PG.ASSUME: return <AssumptionsMgr addToast={addToast}/>;
      case PG.SOURCES: return <SourcesPage addToast={addToast}/>;
      default: return <Dashboard addToast={addToast} nav={nav}/>;
    }
  };

  return <AppShell
    currentPage={pg}
    nav={nav}
    content={render()}
    authSource={authSource}
    researchUser={researchUser}
    authReady={authReady}
    resetSession={resetSession}
    legacyRedirectNote={legacyRedirectNote}
    dismissLegacy={() => setLegacyRedirectNote(false)}
    cmdOpen={cmdOpen}
    setCmdOpen={setCmdOpen}
    toasts={toasts}
    dismissToast={(id) => setToasts(ts => ts.filter(x => x.id !== id))}
  />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
