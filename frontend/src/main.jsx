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
  fetchResearchWorkspace,
  logoutAuth,
} from './auth.js';
import { AccessGate, ErrBox, Loading } from './shared/system.jsx';
import { AppShell } from './app/shell.jsx';
import { CountyPage } from './features/county-page.jsx';
import { Dashboard } from './features/dashboard.jsx';
import { ResearchWorkspace } from './features/research-workspace.jsx';
import { Screener } from './features/screener.jsx';
import { CountyPicker, MiniBar, Spark, STable } from './shared/data-ui.jsx';

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
// SCENARIO LAB
// ═══════════════════════════════════════════════════════════════════
function ScenarioLab({addToast, params, researchUser}) {
  const [county, setCounty] = React.useState(params?.fips || '');
  const [rp, setRp] = React.useState(4.5);
  const [gr, setGr] = React.useState(2.0);
  const [rs, setRs] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [packName, setPackName] = React.useState('');
  const [packs, setPacks] = React.useState([]);
  const [packsLoading, setPacksLoading] = React.useState(false);
  const navPackRef = React.useRef('');

  const loadPacks = React.useCallback((fips) => {
    if (!fips) {
      setPacks([]);
      return;
    }
    setPacksLoading(true);
    fetchResearchWorkspace(fips)
      .then((workspace) => {
        const ordered = [...workspace.scenario_packs].sort((a,b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        setPacks(ordered);
      })
      .catch(() => {
        setPacks([]);
        addToast(toast('Failed to load saved packs', 'err'));
      })
      .finally(() => setPacksLoading(false));
  }, [addToast]);

  React.useEffect(() => { loadPacks(county); }, [county, loadPacks, researchUser]);
  React.useEffect(() => { navPackRef.current = ''; }, [county]);
  React.useEffect(() => { if (params?.fips) setCounty(params.fips); }, [params?.fips]);
  React.useEffect(() => {
    const packId = params?.pack_id ? String(params.pack_id) : '';
    if (!packId || !county || navPackRef.current === packId) return;
    const found = packs.find(p => String(p.id) === packId);
    if (!found) return;
    setRp(Number(found.risk_premium));
    setGr(Number(found.growth_rate));
    setRs(Number(found.rent_shock));
    navPackRef.current = String(packId);
    addToast(toast(`Loaded pack: ${found.name}`, 'ok'));
  }, [params?.pack_id, county, packs]);

  const run = async () => {
    if (!county) { addToast(toast('Select a county','err')); return; }
    setLoading(true);
    try {
      const baseOverrides = { risk_premium: rp, long_run_growth: gr/100, near_term_rent_shock: rs/100 };
      const scenarioSets = [
        { name: 'Best Case', overrides: { risk_premium: Math.max(2, rp - 0.5), long_run_growth: (gr + 0.5)/100, near_term_rent_shock: (rs + 5)/100 } },
        { name: 'Base Case', overrides: baseOverrides },
        { name: 'Worst Case', overrides: { risk_premium: Math.min(8, rp + 0.5), long_run_growth: Math.max(0, gr - 0.5)/100, near_term_rent_shock: (rs - 5)/100 } },
      ];
      const d = await api('/run/scenario', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          geo_key: county, as_of: 'latest',
          overrides: baseOverrides,
          scenario_sets: scenarioSets,
          vary_params: [
            {param:'risk_premium', values:[2,3,4,4.5,5,5.5,6,7], target_metric:'fair_value'},
            {param:'long_run_growth', values:[0.01,0.015,0.02,0.025,0.03,0.035,0.04], target_metric:'fair_value'},
          ]
        })
      });
      setResult(d);
      try {
        await api(`/research/workspaces/${county}/scenario-runs`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            scenario_name: 'Best/Base/Worst Snapshot',
            as_of_date: d.as_of || 'latest',
            assumptions: baseOverrides,
            comparison: {
              comparison_table: d.comparison_table || [],
              driver_decomposition: d.driver_decomposition || [],
            },
          }),
        });
      } catch {}
    } catch(e) { addToast(toast('Scenario failed','err')); }
    finally { setLoading(false); }
  };

  const base = result?.base;
  const bm = base?.metrics || {};

  const savePack = async () => {
    if (!county) { addToast(toast('Select a county first', 'err')); return; }
    const name = packName.trim() || `Pack ${new Date().toLocaleDateString('en-US')}`;
    try {
      const created = await api(`/research/workspaces/${county}/scenario-packs`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name,
          risk_premium: Number(rp),
          growth_rate: Number(gr),
          rent_shock: Number(rs),
        }),
      });
      setPackName('');
      setPacks(prev => [created, ...prev].sort((a,b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
      addToast(toast('Scenario pack saved', 'ok'));
    } catch (e) {
      addToast(toast('Failed to save pack', 'err'));
    }
  };

  const loadPack = (pack) => {
    setRp(Number(pack.risk_premium));
    setGr(Number(pack.growth_rate));
    setRs(Number(pack.rent_shock));
    addToast(toast(`Loaded pack: ${pack.name}`, 'ok'));
  };

  const deletePack = async (packId) => {
    if (!county) return;
    try {
      await api(`/research/scenario-packs/${packId}`, { method:'DELETE' });
      setPacks(prev => prev.filter(p => p.id !== packId));
      addToast(toast('Scenario pack removed', 'ok'));
    } catch (e) {
      addToast(toast('Delete failed', 'err'));
    }
  };

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Scenario Parameters</h3>
      <div className="fg"><label>County</label><CountyPicker value={county} onChange={setCounty}/></div>
      <div style={{fontSize:'.7rem',color:'var(--text2)',marginBottom:'.5rem'}}>Session User: {researchUser || '--'}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
        <div className="fg"><label>Risk Premium: {rp}%</label><input type="range" min="2" max="8" step="0.25" value={rp} onChange={e=>setRp(parseFloat(e.target.value))}/></div>
        <div className="fg"><label>Growth Rate: {gr}%</label><input type="range" min="0" max="5" step="0.25" value={gr} onChange={e=>setGr(parseFloat(e.target.value))}/></div>
        <div className="fg"><label>Rent Shock: {rs}%</label><input type="range" min="-20" max="20" step="1" value={rs} onChange={e=>setRs(parseFloat(e.target.value))}/></div>
      </div>
      <div className="rw-actions">
        <button className="btn btn-p" onClick={run} disabled={loading}>{loading?'Running...':'Run Scenario'}</button>
      </div>
      <div style={{marginTop:'.7rem',borderTop:'1px solid var(--line)',paddingTop:'.6rem'}}>
        <h4 style={{fontSize:'.78rem',marginBottom:'.45rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Saved Scenario Packs</h4>
        <div style={{display:'flex',gap:'.45rem',marginBottom:'.5rem'}}>
          <input type="text" value={packName} onChange={e=>setPackName(e.target.value)} placeholder="Pack name (e.g., High-Risk Upside)"/>
          <button className="btn btn-sm" onClick={savePack}>Save Pack</button>
        </div>
        {packsLoading ? <div style={{fontSize:'.75rem',color:'var(--text2)'}}>Loading saved packs...</div>
        : packs.length === 0 ? <div style={{fontSize:'.75rem',color:'var(--text2)'}}>No saved packs for selected county.</div>
        : packs.map(pack => <div className="pack-row" key={pack.id}>
          <div>
            <div style={{fontSize:'.76rem',fontWeight:600,marginBottom:'.16rem'}}>{pack.name}</div>
            <div style={{fontSize:'.72rem',color:'var(--text2)'}}>RP {pack.risk_premium}% | G {pack.growth_rate}% | Shock {pack.rent_shock}%</div>
          </div>
          <div style={{display:'flex',gap:'.35rem'}}>
            <button className="btn btn-sm" onClick={()=>loadPack(pack)}>Load</button>
            <button className="btn btn-sm btn-d" onClick={()=>deletePack(pack.id)}>Del</button>
          </div>
        </div>)}
      </div>
    </div>

    {base && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Fair Value</div><div className="sc-v">{$$(bm.fair_value)}</div></div>
        <div className="sc"><div className="sc-l">NOI / Acre</div><div className="sc-v">{$$(bm.noi_per_acre)}</div></div>
        <div className="sc"><div className="sc-l">Implied Cap Rate</div><div className="sc-v">{$pct(bm.implied_cap_rate)}</div></div>
        <div className="sc"><div className="sc-l">Cap Spread</div><div className="sc-v">{$(bm.cap_spread_to_10y,0)} bps</div></div>
      </div>
      {result.sensitivities && Object.keys(result.sensitivities).length > 0 && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Sensitivity Analysis</h3>
        {Object.entries(result.sensitivities).map(([param, values]) => <div key={param} style={{marginBottom:'1rem'}}>
          <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem',textTransform:'capitalize'}}>{param.replace(/_/g,' ')}</h4>
          <MiniBar items={values.map(v=>({label:String(v.input_value),value:v.fair_value||0}))} height={80}/>
        </div>)}
      </div>}
      {result.comparison_table && result.comparison_table.length > 0 && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Scenario Compare</h3>
        <div className="tc"><table>
          <thead><tr><th>Scenario</th><th>Fair Value</th><th>Cap Rate</th><th>NOI</th><th>Δ vs Base</th></tr></thead>
          <tbody>{result.comparison_table.map(row => <tr key={row.scenario}>
            <td>{row.scenario}</td>
            <td className="n">{$$(row.fair_value)}</td>
            <td className="n">{$pct(row.implied_cap_rate)}</td>
            <td className="n">{$$(row.noi_per_acre)}</td>
            <td className="n">{row.delta_fair_value_vs_base != null ? $$(row.delta_fair_value_vs_base) : 'N/A'}</td>
          </tr>)}</tbody>
        </table></div>
      </div>}
      {result.driver_decomposition && result.driver_decomposition.length > 0 && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Driver Decomposition</h3>
        {result.driver_decomposition.map(entry => <div key={entry.scenario} style={{marginBottom:'.8rem'}}>
          <div style={{fontSize:'.8rem',fontWeight:600,marginBottom:'.35rem'}}>{entry.scenario}</div>
          <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
            {(entry.drivers || []).map(driver => <span key={driver.driver} className="badge badge-a">{driver.driver}: {$(driver.delta,2)}</span>)}
            <span className="badge badge-b">Residual: {$(entry.residual,2)}</span>
          </div>
        </div>)}
      </div>}
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

// ═══════════════════════════════════════════════════════════════════
// PORTFOLIO
// ═══════════════════════════════════════════════════════════════════
function PortfolioPage({addToast}) {
  const [portfolios, setPortfolios] = React.useState([]);
  const [selId, setSelId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLd, setDetailLd] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  React.useEffect(() => {
    api('/portfolios').then(d=>{setPortfolios(d);if(d.length>0){setSelId(d[0].id);}}).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!selId) return;
    setDetailLd(true);
    api(`/portfolios/${selId}`).then(d=>setDetail(d)).catch(()=>{}).finally(()=>setDetailLd(false));
  }, [selId]);

  const createPortfolio = async () => {
    if (!newName.trim()) return;
    try {
      const p = await api('/portfolios', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName})});
      setPortfolios([...portfolios, {...p, holdings_count:0, total_acres:0}]);
      setSelId(p.id);
      setNewName('');
      addToast(toast('Portfolio created','ok'));
    } catch(e) { addToast(toast('Error creating portfolio','err')); }
  };

  if (loading) return <Loading/>;

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <h3 style={{fontSize:'1rem'}}>Portfolios</h3>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New portfolio name..." style={{width:'200px'}}/>
          <button className="btn btn-sm btn-p" onClick={createPortfolio}>Create</button>
        </div>
      </div>
      <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap'}}>
        {portfolios.map(p => <button key={p.id} className={`btn ${selId===p.id?'btn-p':''}`} onClick={()=>setSelId(p.id)}>
          {p.name} ({p.holdings_count || 0} holdings)
        </button>)}
      </div>
    </div>

    {detailLd && <Loading/>}

    {detail && !detailLd && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Total Acres</div><div className="sc-v">{Number(detail.total_acres||0).toLocaleString()}</div></div>
        <div className="sc"><div className="sc-l">Current Value</div><div className="sc-v">{$$(detail.total_current_value)}</div></div>
        <div className="sc"><div className="sc-l">Fair Value</div><div className="sc-v">{$$(detail.total_fair_value)}</div></div>
        <div className="sc"><div className="sc-l">Annual NOI</div><div className="sc-v">{$$(detail.total_annual_noi)}</div></div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Portfolio Yield</div><div className="sc-v">{$pct(detail.portfolio_yield_pct)}</div></div>
        <div className="sc"><div className="sc-l">Unrealized Gain</div><div className="sc-v" style={{color:detail.unrealized_gain>=0?'var(--green)':'var(--red)'}}>{$$(detail.unrealized_gain)} ({$chg(detail.unrealized_gain_pct)})</div></div>
        <div className="sc"><div className="sc-l">Diversification</div><div className="sc-v">{detail.diversification_rating}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>HHI: {detail.hhi} | {detail.num_states} states, {detail.num_counties} counties</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'1.5rem'}}>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>Holdings</h3>
          <STable
            cols={[
              {key:'county_name',label:'County'},
              {key:'state',label:'ST'},
              {key:'acres',label:'Acres',num:true},
              {key:'weight_pct',label:'Weight',num:true,fmt:v=>v+'%'},
              {key:'current_value_acre',label:'Curr $/ac',num:true,fmt:v=>$$(v)},
              {key:'fair_value_acre',label:'FV $/ac',num:true,fmt:v=>$$(v)},
              {key:'noi_acre',label:'NOI/ac',num:true,fmt:v=>$$(v)},
              {key:'implied_cap',label:'Cap',num:true,fmt:v=>$pct(v)},
              {key:'unrealized_gain_pct',label:'Gain',num:true,fmt:v=><span className={v>=0?'pos':'neg'}>{$chg(v)}</span>},
            ]}
            rows={detail.holdings||[]}
          />
        </div>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>State Exposure</h3>
          {detail.state_exposure && <div>
            {Object.entries(detail.state_exposure).sort((a,b)=>b[1]-a[1]).map(([st,pct])=><div key={st} style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
              <span style={{width:'30px',fontWeight:600,fontSize:'.85rem'}}>{st}</span>
              <div style={{flex:1,background:'var(--bg2)',height:'20px',overflow:'hidden'}}>
                <div style={{width:`${pct}%`,height:'100%',background:'var(--accent-2)',transition:'width .3s'}}></div>
              </div>
              <span style={{fontSize:'.8rem',fontFamily:"'IBM Plex Mono',monospace",color:'var(--text2)',width:'45px',textAlign:'right'}}>{pct}%</span>
            </div>)}
          </div>}
          <div style={{marginTop:'1rem'}}>
            <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem'}}>Weighted Metrics</h4>
            {detail.weighted_metrics && <div style={{fontSize:'.8rem'}}>
              {Object.entries(detail.weighted_metrics).slice(0,6).map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'.25rem 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text2)',textTransform:'capitalize'}}>{k.replace(/_/g,' ')}</span>
                <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{$(v,2)}</span>
              </div>)}
            </div>}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// SCREENS MANAGER
