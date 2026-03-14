import { api } from '../auth.js';
import { $, $$, $pct, zBand, productivitySummaryBand, sourceBand, productivityBand, $chg } from '../formatting.js';
import { appendAssumptionParam, AssumptionContextBar, assumptionSetLabel, findDefaultAssumptionSet } from '../shared/assumptions-ui.jsx';
import { Loading, ErrBox } from '../shared/system.jsx';
import { LineChart, MiniBar, STable } from '../shared/data-ui.jsx';
import { PG } from '../config.js';

export function Dashboard({addToast, nav, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId}) {
  const [data, setData] = React.useState(null);
  const [baselineData, setBaselineData] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const [agIndex, setAgIndex] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [secondaryLoading, setSecondaryLoading] = React.useState(false);
  const [impactLoading, setImpactLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const loadSeqRef = React.useRef(0);
  const defaultAssumptionSet = React.useMemo(() => findDefaultAssumptionSet(assumptionSets), [assumptionSets]);
  const compareAgainstDefault = !!defaultAssumptionSet && !!activeAssumptionSetId && String(defaultAssumptionSet.id) !== String(activeAssumptionSetId);
  const workflowParams = React.useCallback((row, sourcePage = 'dashboard') => ({
    fips: row.fips,
    countyName: row.county,
    state: row.state,
    sourcePage,
    assetType: 'agriculture_land',
    targetUseCase: 'farmland_investment',
  }), []);

  const load = React.useCallback(() => {
    const loadSeq = ++loadSeqRef.current;
    setLoading(true);
    setSecondaryLoading(false);
    setImpactLoading(false);
    setErr(null);
    setBaselineData(null);
    setCoverage(null);
    setAgIndex(null);

    api(appendAssumptionParam('/dashboard', activeAssumptionSetId))
      .then((dashboardData) => {
        if (loadSeq !== loadSeqRef.current) return;
        setData(dashboardData);
        setLoading(false);
        setSecondaryLoading(true);
        if (compareAgainstDefault) {
          setImpactLoading(true);
          api(appendAssumptionParam('/dashboard', defaultAssumptionSet.id))
            .then((baseline) => {
              if (loadSeq !== loadSeqRef.current) return;
              setBaselineData(baseline);
            })
            .catch(() => {
              if (loadSeq !== loadSeqRef.current) return;
              setBaselineData(null);
            })
            .finally(() => {
              if (loadSeq !== loadSeqRef.current) return;
              setImpactLoading(false);
            });
        }
        return Promise.allSettled([
          api('/data/coverage'),
          api('/ag-index'),
        ]).then(([coverageResult, agIndexResult]) => {
          if (loadSeq !== loadSeqRef.current) return;
          setCoverage(coverageResult.status === 'fulfilled' ? coverageResult.value : null);
          setAgIndex(agIndexResult.status === 'fulfilled' ? agIndexResult.value : null);
        });
      })
      .catch(e => {
        if (loadSeq !== loadSeqRef.current) return;
        setErr(e.message);
        setLoading(false);
      })
      .finally(() => {
        if (loadSeq !== loadSeqRef.current) return;
        setSecondaryLoading(false);
      });
  }, [activeAssumptionSetId, compareAgainstDefault, defaultAssumptionSet?.id]);
  React.useEffect(load, [load]);

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
  const hasValuationReadyMetrics = (row) => row?.benchmark_value != null && row?.fair_value != null && (row?.implied_cap_rate ?? row?.implied_cap) != null && (row?.noi_per_acre ?? row?.noi) != null;
  const decisionReadyMovers = movers.filter((row) => hasValuationReadyMetrics(row) && row.source_quality !== 'national');
  const signalMovers = movers.filter((row) => !decisionReadyMovers.includes(row));
  const baselineSummary = baselineData?.summary || {};
  const baselineCap = baselineSummary.implied_cap_rate || {};
  const baselineFv = baselineSummary.fair_value || {};
  const baselineRent = baselineSummary.cash_rent || {};
  const baselineMovers = baselineData?.top_movers || [];
  const baselineDecisionReadyCount = baselineMovers.filter((row) => hasValuationReadyMetrics(row) && row.source_quality !== 'national').length;
  const fairValueDelta = fv.median != null && baselineFv.median != null ? fv.median - baselineFv.median : null;
  const capRateDelta = cap.median != null && baselineCap.median != null ? cap.median - baselineCap.median : null;
  const cashRentDelta = rent.median != null && baselineRent.median != null ? rent.median - baselineRent.median : null;
  const decisionReadyCountDelta = baselineData ? decisionReadyMovers.length - baselineDecisionReadyCount : null;

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Active Model Basis"
      description="Dashboard medians, county shortlist, and valuation rankings all use this saved assumption set."
    />
    <div className="card" style={{marginBottom:'.7rem',padding:'.65rem .75rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'.75rem',flexWrap:'wrap'}}>
        <div style={{minWidth:'240px',flex:'1 1 280px'}}>
          <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>Assumption Impact vs Default</div>
          {!compareAgainstDefault ? (
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
              <strong style={{color:'var(--text)'}}>{assumptionSetLabel(activeAssumptionSet)}</strong> is the baseline. Switch to another saved set to see the modeled before/after effect on fair value, cap rate, and shortlist quality.
            </div>
          ) : impactLoading ? (
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
              Comparing <strong style={{color:'var(--text)'}}>{assumptionSetLabel(activeAssumptionSet)}</strong> against <strong style={{color:'var(--text)'}}>{assumptionSetLabel(defaultAssumptionSet)}</strong> using live dashboard medians.
            </div>
          ) : baselineData ? (
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
              The active set is moving modeled outputs relative to <strong style={{color:'var(--text)'}}>{assumptionSetLabel(defaultAssumptionSet)}</strong>. Raw rent should stay mostly unchanged; valuation metrics should move.
            </div>
          ) : (
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
              Default-baseline comparison is temporarily unavailable. The dashboard still reflects the active set <strong style={{color:'var(--text)'}}>{assumptionSetLabel(activeAssumptionSet)}</strong>.
            </div>
          )}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(140px, 1fr))',gap:'.5rem',flex:'2 1 640px'}}>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Median Fair Value</div>
            <div className="sc-v" style={{fontSize:'.95rem'}}>{compareAgainstDefault && baselineData ? $$(fv.median) : '--'}</div>
            <div className="sc-c">{compareAgainstDefault && baselineData ? `${formatDollarDelta(fairValueDelta)} vs default` : 'Model output'}</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Median Cap Rate</div>
            <div className="sc-v" style={{fontSize:'.95rem'}}>{compareAgainstDefault && baselineData ? $pct(cap.median) : '--'}</div>
            <div className="sc-c">{compareAgainstDefault && baselineData && capRateDelta != null ? `${capRateDelta >= 0 ? '+' : ''}${Math.round(capRateDelta * 100)} bps vs default` : 'Required-return sensitive'}</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Median Cash Rent</div>
            <div className="sc-v" style={{fontSize:'.95rem'}}>{compareAgainstDefault && baselineData ? $$(rent.median) : '--'}</div>
            <div className="sc-c">{compareAgainstDefault && baselineData ? `${formatDollarDelta(cashRentDelta)} vs default` : 'Raw market input'}</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Decision-Ready Rows</div>
            <div className="sc-v" style={{fontSize:'.95rem'}}>{decisionReadyMovers.length}</div>
            <div className="sc-c">{compareAgainstDefault && baselineData && decisionReadyCountDelta != null ? `${decisionReadyCountDelta >= 0 ? '+' : ''}${decisionReadyCountDelta} vs default` : 'Valuation-ready shortlist'}</div>
          </div>
        </div>
      </div>
    </div>
    <div className="card" style={{marginBottom:'1rem',padding:'.65rem .75rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'.5rem'}}>
        <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap',alignItems:'center'}}>
          <span className="badge badge-b">AS OF {data.as_of}</span>
          {coveragePct != null && <span className={`badge ${coveragePct >= 70 ? 'badge-g' : 'badge-r'}`}>COVERAGE {coveragePct}%</span>}
          {productivity.total_count > 0 && <span className={`badge ${productivityBadge.className}`}>{productivityBadge.label}</span>}
          {freshnessRows.length > 0 && <span className="badge badge-a">FRESHNESS {freshnessRows[0].last_updated || '--'}</span>}
          {secondaryLoading && <span className="badge badge-a">LOADING CONTEXT...</span>}
          {warnings.map(w => <span key={w} className="badge badge-r">{w}</span>)}
        </div>
      </div>
    </div>
    <div className="card" style={{marginBottom:'1rem',padding:'.65rem .75rem'}}>
      <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>Benchmark Scope</div>
      <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
        Atlas uses a <strong style={{color:'var(--text)'}}>benchmark value</strong> as its farmland-style underwriting anchor. When county land value is unavailable, Atlas can derive that benchmark from county cash rent multiplied by the state rent multiple. Treat it as an underwriting benchmark for the current lens, not as a whole-county appraisal of every land use.
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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'.75rem',marginBottom:'.75rem',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.25rem'}}>Historical Context</h3>
          <div style={{fontSize:'.72rem',color:'var(--text2)'}}>Atlas-computed county medians across available modeled counties by year. Use for regime context, not as a transaction-backed index.</div>
        </div>
      </div>
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
          <h3 style={{fontSize:'1rem'}}>Decision-Ready County Candidates</h3>
          <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.2rem'}}>Counties with the core valuation stack populated on this page: land value, fair value, cap rate, and NOI. Access may still be pending in some rows; use county detail for the full trust read.</div>
        </div>
        <span className="badge badge-b">{decisionReadyMovers.length} ready now</span>
      </div>
      {decisionReadyMovers.length === 0 ? <div className="empty">
        <p>No fully decision-ready county rows are in the current dashboard shortlist.</p>
        <div style={{display:'flex',justifyContent:'center',marginTop:'.7rem'}}>
          <button className="btn btn-sm btn-p" onClick={() => nav(PG.SCREEN)}>Open Screener</button>
        </div>
      </div> : <STable
        cols={[
          {key:'county',label:'County',fmt:(_,r)=><span>{r.county}{r.duplicate_count > 1 ? ` x${r.duplicate_count}` : ''}</span>},
          {key:'state',label:'ST'},
          {key:'source_quality',label:'Data',fmt:v=>{ const badge = sourceBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'productivity_active',label:'Prod',fmt:v=>{ const badge = productivityBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'primary_driver_label',label:'Why',fmt:(_,r)=><div>
            <div style={{fontSize:'.75rem',fontWeight:600}}>{r.primary_driver_label || '--'}</div>
            <div style={{fontSize:'.68rem',color:'var(--text2)'}}>{r.driver_summary || '--'}</div>
          </div>},
          {key:'benchmark_value',label:'Benchmark Value',num:true,fmt:v=>$$(v)},
          {key:'fair_value',label:'Fair Value',num:true,fmt:v=>$$(v)},
          {key:'spread_pct',label:'Spread',num:true,fmt:v=>v == null ? '--' : <span className={v > 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
          {key:'implied_cap_rate',label:'Cap Rate',num:true,fmt:(_,r)=>$pct(r.implied_cap_rate ?? r.implied_cap)},
          {key:'noi_per_acre',label:'NOI/ac',num:true,fmt:(_,r)=>$$(r.noi_per_acre ?? r.noi)},
          {key:'access_score',label:'Access',num:true,fmt:v=>$(v,1)},
          {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r)=><div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.SCENARIO, workflowParams(r)); }}>Scenario</button>
          </div>},
        ]}
        rows={decisionReadyMovers.map(r => ({ ...r, _workflow: r.fips }))}
        onRow={(r) => nav(PG.COUNTY, {fips:r.fips})}
      />}
    </div>

    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <div>
          <h3 style={{fontSize:'1rem'}}>Market Signal Clusters</h3>
          <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.2rem'}}>These rows are still useful for regime detection and county triage, but some rely on proxies or lack full underwriting fields. Treat them as prompts to investigate, not final candidates.</div>
        </div>
        <span className="badge badge-a">{signalMovers.length} signal rows</span>
      </div>
      <STable
        cols={[
          {key:'county',label:'County',fmt:(_,r)=><span>{r.county}{r.duplicate_count > 1 ? ` x${r.duplicate_count}` : ''}</span>},
          {key:'state',label:'ST'},
          {key:'source_quality',label:'Data',fmt:v=>{ const badge = sourceBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'productivity_active',label:'Prod',fmt:v=>{ const badge = productivityBand(v); return <span className={`badge ${badge.className}`}>{badge.label}</span>; }},
          {key:'primary_driver_label',label:'Why',fmt:(_,r)=><div>
            <div style={{fontSize:'.75rem',fontWeight:600}}>{r.primary_driver_label || '--'}</div>
            <div style={{fontSize:'.68rem',color:'var(--text2)'}}>{r.driver_summary || '--'}</div>
          </div>},
          {key:'benchmark_value',label:'Benchmark Value',num:true,fmt:v=>$$(v)},
          {key:'fair_value',label:'Fair Value',num:true,fmt:v=>$$(v)},
          {key:'spread_pct',label:'Spread',num:true,fmt:v=>v == null ? '--' : <span className={v > 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
          {key:'implied_cap_rate',label:'Cap Rate',num:true,fmt:(_,r)=>$pct(r.implied_cap_rate ?? r.implied_cap)},
          {key:'noi_per_acre',label:'NOI/ac',num:true,fmt:(_,r)=>$$(r.noi_per_acre ?? r.noi)},
          {key:'access_score',label:'Access',num:true,fmt:v=>$(v,1)},
          {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r)=><div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.COUNTY, {fips:r.fips}); }}>Inspect</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
          </div>},
        ]}
        rows={signalMovers.map(r => ({ ...r, _workflow: r.fips }))}
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
          <MiniBar items={capBuckets.map(bucket => ({ label: bucket.label || `${bucket.bucket_min}-${bucket.bucket_max}`, value: bucket.count ?? bucket.value ?? 0 }))} height={120}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginTop:'.75rem'}}>
            <div className="sc"><div className="sc-l">P25</div><div className="sc-v" style={{fontSize:'.95rem'}}>{$pct(data.distribution_stats?.p25)}</div><div className="sc-c">Mean: {$pct(data.distribution_stats?.mean)}</div></div>
            <div className="sc"><div className="sc-l">P75</div><div className="sc-v" style={{fontSize:'.95rem'}}>{$pct(data.distribution_stats?.p75)}</div><div className="sc-c">Median: {$pct(data.distribution_stats?.median)}</div></div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

function formatDollarDelta(value) {
  if (value == null) return '--';
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}
