import { PG } from '../config.js';
import {
  $,
  $$,
  $pct,
  $x,
  industrialConfidenceBand,
  productivityBand,
  sourceBand,
  sourceText,
  toast,
  zBand,
} from '../formatting.js';
import { api } from '../auth.js';
import { ErrBox, Loading } from '../shared/system.jsx';
import { MiniBar, Spark } from '../shared/data-ui.jsx';

export function CountyPage({addToast, params, nav}) {
  const [data, setData] = React.useState(null);
  const [industrial, setIndustrial] = React.useState(null);
  const [ts, setTs] = React.useState([]);
  const [tsBands, setTsBands] = React.useState({});
  const [notes, setNotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [tab, setTab] = React.useState('overview');
  const [newNote, setNewNote] = React.useState('');
  const [watched, setWatched] = React.useState(false);
  const [sens, setSens] = React.useState(null);

  const load = () => {
    if (!params.fips) return;
    setLoading(true);
    setErr(null);
    Promise.all([
      api(`/geo/${params.fips}/summary`),
      api(`/geo/${params.fips}/timeseries?metrics=cash_rent,benchmark_value,implied_cap_rate,fair_value,noi_per_acre`),
      api(`/notes/${params.fips}`),
      api('/watchlist').then(wl => (wl.items || []).some(w => w.fips === params.fips)),
      api(`/industrial/scorecard/${params.fips}`).catch(() => null),
    ]).then(([d, t, n, w, i]) => {
      setData(d);
      setIndustrial(i);
      setTs(Array.isArray(t) ? t : (t.series || []));
      setTsBands(t?.bands || {});
      setNotes(n);
      setWatched(w);
    }).catch(e => setErr(e.message)).finally(() => setLoading(false));
  };
  React.useEffect(load, [params.fips]);

  const toggleWatch = async () => {
    try {
      if (watched) {
        await api(`/watchlist/${params.fips}`, {method:'DELETE'});
        setWatched(false);
        addToast(toast('Removed from watchlist','ok'));
      } else {
        await api('/watchlist', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geo_key:params.fips})});
        setWatched(true);
        addToast(toast('Added to watchlist','ok'));
      }
    } catch (e) {
      addToast(toast('Error updating watchlist','err'));
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      const n = await api(`/notes/${params.fips}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:newNote})});
      setNotes([n, ...notes]);
      setNewNote('');
      addToast(toast('Note saved','ok'));
    } catch (e) {
      addToast(toast('Error saving note','err'));
    }
  };

  const delNote = async (id) => {
    try {
      await api(`/notes/${id}`, {method:'DELETE'});
      setNotes(notes.filter(n => n.id !== id));
      addToast(toast('Note deleted','ok'));
    } catch (e) {
      addToast(toast('Error deleting note','err'));
    }
  };

  const loadSens = async () => {
    if (sens) return;
    try {
      const s = await api(`/geo/${params.fips}/sensitivity`);
      setSens(s);
    } catch (e) {
      addToast(toast('Error loading sensitivity','err'));
    }
  };

  if (loading) return <Loading/>;
  if (err || !data) return <ErrBox title="County Error" msg={err || 'Not found'} onRetry={load}/>;

  const m = data.metrics || {};
  const rentHist = ts.map(t => t.cash_rent).filter(v => v != null);
  const valHist = ts.map(t => t.benchmark_value).filter(v => v != null);
  const capHist = ts.map(t => t.implied_cap_rate).filter(v => v != null);
  const fvHist = ts.map(t => t.fair_value).filter(v => v != null);
  const zscores = data.zscores || {};
  const countyProductivity = productivityBand(data.productivity_active);
  const industrialConfidence = industrialConfidenceBand(industrial?.confidence);
  const workflowParams = {
    fips: data.geo_key,
    countyName: data.county_name,
    state: data.state,
    sourcePage: 'county',
    assetType: 'agriculture_land',
    targetUseCase: 'farmland_investment',
  };
  const fairValue = m.fair_value;
  const benchmarkValue = m.benchmark_value;
  const valueSpreadPct = fairValue != null && benchmarkValue != null && benchmarkValue > 0
    ? ((fairValue - benchmarkValue) / benchmarkValue) * 100
    : null;
  const valueSignal = valueSpreadPct == null
    ? { label: 'INSUFFICIENT', className: 'badge-a', summary: 'Atlas does not yet have enough fully modeled context to express a valuation read here.' }
    : valueSpreadPct >= 10
      ? { label: 'UNDERVALUED', className: 'badge-g', summary: 'Model fair value is materially above observed benchmark value.' }
      : valueSpreadPct <= -10
        ? { label: 'OVERVALUED', className: 'badge-r', summary: 'Observed benchmark value is running ahead of model fair value.' }
        : { label: 'NEAR FAIR', className: 'badge-a', summary: 'Model fair value and observed benchmark value are broadly aligned.' };
  const underwritingStatus = m.implied_cap_rate != null && m.noi_per_acre != null && m.access_score != null
    ? { label: 'RESEARCH-READY', className: 'badge-g', summary: 'Core underwriting fields are populated for this county.' }
    : data.source_quality === 'proxy'
      ? { label: 'TRIAGE-ONLY', className: 'badge-b', summary: 'This county is still useful for triage, but some underwriting fields are proxy-backed or missing.' }
      : { label: 'PARTIAL', className: 'badge-a', summary: 'Some core underwriting fields remain incomplete and need extra diligence.' };
  const nextAction = data.source_quality === 'proxy'
    ? 'Use Scenario Lab to pressure test the thesis, then confirm the county belongs in research despite proxy-driven inputs.'
    : 'Move this county into Research Workspace, record the thesis, and run a downside scenario before presenting it.';

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
      <div>
        <h2 style={{fontSize:'1.35rem',marginBottom:'.25rem'}}>{data.county_name}, {data.state}</h2>
        <div style={{color:'var(--text2)',fontSize:'.8rem'}}>FIPS: {data.geo_key} | As of: {data.as_of}</div>
      </div>
      <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'flex-end'}}>
        <button className={`btn ${watched?'btn-p':''}`} onClick={toggleWatch}>{watched?'★ Watching':'☆ Watch'}</button>
        <button className="btn" onClick={() => nav(PG.RESEARCH, workflowParams)}>Research</button>
        <button className="btn" onClick={() => nav(PG.SCENARIO, workflowParams)}>Scenario</button>
        <button className="btn" onClick={() => nav(PG.COMPARE,{fips:data.geo_key})}>Compare</button>
      </div>
    </div>

    <div className="card" style={{marginBottom:'1rem'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:'.75rem',alignItems:'stretch'}}>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Analyst Summary</div>
          <div className="sc-v" style={{fontSize:'1rem',marginBottom:'.35rem'}}>{valueSpreadPct != null ? $chg(valueSpreadPct) : 'N/A'} vs market</div>
          <div className="sc-c">{valueSignal.summary}</div>
          <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',marginTop:'.55rem'}}>
            <span className={`badge ${valueSignal.className}`}>{valueSignal.label}</span>
            <span className={`badge ${underwritingStatus.className}`}>{underwritingStatus.label}</span>
            <span className={`badge ${sourceBand(data.source_quality).className}`}>{sourceBand(data.source_quality).label}</span>
          </div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Model Basis</div>
          <div className="sc-v" style={{fontSize:'.95rem'}}>{data.benchmark_method === 'rent_multiple_proxy' ? 'RENT MULTIPLE PROXY' : 'DIRECT BENCHMARK'}</div>
          <div className="sc-c">{data.benchmark_method_detail || data.source_quality_detail || 'Benchmark method detail unavailable.'}</div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Next Best Action</div>
          <div className="sc-v" style={{fontSize:'.95rem'}}>{underwritingStatus.label}</div>
          <div className="sc-c">{nextAction}</div>
        </div>
      </div>
    </div>

    <div className="sg">
      <div className="sc">
        <div className="sc-l">Cash Rent</div>
        <div className="sc-v">{$$(m.cash_rent)}</div>
        <span className={`badge ${zBand(zscores.cash_rent).className}`}>{zBand(zscores.cash_rent).label}</span>
        <Spark data={rentHist}/>
      </div>
      <div className="sc">
        <div className="sc-l">Land Value</div>
        <div className="sc-v">{$$(m.benchmark_value)}</div>
        <span className={`badge ${zBand(zscores.benchmark_value).className}`}>{zBand(zscores.benchmark_value).label}</span>
        <Spark data={valHist} color="#63d2ff"/>
      </div>
      <div className="sc">
        <div className="sc-l">Fair Value</div>
        <div className="sc-v">{$$(m.fair_value)}</div>
        <span className={`badge ${zBand(zscores.fair_value).className}`}>{zBand(zscores.fair_value).label}</span>
        <Spark data={fvHist} color="#ffb100"/>
      </div>
      <div className="sc">
        <div className="sc-l">Implied Cap Rate</div>
        <div className="sc-v">{$pct(m.implied_cap_rate)}</div>
        <span className={`badge ${zBand(zscores.implied_cap_rate).className}`}>{zBand(zscores.implied_cap_rate).label}</span>
        <Spark data={capHist} color="#f25f1e"/>
      </div>
    </div>
    <div className="sg">
      <div className="sc">
        <div className="sc-l">Data Quality</div>
        <div className="sc-v" style={{fontSize:'.95rem'}}>{sourceBand(data.source_quality).label}</div>
        <div className="sc-c">{data.source_quality_detail || 'Valuation input lineage unavailable'}</div>
      </div>
      <div className="sc">
        <div className="sc-l">Productivity Adj.</div>
        <div className="sc-v" style={{fontSize:'.95rem'}}>{countyProductivity.label}</div>
        <div className="sc-c">{data.productivity_active ? (data.yield_productivity_detail || 'County yield differentiation is active in fair value.') : 'Inactive for selected year; fair value is using the base model without county yield adjustment.'}</div>
      </div>
      <div className="sc"><div className="sc-l">NOI / Acre</div><div className="sc-v">{$$(m.noi_per_acre)}</div></div>
      <div className="sc"><div className="sc-l">Rent Multiple</div><div className="sc-v">{$(m.rent_multiple,1)}x</div></div>
      <div className="sc"><div className="sc-l">DSCR</div><div className="sc-v">{$(m.dscr,2)}</div></div>
      <div className="sc"><div className="sc-l">Access Score</div><div className="sc-v">{$(m.access_score,1)}</div></div>
      <div className="sc">
        <div className="sc-l">Data Center Suitability</div>
        <div className="sc-v">{industrial?.overall_score != null ? `${$(industrial.overall_score,0)}/100` : 'PENDING'}</div>
        <span className={`badge ${industrialConfidence.className}`}>{industrialConfidence.label}</span>
        <div className="sc-c">{industrial?.summary || 'Industrial evidence stack not loaded yet for this county.'}</div>
      </div>
    </div>

    <div className="card">
      <div className="tabs">
        {['Overview','History','Industrial','Access','Sensitivity','Notes'].map(t => <button key={t} className={`tab ${tab===t.toLowerCase()?'act':''}`} onClick={() => { setTab(t.toLowerCase()); if (t === 'Sensitivity') loadSens(); }}>{t}</button>)}
      </div>

      {tab === 'overview' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Valuation Summary</h3>
        <div className="tc"><table>
          <thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>Cash Rent ($/ac)</td><td className="n">{$$(m.cash_rent)}</td><td style={{fontSize:'.8rem'}}>USDA NASS • {sourceText(data.input_lineage?.cash_rent)}</td></tr>
            <tr><td>Operating Cost Ratio</td><td className="n">{$pct(m.operating_cost_ratio)}</td><td style={{fontSize:'.8rem'}}>Cost as % of rent</td></tr>
            <tr><td>NOI per Acre</td><td className="n">{$$(m.noi_per_acre)}</td><td style={{fontSize:'.8rem'}}>Net operating income</td></tr>
            <tr><td>Benchmark Value ($/ac)</td><td className="n">{$$(m.benchmark_value)}</td><td style={{fontSize:'.8rem'}}>{data.benchmark_method_detail || `USDA NASS land value • ${sourceText(data.input_lineage?.land_value)}`}</td></tr>
            <tr><td>Productivity Adjustment</td><td className="n">{countyProductivity.label}</td><td style={{fontSize:'.8rem'}}>{data.productivity_active ? (data.yield_productivity_detail || 'County yield differentiation is active in fair value.') : 'Inactive for selected year; fair value is using the base model without county yield adjustment.'}</td></tr>
            <tr><td>Yield Basis vs State</td><td className="n">{$x(m.yield_basis_ratio)}</td><td style={{fontSize:'.8rem'}}>{data.yield_productivity_detail || 'No county yield basis available'}</td></tr>
            <tr><td>Yield Productivity Factor</td><td className="n">{$x(m.yield_productivity_factor)}</td><td style={{fontSize:'.8rem'}}>{data.productivity_active ? 'Applied inside fair value model using county yield basis.' : 'Inactive: no county yield basis was available for the selected year.'}</td></tr>
            <tr><td>Implied Cap Rate</td><td className="n">{$pct(m.implied_cap_rate)}</td><td style={{fontSize:'.8rem'}}>NOI / Land Value</td></tr>
            <tr><td>Required Return</td><td className="n">{$pct(m.required_return)}</td><td style={{fontSize:'.8rem'}}>10Y + risk premium</td></tr>
            <tr><td>Fair Value (Gordon)</td><td className="n">{$$(m.fair_value)}</td><td style={{fontSize:'.8rem'}}>NOI(1+g)/(r-g)</td></tr>
            <tr><td>Rent Multiple</td><td className="n">{$(m.rent_multiple,1)}x</td><td style={{fontSize:'.8rem'}}>Land Value / Rent</td></tr>
            <tr><td>Cap Spread to 10Y (bps)</td><td className="n">{$(m.cap_spread_to_10y,0)}</td><td style={{fontSize:'.8rem'}}>Cap rate - Treasury</td></tr>
            <tr><td>DSCR</td><td className="n">{$(m.dscr,2)}</td><td style={{fontSize:'.8rem'}}>NOI / Debt Service</td></tr>
            <tr><td>Payback Period (yrs)</td><td className="n">{$(m.payback_period,1)}</td><td style={{fontSize:'.8rem'}}>Value / NOI</td></tr>
          </tbody>
        </table></div>
      </div>}

      {tab === 'history' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Time Series ({ts[0]?.year || '--'}-{ts[ts.length-1]?.year || '--'})</h3>
        <div className="tc"><table>
          <thead><tr><th>Year</th><th>Cash Rent</th><th>Land Value</th><th>Cap Rate</th><th>Fair Value</th><th>NOI</th></tr></thead>
          <tbody>{ts.map(t => <tr key={t.year}>
            <td>{t.year}</td><td className="n">{$$(t.cash_rent)}</td><td className="n">{$$(t.benchmark_value)}</td>
            <td className="n">{$pct(t.implied_cap_rate)}</td><td className="n">{$$(t.fair_value)}</td><td className="n">{$$(t.noi_per_acre)}</td>
          </tr>)}</tbody>
        </table></div>
        {Object.keys(tsBands || {}).length > 0 && <div style={{marginTop:'1rem'}}>
          <h4 style={{fontSize:'.82rem',marginBottom:'.45rem',color:'var(--text2)'}}>Sigma Bands</h4>
          <div className="tc"><table>
            <thead><tr><th>Metric</th><th>Mean</th><th>±1σ</th><th>±2σ</th></tr></thead>
            <tbody>{Object.entries(tsBands).map(([metric, band]) => <tr key={metric}>
              <td>{metric}</td>
              <td className="n">{$(band.mean,2)}</td>
              <td className="n">{$(band.minus_1sigma,2)} to {$(band.plus_1sigma,2)}</td>
              <td className="n">{$(band.minus_2sigma,2)} to {$(band.plus_2sigma,2)}</td>
            </tr>)}</tbody>
          </table></div>
        </div>}
      </div>}

      {tab === 'industrial' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Data Center Site Suitability</h3>
        {!industrial ? <div className="empty"><p>Industrial scorecard unavailable</p></div> : <div>
          <div className="sg" style={{marginBottom:'.75rem'}}>
            <div className="sc">
              <div className="sc-l">Overall Score</div>
              <div className="sc-v">{industrial.overall_score != null ? `${$(industrial.overall_score,0)}/100` : 'N/A'}</div>
              <span className={`badge ${industrialConfidence.className}`}>{industrialConfidence.label}</span>
              <div className="sc-c">{industrial.summary}</div>
            </div>
            <div className="sc">
              <div className="sc-l">Use Case</div>
              <div className="sc-v" style={{fontSize:'.95rem'}}>{industrial.use_case === 'data_center' ? 'DATA CENTER' : (industrial.use_case || 'N/A').toUpperCase()}</div>
              <div className="sc-c">County-first industrial research lane inside Atlas.</div>
            </div>
          </div>
          <div className="tc"><table>
            <thead><tr><th>Component</th><th>Score</th><th>Lineage</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>{Object.values(industrial.components || {}).map(component => <tr key={component.key}>
              <td>{component.label}</td>
              <td className="n">{component.score != null ? $(component.score,0) : 'N/A'}</td>
              <td>{(component.lineage || 'missing').toUpperCase()}</td>
              <td>{(component.status || 'missing').toUpperCase()}</td>
              <td style={{fontSize:'.8rem'}}>{component.missing_fields?.length ? `Missing: ${component.missing_fields.join(', ')}` : component.explanation}</td>
            </tr>)}</tbody>
          </table></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.7rem',marginTop:'.75rem'}}>
            <div className="card" style={{margin:0}}>
              <h4 style={{fontSize:'.82rem',marginBottom:'.5rem'}}>Disqualifiers</h4>
              {industrial.disqualifiers?.length ? industrial.disqualifiers.map((item, idx) => <div key={idx} style={{fontSize:'.8rem',marginBottom:'.3rem'}}>{item}</div>) : <div className="empty"><p>No active disqualifiers surfaced</p></div>}
            </div>
            <div className="card" style={{margin:0}}>
              <h4 style={{fontSize:'.82rem',marginBottom:'.5rem'}}>Missing Critical Data</h4>
              {industrial.missing_critical_data?.length ? industrial.missing_critical_data.map((item, idx) => <div key={idx} style={{fontSize:'.8rem',marginBottom:'.3rem'}}>{item}</div>) : <div className="empty"><p>No major evidence gaps flagged</p></div>}
            </div>
          </div>
        </div>}
      </div>}

      {tab === 'access' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Infrastructure Access</h3>
        <div className="sc-v" style={{marginBottom:'.75rem'}}>Score: {$(m.access_score,1)} / 100</div>
        {data.access_details && Object.keys(data.access_details).length > 0 && <div className="tc"><table>
          <thead><tr><th>Facility Type</th><th>Nearest (mi)</th></tr></thead>
          <tbody>{Object.entries(data.access_details).map(([k,v]) => <tr key={k}><td style={{textTransform:'capitalize'}}>{k.replace(/_/g,' ')}</td><td className="n">{$(v,1)}</td></tr>)}</tbody>
        </table></div>}
        {data.access_density && Object.keys(data.access_density).length > 0 && <div style={{marginTop:'1rem'}}>
          <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.5rem'}}>Density (within 50mi radius)</h4>
          <div className="tc"><table>
            <thead><tr><th>Type</th><th>Count</th></tr></thead>
            <tbody>{Object.entries(data.access_density).map(([k,v]) => <tr key={k}><td style={{textTransform:'capitalize'}}>{k.replace(/_/g,' ')}</td><td className="n">{v}</td></tr>)}</tbody>
          </table></div>
        </div>}
      </div>}

      {tab === 'sensitivity' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Fair Value Sensitivity</h3>
        {!sens ? <Loading/> : <div>
          <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.5rem'}}>Risk Premium vs Growth Rate Matrix</h4>
          <div style={{overflowX:'auto'}}>
            <table style={{fontSize:'.75rem'}}>
              <thead><tr><th>RP \\ g</th>{[1,1.5,2,2.5,3,3.5,4].map(g => <th key={g}>{g}%</th>)}</tr></thead>
              <tbody>{(sens.rate_growth_matrix || []).map(row => <tr key={row.risk_premium}>
                <td style={{fontWeight:600}}>{row.risk_premium}%</td>
                {[0.01,0.015,0.02,0.025,0.03,0.035,0.04].map(g => <td key={g} className="n">{row[`g_${g}`] ? $$(row[`g_${g}`]) : '--'}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
          {sens.rent_shock_sensitivity && <div style={{marginTop:'1.25rem'}}>
            <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.5rem'}}>Rent Shock Sensitivity</h4>
            <MiniBar items={sens.rent_shock_sensitivity.map(r => ({label:`${(r.rent_shock*100).toFixed(0)}%`,value:r.fair_value || 0}))} height={100}/>
          </div>}
        </div>}
      </div>}

      {tab === 'notes' && <div>
        <h3 style={{fontSize:'.95rem',marginBottom:'.75rem'}}>Research Notes</h3>
        <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
          <textarea placeholder="Add a research note..." value={newNote} onChange={e => setNewNote(e.target.value)} style={{flex:1,minHeight:'60px',resize:'vertical'}}/>
          <button className="btn btn-p" onClick={addNote} style={{alignSelf:'flex-end'}}>Save</button>
        </div>
        {notes.length === 0 ? <div className="empty"><p>No notes yet</p></div>
         : notes.map(n => <div key={n.id} style={{background:'var(--bg2)',padding:'.875rem',marginBottom:'.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{flex:1}}><div style={{fontSize:'.7rem',color:'var(--text2)',marginBottom:'.25rem'}}>{n.created_at}</div><div style={{fontSize:'.85rem'}}>{n.content}</div></div>
          <button className="btn btn-sm btn-d" onClick={() => delNote(n.id)} style={{marginLeft:'.75rem',flexShrink:0}}>Del</button>
        </div>)}
      </div>}
    </div>
  </div>;
}