// ═══════════════════════════════════════════════════════════════════
function ScreensMgr({addToast}) {
  const [screens, setScreens] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { api('/screens').then(d=>setScreens(d)).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  if (loading) return <Loading/>;
  return <div className="card">
    <h3 style={{fontSize:'1rem',marginBottom:'1rem'}}>Saved Screens</h3>
    {screens.length === 0 ? <div className="empty"><p>No screens saved. Create one from the Screener page.</p></div>
     : <div style={{display:'grid',gap:'.75rem'}}>
        {screens.map(s => <div key={s.id} className="sc">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontWeight:600,marginBottom:'.125rem'}}>{s.name}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>v{s.version} | {(s.filters||[]).length} filters</div></div>
            <span className="badge badge-b">ID: {s.id}</span>
          </div>
          {s.filters && s.filters.length > 0 && <div style={{marginTop:'.5rem',fontSize:'.8rem',color:'var(--text2)'}}>
            {s.filters.map((f,i) => <span key={i} className="badge badge-a" style={{marginRight:'.375rem'}}>{f.metric} {f.op} {f.value}</span>)}
          </div>}
        </div>)}
      </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ASSUMPTIONS MANAGER
// ═══════════════════════════════════════════════════════════════════
function AssumptionsMgr({addToast}) {
  const [sets, setSets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { api('/assumptions').then(d=>setSets(d)).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  if (loading) return <Loading/>;
  return <div className="card">
    <h3 style={{fontSize:'1rem',marginBottom:'1rem'}}>Assumption Sets</h3>
    {sets.length === 0 ? <div className="empty"><p>No assumption sets defined</p></div>
     : <div style={{display:'grid',gap:'.75rem'}}>
        {sets.map(s => <div key={s.id} className="sc">
          <div style={{fontWeight:600,marginBottom:'.25rem'}}>{s.name} <span className="badge badge-b">v{s.version}</span></div>
          {s.params && <div style={{fontSize:'.8rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
            {Object.entries(s.params).map(([k,v])=><div key={k}>{k}: {typeof v==='number'?v.toFixed(4):String(v)}</div>)}
          </div>}
        </div>)}
      </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// DATA SOURCES
// ═══════════════════════════════════════════════════════════════════
function SourcesPage({addToast}) {
  const [sources, setSources] = React.useState([]);
  const [metrics, setMetrics] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    Promise.all([api('/sources'), api('/metrics')])
      .then(([s,m]) => { setSources(s); setMetrics(m); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);
  if (loading) return <Loading/>;
  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Data Sources</h3>
      <STable
        cols={[
          {key:'name',label:'Source'},
          {key:'cadence',label:'Cadence'},
          {key:'url',label:'URL',fmt:v=>v?<span style={{fontSize:'.75rem',color:'var(--accent)'}}>{v}</span>:'--'},
          {key:'notes',label:'Notes',fmt:v=>v||'--'},
        ]}
        rows={sources}
      />
    </div>
    <div className="card">
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Metric Catalog ({metrics.length} metrics)</h3>
      <div style={{display:'grid',gap:'.5rem'}}>
        {metrics.map(m => <div key={m.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.625rem',background:'var(--bg2)'}}>
          <div><div style={{fontWeight:500,fontSize:'.85rem'}}>{m.label}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>{m.description}</div></div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <span className="badge badge-b">{m.unit||'--'}</span>
            {m.category && <span className="badge badge-a" style={{marginLeft:'.375rem'}}>{m.category}</span>}
          </div>
        </div>)}
      </div>
    </div>
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
