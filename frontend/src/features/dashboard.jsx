import { api } from '../auth.js';
import { $, $$, $pct, zBand, productivitySummaryBand, sourceBand, productivityBand, $chg } from '../formatting.js';
import { Loading, ErrBox } from '../shared/system.jsx';
import { LineChart, MiniBar, STable } from '../shared/data-ui.jsx';
import { PG } from '../config.js';

export function Dashboard({addToast, nav}) {
  const [data, setData] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const [agIndex, setAgIndex] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const workflowParams = React.useCallback((row, sourcePage = 'dashboard') => ({
    fips: row.fips,
    countyName: row.county,
    state: row.state,
    sourcePage,
    assetType: 'agriculture_land',
    targetUseCase: 'farmland_investment',
  }), []);

  const load = () => {
    setLoading(true); setErr(null);
    Promise.all([
      api('/dashboard'),
      api('/data/coverage').catch(() => null),
      api('/ag-index').catch(() => null),
    ])
      .then(([dashboardData, coverageData, agIndexData]) => {
        setData(dashboardData);
        setCoverage(coverageData);
        setAgIndex(agIndexData);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, []);

  if (loading) return <Loading/>;
  if (err) return <ErrBox title="Dashboard Error" msg={err} onRetry={load}/>;
  if (!data) return null;

  const s = data.summary || {};
  const cap = s.implied_cap_rate || {};
  const fv = s.fair_value || {};
  const rent = s.cash_rent || {};
  const summaryZ = data.summary_zscores || {};
  const capBand = zBand(summaryZ.implied_cap_rate);
  const fvBand = zBand(summaryZ.fair_value);
  const rentBand = zBand(summaryZ.cash_rent);
  const movers = data.top_movers || [];
  const stSum = data.state_summary || {};
  const stArr = Object.entries(stSum).map(([st,v])=>({label:st,value:v.avg_cap,count:v.count,avgVal:v.avg_value})).sort((a,b)=>b.count-a.count);
  const coveragePct = coverage?.as_of_meta?.coverage_pct != null
    ? Math.round(Number(coverage.as_of_meta.coverage_pct) * 100)
    : null;
  const freshnessRows = coverage?.freshness || [];
  const warnings = coverage?.warnings || [];
  const charts = data.charts || {};
  const productivity = data.productivity_summary || {};
  const productivityBadge = productivitySummaryBand(productivity);

  const capBuckets = data.cap_rate_distribution || [];

  return <div>
    <div className="card" style={{marginBottom:'1rem',padding:'.65rem .75rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'.5rem'}}>
        <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap',alignItems:'center'}}>
          <span className="badge badge-b">AS OF {data.as_of}</span>
          {coveragePct != null && <span className={`badge ${coveragePct >= 70 ? 'badge-g' : 'badge-r'}`}>COVERAGE {coveragePct}%</span>}
          {productivity.total_count > 0 && <span className={`badge ${productivityBadge.className}`}>{productivityBadge.label}</span>}
          {freshnessRows.length > 0 && <span className="badge badge-a">FRESHNESS {freshnessRows[0].last_updated || '--'}</span>}
          {warnings.map(w => <span key={w} className="badge badge-r">{w}</span>)}
        </div>
      </div>
    </div>

    <div className="sg">
      <div className="sc"><div className="sc-l">Counties</div><div className="sc-v">{data.county_count}</div><div className="sc-c" style={{color:'var(--text2)'}}>In database</div></div>
      <div className="sc">
        <div className="sc-l">Median Cap Rate</div>
        <div className="sc-v">{$pct(cap.median)}</div>
        <div className="sc-c" style={{color:'var(--text2)'}}>Range: {$pct(cap.min)} - {$pct(cap.max)}</div>
        <span className={`badge ${capBand.className}`}>{capBand.label}</span>
      </div>
      <div className="sc">
        <div className="sc-l">Median Fair Value</div>
        <div className="sc-v">{$$(fv.median)}</div>
        <div className="sc-c" style={{color:'var(--text2)'}}>Range: {$$(fv.min)} - {$$(fv.max)}</div>
        <span className={`badge ${fvBand.className}`}>{fvBand.label}</span>
      </div>
      <div className="sc">
        <div className="sc-l">Median Cash Rent</div>
        <div className="sc-v">{$$(rent.median)}</div>
        <div className="sc-c" style={{color:'var(--text2)'}}>Range: {$$(rent.min)} - {$$(rent.max)}</div>
        <span className={`badge ${rentBand.className}`}>{rentBand.label}</span>
      </div>
    </div>

    {agIndex?.latest && <div className="sg">
      <div className="sc">
        <div className="sc-l">Ag Composite Index</div>
        <div className="sc-v">{$(agIndex.latest.value,2)}</div>
        <div className="sc-c" style={{color:'var(--text2)'}}>1D {$chg(agIndex.latest.change_1d_pct)} | 1W {$chg(agIndex.latest.change_1w_pct)}</div>
        <span className={`badge ${zBand({zscore: agIndex.latest.zscore}).className}`}>{zBand({zscore: agIndex.latest.zscore}).label}</span>
      </div>
    </div>}

    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Historical Context</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
        <LineChart title="Median Cap Rate" series={charts.cap_rate_median_by_year || []} color="var(--accent)" unitFormatter={(v)=>$pct(v)} />
        <LineChart title="Median Fair Value" series={charts.fair_value_median_by_year || []} color="var(--accent-2)" unitFormatter={(v)=>$$(v)} />
        <LineChart title="Median Cash Rent" series={charts.cash_rent_median_by_year || []} color="var(--accent)" unitFormatter={(v)=>$$(v)} />
        <LineChart title="Treasury 10Y" series={charts.treasury_10y_by_year || []} color="var(--line-strong)" unitFormatter={(v)=>$pct(v)} />
      </div>
    </div>

    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <div>
          <h3 style={{fontSize:'1rem'}}>Top Value Opportunities</h3>
          <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.2rem'}}>County-backed rows are prioritized; identical fallback-driven clusters are collapsed; Prod shows whether county yield differentiation is active.</div>
        </div>
        <span className="badge badge-b">{movers.length} ranked clusters</span>
      </div>
      <STable
        cols={[
          {key:'county',label:'County',fmt:(_,r)=><span>{r.county}{r.duplicate_count > 1 ? ` x${r.duplicate_count}` : ''}</span>},
          {key:'state',label:'ST'},
          {key:'source_quality',label:'Data',fmt:v=>{ const badge = sourceBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'productivity_active',label:'Prod',fmt:v=>{ const badge = productivityBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'benchmark_value',label:'Land Value',num:true,fmt:v=>$$(v)},
          {key:'fair_value',label:'Fair Value',num:true,fmt:v=>$$(v)},
          {key:'spread_pct',label:'Spread',num:true,fmt:v=>v == null ? '--' : <span className={v > 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
          {key:'implied_cap_rate',label:'Cap Rate',num:true,fmt:v=>$pct(v)},
          {key:'noi_per_acre',label:'NOI/ac',num:true,fmt:v=>$$(v)},
          {key:'access_score',label:'Access',num:true,fmt:v=>$(v,1)},
          {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r)=><div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.SCENARIO, workflowParams(r)); }}>Scenario</button>
          </div>},
        ]}
        rows={movers.map(r => ({ ...r, _workflow: r.fips }))}
        onRow={(r) => nav(PG.COUNTY, {fips:r.fips})}
      />
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
      <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>State Breakdown</h3>
        <MiniBar items={stArr.slice(0,8)} height={120}/>
        <STable
          cols={[
            {key:'label',label:'State'},
            {key:'count',label:'Counties',num:true},
            {key:'value',label:'Avg Cap',num:true,fmt:v=>$pct(v)},
            {key:'avgVal',label:'Avg Value',num:true,fmt:v=>$$(v)},
          ]}
          rows={stArr}
        />
      </div>
      <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Cap Rate Distribution</h3>
        {capBuckets.length === 0 ? <div className="empty"><p>No data</p></div> : <div>
          <MiniBar items={capBuckets.map(bucket => ({ label: bucket.label || `${bucket.bucket_min}-${bucket.bucket_max}`, value: bucket.count || 0 }))} height={120}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginTop:'.75rem'}}>
            <div className="sc"><div className="sc-l">P25</div><div className="sc-v" style={{fontSize:'.95rem'}}>{$pct(data.distribution_stats?.p25)}</div><div className="sc-c">Mean: {$pct(data.distribution_stats?.mean)}</div></div>
            <div className="sc"><div className="sc-l">P75</div><div className="sc-v" style={{fontSize:'.95rem'}}>{$pct(data.distribution_stats?.p75)}</div><div className="sc-c">Median: {$pct(data.distribution_stats?.median)}</div></div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
