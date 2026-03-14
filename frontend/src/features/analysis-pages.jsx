import { PG } from '../config.js';
import {
  $,
  $$,
  $chg,
  $pct,
  benchmarkMethodBand,
  droughtRiskBand,
  productivityBand,
  sourceBand,
  toast,
} from '../formatting.js';
import { api } from '../auth.js';
import { appendAssumptionParam, AssumptionContextBar, assumptionSetLabel } from '../shared/assumptions-ui.jsx';
import { ErrBox, Loading } from '../shared/system.jsx';
import { CountyPicker, STable } from '../shared/data-ui.jsx';

export function Watchlist({addToast, nav}) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    api('/watchlist')
      .then(d => setItems(d.items || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  React.useEffect(load, []);

  const remove = async (fips) => {
    try {
      await api(`/watchlist/${fips}`, {method:'DELETE'});
      setItems(items.filter(w => w.fips !== fips));
      addToast(toast('Removed', 'ok'));
    } catch (e) {
      addToast(toast('Error', 'err'));
    }
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
        return <div key={w.fips} className="sc" style={{cursor:'pointer'}} onClick={() => nav(PG.COUNTY, {fips:w.fips})}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:600,marginBottom:'.25rem'}}>{w.county}, {w.state}</div>
              <div style={{fontSize:'.8rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
                Cap: {$pct(m.implied_cap_rate)} | Rent: {$$(m.cash_rent)} | FV: {$$(m.fair_value)} | Access: {$(m.access_score,1)}
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{display:'flex',gap:'.375rem',justifyContent:'flex-end',flexWrap:'wrap',marginBottom:'.375rem'}}>
                {ch.cash_rent != null && <span className={`badge ${ch.cash_rent >= 0 ? 'badge-g' : 'badge-r'}`}>Rent {$chg(ch.cash_rent)}</span>}
                {ch.benchmark_value != null && <span className={`badge ${ch.benchmark_value >= 0 ? 'badge-g' : 'badge-r'}`}>Val {$chg(ch.benchmark_value)}</span>}
              </div>
              <button className="btn btn-sm btn-d" onClick={e => { e.stopPropagation(); remove(w.fips); }}>Remove</button>
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

export function Comparison({addToast, params, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId}) {
  const [selected, setSelected] = React.useState(params?.fips ? [params.fips] : []);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const compare = () => {
    if (selected.filter(Boolean).length < 2) {
      addToast(toast('Select at least 2 counties', 'err'));
      return;
    }
    setLoading(true);
    api(appendAssumptionParam(`/compare?fips=${selected.filter(Boolean).join(',')}`, activeAssumptionSetId))
      .then(d => setData(d))
      .catch(() => addToast(toast('Comparison failed', 'err')))
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    if (selected.filter(Boolean).length >= 2) compare();
  }, [activeAssumptionSetId]);

  const metricRows = [
    {key:'cash_rent',label:'Cash Rent ($/ac)',fmt:v => $$(v)},
    {key:'benchmark_value',label:'Benchmark Value ($/ac)',fmt:v => $$(v)},
    {key:'noi_per_acre',label:'NOI ($/ac)',fmt:v => $$(v)},
    {key:'implied_cap_rate',label:'Implied Cap Rate',fmt:v => $pct(v)},
    {key:'fair_value',label:'Fair Value ($/ac)',fmt:v => $$(v)},
    {key:'rent_multiple',label:'Rent Multiple',fmt:v => $(v,1) + 'x'},
    {key:'required_return',label:'Required Return',fmt:v => $pct(v)},
    {key:'cap_spread_to_10y',label:'Cap Spread (bps)',fmt:v => $(v,0)},
    {key:'access_score',label:'Access Score',fmt:v => $(v,1)},
    {key:'dscr',label:'DSCR',fmt:v => $(v,2)},
    {key:'payback_period',label:'Payback (yrs)',fmt:v => $(v,1)},
  ];
  const underwriteRows = [
    {label:'Unlevered IRR',fmt:c => $pct(c.acquisition?.irr_pct)},
    {label:'Levered IRR',fmt:c => $pct(c.acquisition?.levered_irr_pct)},
    {label:'Year 1 Cash-on-Cash',fmt:c => $pct(c.acquisition?.year1_cash_on_cash_yield_pct)},
    {label:'Equity Check',fmt:c => $$(c.acquisition?.equity_check_total)},
    {label:'Deal Leverage',fmt:c => c.acquisition?.ltv_pct != null ? `${$(c.acquisition.ltv_pct,1)}%` : '--'},
    {label:'Combined Stress DSCR',fmt:c => c.credit?.combined_stress_dscr != null ? `${$(c.credit.combined_stress_dscr,2)}x` : '--'},
  ];

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Comparison Assumptions"
      description="Every county in this comparison uses the same active assumption set so spreads and fair values stay comparable."
    />
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Select Counties to Compare (up to 6)</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'.75rem',marginBottom:'1rem'}}>
        {[0,1,2,3,4,5].map(i => <CountyPicker key={i} value={selected[i] || ''} onChange={f => { const u=[...selected]; u[i]=f; setSelected(u.filter(Boolean)); }} placeholder={`County ${i+1}`}/>)}
      </div>
      <button className="btn btn-p" onClick={compare} disabled={loading || selected.filter(Boolean).length < 2}>{loading ? 'Loading...' : 'Compare'}</button>
    </div>

    {data && data.counties && data.counties.length > 0 && <div className="card">
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Side-by-Side Comparison</h3>
      <div style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.7rem',maxWidth:'920px'}}>
        Atlas is comparing the same modeled metric stack across each county using the active assumption set. Benchmark basis and source quality are shown explicitly so proxy counties do not look equivalent to county-observed benchmarks.
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${data.counties.length}, minmax(180px, 1fr))`,gap:'.65rem',marginBottom:'.85rem'}}>
        {data.counties.map(c => {
          const sourceBadge = sourceBand(c.source_quality);
          const basisBadge = benchmarkMethodBand(c.benchmark_method);
          const prodBadge = productivityBand(c.productivity_active);
          const droughtBadge = droughtRiskBand(c.drought);
          return <div key={c.geo_key} className="sc">
            <div className="sc-l">County</div>
            <div className="sc-v" style={{fontSize:'.95rem'}}>{c.county_name}, {c.state}</div>
            <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',marginBottom:'.45rem'}}>
              <span className={`badge ${sourceBadge.className}`} title={c.source_quality_detail || 'Source quality detail unavailable.'}>{sourceBadge.label}</span>
              <span className={`badge ${basisBadge.className}`} title={c.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{basisBadge.label}</span>
              <span className={`badge ${prodBadge.className}`} title={c.yield_productivity_detail || 'Productivity detail unavailable.'}>{prodBadge.label}</span>
              <span className={`badge ${droughtBadge.className}`} title={c.drought?.summary || 'FEMA drought evidence unavailable.'}>{droughtBadge.label}</span>
            </div>
            <div style={{fontSize:'.76rem',color:'var(--text2)',lineHeight:1.35}}>
              {c.benchmark_method_detail || 'Benchmark method detail unavailable.'}
            </div>
          </div>;
        })}
      </div>
      <div className="tc tc-sticky"><table>
        <thead><tr><th>Metric</th>{data.counties.map(c => <th key={c.geo_key}>{c.county_name}, {c.state}</th>)}</tr></thead>
        <tbody>{metricRows.map(mr => <tr key={mr.key}>
          <td style={{fontWeight:500}}>{mr.label}</td>
          {data.counties.map(c => <td key={c.geo_key} className="n">{mr.fmt(c.metrics?.[mr.key])}</td>)}
        </tr>)}</tbody>
      </table></div>
      <div style={{marginTop:'.9rem'}}>
        <h4 style={{fontSize:'.82rem',marginBottom:'.45rem',color:'var(--text2)',letterSpacing:'.12em',textTransform:'uppercase'}}>Default Underwrite</h4>
        <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.55rem',maxWidth:'920px'}}>
          Atlas is showing the default deal view for each county using the active assumption set and county benchmark entry basis unless a county has missing core underwriting inputs.
        </div>
        <div className="tc tc-sticky"><table>
          <thead><tr><th>Metric</th>{data.counties.map(c => <th key={`${c.geo_key}-uw`}>{c.county_name}, {c.state}</th>)}</tr></thead>
          <tbody>{underwriteRows.map(row => <tr key={row.label}>
            <td style={{fontWeight:500}}>{row.label}</td>
            {data.counties.map(c => <td key={`${c.geo_key}-${row.label}`} className="n">{row.fmt(c)}</td>)}
          </tr>)}</tbody>
        </table></div>
      </div>
    </div>}
  </div>;
}

export function Backtest({addToast, nav, params, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId}) {
  const [screens, setScreens] = React.useState([]);
  const [selScreen, setSelScreen] = React.useState(params?.screen_id ? String(params.screen_id) : '');
  const [startYear, setStartYear] = React.useState(params?.start_year || '2018');
  const [evalYears, setEvalYears] = React.useState(params?.eval_years ? Number(params.eval_years) : 3);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const autoRunRef = React.useRef('');

  React.useEffect(() => {
    api('/screens').then(d => setScreens(d)).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (params?.screen_id) setSelScreen(String(params.screen_id));
    if (params?.start_year) setStartYear(String(params.start_year));
    if (params?.eval_years) setEvalYears(Number(params.eval_years));
  }, [params?.eval_years, params?.screen_id, params?.start_year]);

  const run = async (screenOverride = selScreen) => {
    if (!screenOverride) {
      addToast(toast('Select a screen', 'err'));
      return;
    }
    setLoading(true);
    try {
      const d = await api('/run/backtest', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          screen_id: parseInt(screenOverride),
          start_year: startYear,
          eval_years: evalYears,
          assumption_set_id: activeAssumptionSetId ? Number(activeAssumptionSetId) : undefined,
        }),
      });
      setResult(d);
    } catch (e) {
      addToast(toast('Backtest failed', 'err'));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const key = params?.autorun && params?.screen_id ? `${params.screen_id}:${startYear}:${evalYears}` : '';
    if (!key || autoRunRef.current === key) return;
    autoRunRef.current = key;
    run(String(params.screen_id));
  }, [evalYears, params?.autorun, params?.screen_id, startYear]);

  const activeScreen = screens.find((screen) => String(screen.id) === String(selScreen));
  const workflowSourceLabel = params?.sourcePage === 'screener'
    ? 'Screener'
    : params?.sourcePage === 'screens_mgr'
      ? 'Saved Screens'
      : '';

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Backtest Assumptions"
      description="Backtest replay uses this saved assumption set for modeled valuation and return outputs."
    />
    {selScreen && <div className="card" style={{marginBottom:'.7rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>Backtest Context</div>
          <div style={{fontSize:'1rem',fontWeight:600,marginBottom:'.2rem'}}>{params?.screen_name || activeScreen?.name || `Screen ${selScreen}`}</div>
          <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
            {workflowSourceLabel ? `Opened from ${workflowSourceLabel}. ` : ''}Backtest replays the saved reusable screen filters against historical county data.
          </div>
        </div>
        <div style={{display:'flex',gap:'.45rem',flexWrap:'wrap'}}>
          <button className="btn btn-sm" onClick={() => nav(PG.SCREEN)}>Open Screener</button>
          <button className="btn btn-sm" onClick={() => nav(PG.SCREENS_MGR, {screen_id: selScreen})}>Saved Screens</button>
        </div>
      </div>
    </div>}
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Backtest Configuration</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.75rem'}}>
        <div className="fg"><label>Screen</label>
          <select value={selScreen} onChange={e => setSelScreen(e.target.value)}>
            <option value="">Select...</option>
            {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="fg"><label>Start Year</label><input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} min="2015" max="2024"/></div>
        <div className="fg"><label>Eval Years</label><input type="number" value={evalYears} onChange={e => setEvalYears(parseInt(e.target.value))} min="1" max="7"/></div>
      </div>
      <button className="btn btn-p" onClick={run} disabled={loading}>{loading ? 'Running...' : 'Run Backtest'}</button>
    </div>

    {result && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Screen</div><div className="sc-v" style={{fontSize:'1rem'}}>{result.screen?.name}</div></div>
        <div className="sc"><div className="sc-l">Counties Screened</div><div className="sc-v">{result.counties_screened}</div></div>
        <div className="sc"><div className="sc-l">Counties Flagged</div><div className="sc-v">{result.counties_flagged}</div></div>
        <div className="sc"><div className="sc-l">Period</div><div className="sc-v" style={{fontSize:'1rem'}}>{result.start_year} + {result.eval_years}yr</div></div>
        <div className="sc"><div className="sc-l">Assumption Set</div><div className="sc-v" style={{fontSize:'1rem'}}>{assumptionSetLabel(activeAssumptionSet)}</div></div>
      </div>
      <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>Backtest Results</h3>
        <STable
          cols={[
            {key:'county',label:'County'},
            {key:'state',label:'ST'},
            {key:'value_change_pct',label:'Value Chg',num:true,fmt:v => <span className={v >= 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
            {key:'rent_change_pct',label:'Rent Chg',num:true,fmt:v => <span className={v >= 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
            {key:'total_return_est',label:'Est Return',num:true,fmt:v => <span className={v >= 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
          ]}
          rows={result.results || []}
          initSort={['total_return_est','desc']}
          onRow={r => nav(PG.COUNTY, {fips:r.fips})}
        />
      </div>
    </div>}
  </div>;
}
