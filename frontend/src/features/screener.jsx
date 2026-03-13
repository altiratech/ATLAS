import { API, PG } from '../config.js';
import {
  $,
  $$,
  $chg,
  $pct,
  industrialLineageBand,
  industrialPowerSummaryBand,
  productivityBand,
  productivitySummaryBand,
  sourceBand,
  toast,
  zBand,
} from '../formatting.js';
import { api } from '../auth.js';
import { appendAssumptionParam, AssumptionContextBar } from '../shared/assumptions-ui.jsx';
import { ErrBox } from '../shared/system.jsx';
import { STable } from '../shared/data-ui.jsx';

export function Screener({addToast, nav, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId}) {
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [minCap, setMinCap] = React.useState('');
  const [maxRentMult, setMaxRentMult] = React.useState('');
  const [minAccess, setMinAccess] = React.useState('');
  const [minPowerIndex, setMinPowerIndex] = React.useState('');
  const [maxPowerPrice, setMaxPowerPrice] = React.useState('');
  const [state, setState] = React.useState('');
  const [sortBy, setSortBy] = React.useState('implied_cap_rate');
  const [sortDir, setSortDir] = React.useState('desc');
  const [zCapMin, setZCapMin] = React.useState('');
  const [zCapMax, setZCapMax] = React.useState('');
  const [zFairMin, setZFairMin] = React.useState('');
  const [zFairMax, setZFairMax] = React.useState('');
  const [zRentMin, setZRentMin] = React.useState('');
  const [zRentMax, setZRentMax] = React.useState('');
  const [screens, setScreens] = React.useState([]);
  const [selScreen, setSelScreen] = React.useState('');
  const [screenName, setScreenName] = React.useState('');
  const [savingScreen, setSavingScreen] = React.useState(false);

  const loadScreens = React.useCallback(() => {
    api('/screens').then(d => setScreens(d)).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadScreens();
  }, [loadScreens]);

  const run = React.useCallback(() => {
    setLoading(true);
    setErr(null);
    let qs = `?sort_by=${sortBy}&sort_dir=${sortDir}`;
    if (minCap) qs += `&min_cap=${minCap}`;
    if (maxRentMult) qs += `&max_rent_mult=${maxRentMult}`;
    if (minAccess) qs += `&min_access=${minAccess}`;
    if (minPowerIndex) qs += `&min_power_index=${minPowerIndex}`;
    if (maxPowerPrice) qs += `&max_power_price=${maxPowerPrice}`;
    if (state) qs += `&state=${state}`;
    if (selScreen) qs += `&screen_id=${selScreen}`;
    if (zCapMin) qs += `&z_implied_cap_rate_min=${zCapMin}`;
    if (zCapMax) qs += `&z_implied_cap_rate_max=${zCapMax}`;
    if (zFairMin) qs += `&z_fair_value_min=${zFairMin}`;
    if (zFairMax) qs += `&z_fair_value_max=${zFairMax}`;
    if (zRentMin) qs += `&z_cash_rent_min=${zRentMin}`;
    if (zRentMax) qs += `&z_cash_rent_max=${zRentMax}`;
    api(appendAssumptionParam('/screener' + qs, activeAssumptionSetId))
      .then(d => setResults(d))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [
    maxPowerPrice,
    maxRentMult,
    minAccess,
    minCap,
    minPowerIndex,
    selScreen,
    sortBy,
    sortDir,
    state,
    activeAssumptionSetId,
    zCapMax,
    zCapMin,
    zFairMax,
    zFairMin,
    zRentMax,
    zRentMin,
  ]);

  const exportCSV = () => {
    let asOf = results?.as_of ? `?as_of=${encodeURIComponent(results.as_of)}` : '';
    if (activeAssumptionSetId) asOf += `${asOf ? '&' : '?'}assumption_set_id=${encodeURIComponent(String(activeAssumptionSetId))}`;
    window.open(API + '/export/screener' + asOf, '_blank');
    addToast(toast('CSV export started', 'ok'));
  };

  React.useEffect(() => {
    run();
  }, [run]);

  const screenerProductivity = results?.productivity_summary || {};
  const screenerProductivityBadge = productivitySummaryBand(screenerProductivity);
  const screenerIndustrial = results?.industrial_summary || {};
  const screenerIndustrialBadge = industrialPowerSummaryBand(screenerIndustrial);
  const workflowParams = React.useCallback((row, sourcePage = 'screener') => ({
    fips: row.fips,
    countyName: row.county,
    state: row.state,
    sourcePage,
    assetType: 'agriculture_land',
    targetUseCase: 'farmland_investment',
  }), []);
  const reusableFilters = React.useMemo(() => {
    const filters = [];
    if (minCap) filters.push({ metric: 'implied_cap_rate', op: '>', value: Number(minCap) });
    if (maxRentMult) filters.push({ metric: 'rent_multiple', op: '<', value: Number(maxRentMult) });
    if (minAccess) filters.push({ metric: 'access_score', op: '>', value: Number(minAccess) });
    return filters.filter((filter) => Number.isFinite(filter.value));
  }, [maxRentMult, minAccess, minCap]);
  const liveOnlyFilters = React.useMemo(() => {
    const filters = [];
    if (state) filters.push(`state=${state.toUpperCase()}`);
    if (minPowerIndex) filters.push(`min power index ${minPowerIndex}`);
    if (maxPowerPrice) filters.push(`max power price ${maxPowerPrice}`);
    if (zCapMin || zCapMax) filters.push('cap z-score');
    if (zFairMin || zFairMax) filters.push('fair value z-score');
    if (zRentMin || zRentMax) filters.push('cash rent z-score');
    return filters;
  }, [maxPowerPrice, minPowerIndex, state, zCapMax, zCapMin, zFairMax, zFairMin, zRentMax, zRentMin]);

  const persistScreen = async (openBacktest = false) => {
    if (reusableFilters.length === 0) {
      addToast(toast('Add at least one reusable core filter before saving a screen', 'err'));
      return;
    }
    setSavingScreen(true);
    const trimmedName = screenName.trim();
    const derivedName = trimmedName || `${state ? state.toUpperCase() + ' ' : ''}Screen ${new Date().toLocaleDateString('en-US')}`;
    try {
      const created = await api('/screens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: derivedName,
          filters: reusableFilters,
          ranking: {
            sort_by: sortBy,
            sort_dir: sortDir,
            source: 'screener',
          },
        }),
      });
      await loadScreens();
      setSelScreen(String(created.id));
      setScreenName(created.name);
      addToast(toast(openBacktest ? 'Screen saved and sent to backtest' : 'Screen saved', 'ok'));
      if (openBacktest) {
        nav(PG.BACKTEST, {
          screen_id: String(created.id),
          screen_name: created.name,
          sourcePage: 'screener',
          autorun: true,
        });
      }
    } catch (e) {
      addToast(toast('Failed to save screen', 'err'));
    } finally {
      setSavingScreen(false);
    }
  };

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Screening Assumptions"
      description="Screener results, saved exports, and any downstream backtests use this active assumption set."
    />
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <h3 style={{fontSize:'1rem'}}>Filter Builder</h3>
        <div style={{display:'flex',gap:'.5rem'}}>
          <button className="btn btn-sm" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-sm btn-p" onClick={run} disabled={loading}>{loading ? 'Running...' : 'Run Screen'}</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'.75rem'}}>
        <div className="fg"><label>Min Cap Rate</label><input type="number" step="0.1" value={minCap} onChange={e => setMinCap(e.target.value)} placeholder="e.g. 2.0"/></div>
        <div className="fg"><label>Max Rent Multiple</label><input type="number" step="1" value={maxRentMult} onChange={e => setMaxRentMult(e.target.value)} placeholder="e.g. 25"/></div>
        <div className="fg"><label>Min Access Score</label><input type="number" step="1" value={minAccess} onChange={e => setMinAccess(e.target.value)} placeholder="e.g. 50"/></div>
        <div className="fg"><label>Min Power Index</label><input type="number" step="1" value={minPowerIndex} onChange={e => setMinPowerIndex(e.target.value)} placeholder="e.g. 80"/></div>
        <div className="fg"><label>Max Power Price</label><input type="number" step="0.1" value={maxPowerPrice} onChange={e => setMaxPowerPrice(e.target.value)} placeholder="c/kWh"/></div>
        <div className="fg"><label>Z Cap Min</label><input type="number" step="0.1" value={zCapMin} onChange={e => setZCapMin(e.target.value)} placeholder="e.g. 1.0"/></div>
        <div className="fg"><label>Z Cap Max</label><input type="number" step="0.1" value={zCapMax} onChange={e => setZCapMax(e.target.value)} placeholder="e.g. 2.5"/></div>
        <div className="fg"><label>Z Fair Min</label><input type="number" step="0.1" value={zFairMin} onChange={e => setZFairMin(e.target.value)} placeholder="e.g. -1.0"/></div>
        <div className="fg"><label>Z Fair Max</label><input type="number" step="0.1" value={zFairMax} onChange={e => setZFairMax(e.target.value)} placeholder="e.g. 1.0"/></div>
        <div className="fg"><label>Z Rent Min</label><input type="number" step="0.1" value={zRentMin} onChange={e => setZRentMin(e.target.value)} placeholder="e.g. -0.5"/></div>
        <div className="fg"><label>Z Rent Max</label><input type="number" step="0.1" value={zRentMax} onChange={e => setZRentMax(e.target.value)} placeholder="e.g. 1.5"/></div>
        <div className="fg"><label>State</label><input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="e.g. IA"/></div>
        <div className="fg"><label>Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="implied_cap_rate">Cap Rate</option>
            <option value="fair_value">Fair Value</option>
            <option value="cash_rent">Cash Rent</option>
            <option value="benchmark_value">Land Value</option>
            <option value="access_score">Access Score</option>
            <option value="power_cost_index">Power Cost Index</option>
            <option value="industrial_power_price">Power Price</option>
            <option value="noi_per_acre">NOI/Acre</option>
            <option value="rent_multiple">Rent Multiple</option>
          </select>
        </div>
        <div className="fg"><label>Saved Screen</label>
          <select value={selScreen} onChange={e => setSelScreen(e.target.value)}>
            <option value="">None</option>
            {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{marginTop:'.85rem',paddingTop:'.85rem',borderTop:'1px solid var(--line)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',flexWrap:'wrap',marginBottom:'.55rem'}}>
          <div>
            <div style={{fontSize:'.78rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.18rem'}}>Reusable Screen</div>
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>Save the core filter logic that Atlas can reuse and backtest today.</div>
          </div>
          <div style={{display:'flex',gap:'.45rem',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={() => persistScreen(false)} disabled={savingScreen}>{savingScreen ? 'Saving...' : 'Save Screen'}</button>
            <button className="btn btn-sm btn-p" onClick={() => persistScreen(true)} disabled={savingScreen}>{savingScreen ? 'Saving...' : 'Save + Backtest'}</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(220px,1.4fr) 1fr',gap:'.75rem',alignItems:'start'}}>
          <div className="fg" style={{margin:0}}>
            <label>Screen Name</label>
            <input type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="e.g. Defensive Midwest Cap-Rate Screen"/>
          </div>
          <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center'}}>
            {reusableFilters.length > 0
              ? reusableFilters.map((filter, idx) => <span key={`${filter.metric}-${idx}`} className="badge badge-g">{filter.metric} {filter.op} {filter.value}</span>)
              : <span className="badge badge-r">NO REUSABLE CORE FILTERS SET</span>}
            {liveOnlyFilters.length > 0 && <span className="badge badge-a">LIVE-ONLY: {liveOnlyFilters.join(' • ')}</span>}
          </div>
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text2)',marginTop:'.45rem'}}>
          Saved screens currently persist reusable valuation filters for Atlas and Backtest. State, z-score, and industrial power filters remain live-only until the next closure pass.
        </div>
      </div>
    </div>

    {err && <ErrBox title="Screener Error" msg={err}/>}

    {results && <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <h3 style={{fontSize:'1rem'}}>Results ({results.count} counties)</h3>
        <span className="badge badge-b">as of {results.as_of}</span>
      </div>
      <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.45rem',maxWidth:'980px'}}>
        Atlas is showing a land-underwriting benchmark for each county, not a whole-county urban land appraisal. Rows tagged <strong style={{color:'var(--text1)'}}>PROXY</strong> derive benchmark value from county cash rent multiplied by the state land-value rent multiple when direct county land value is unavailable.
      </div>
      {results.as_of_meta && <div style={{marginBottom:'.55rem',display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
        <span className={`badge ${results.as_of_meta.coverage_pct >= 0.7 ? 'badge-g' : 'badge-r'}`}>
          COVERAGE {Math.round((results.as_of_meta.coverage_pct || 0) * 100)}%
        </span>
        {screenerProductivity.total_count > 0 && <span className={`badge ${screenerProductivityBadge.className}`}>{screenerProductivityBadge.label}</span>}
        {screenerIndustrial.total_count > 0 && <span className={`badge ${screenerIndustrialBadge.className}`}>{screenerIndustrialBadge.label}</span>}
        <span className="badge badge-a">COUNTY-BACKED ROWS PREFERRED</span>
        {(results.as_of_meta.warnings || []).map(w => <span key={w} className="badge badge-r">{w}</span>)}
      </div>}
      <STable
        cols={[
          {key:'county',label:'County'},
          {key:'state',label:'ST'},
          {key:'source_quality',label:'Data',fmt:(v,r) => {
            const badge = sourceBand(v);
            return <span className={`badge ${badge.className}`} title={r.benchmark_method_detail || r.source_quality_detail || 'Source quality detail unavailable.'}>{badge.label}</span>;
          }},
          {key:'_industrial_lineage',label:'Ind',fmt:(_,r) => {
            const badge = industrialLineageBand(r.industrial?.lineage);
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
          }},
          {key:'productivity_active',label:'Prod',fmt:v => {
            const badge = productivityBand(v);
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
          }},
          {key:'_cash_rent',label:'Cash Rent',num:true,fmt:(_,r) => $$(r.metrics?.cash_rent)},
          {key:'_bv',label:'Land Value',num:true,fmt:(_,r) => <span title={r.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{$$(r.metrics?.benchmark_value)}</span>},
          {key:'_noi',label:'NOI/ac',num:true,fmt:(_,r) => $$(r.metrics?.noi_per_acre)},
          {key:'_cap',label:'Cap Rate',num:true,fmt:(_,r) => $pct(r.metrics?.implied_cap_rate)},
          {key:'_fv',label:'Fair Value',num:true,fmt:(_,r) => $$(r.metrics?.fair_value)},
          {key:'_spread',label:'Spread',num:true,fmt:(_,r) => {
            const v = r._spread;
            return v == null ? '--' : <span className={v > 0 ? 'pos' : 'neg'}>{$chg(v)}</span>;
          }},
          {key:'_rm',label:'Rent Mult',num:true,fmt:(_,r) => $(r.metrics?.rent_multiple,1)},
          {key:'_access',label:'Access',num:true,fmt:(_,r) => $(r.metrics?.access_score,1)},
          {key:'_pidx',label:'Pwr Idx',num:true,fmt:(_,r) => $(r.industrial?.power_cost_index,1)},
          {key:'_ppx',label:'Pwr $',num:true,fmt:(_,r) => $(r.industrial?.industrial_power_price,2)},
          {key:'_zcap',label:'Cap Z',num:true,fmt:(_,r) => {
            const badge = zBand(r.zscores?.implied_cap_rate || {});
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
          }},
          {key:'_zfv',label:'Fair Z',num:true,fmt:(_,r) => {
            const badge = zBand(r.zscores?.fair_value || {});
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
          }},
          {key:'_zrent',label:'Rent Z',num:true,fmt:(_,r) => {
            const badge = zBand(r.zscores?.cash_rent || {});
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
          }},
          {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r) => <div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.COUNTY, {fips:r.fips}); }}>View</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.SCENARIO, workflowParams(r)); }}>Scenario</button>
          </div>},
        ]}
        rows={(results.results || []).map(r => {
          const fair = r.metrics?.fair_value;
          const benchmark = r.metrics?.benchmark_value;
          const spread = fair != null && benchmark != null && benchmark > 0
            ? ((fair - benchmark) / benchmark) * 100
            : null;
          return {
            ...r,
            _cash_rent:r.metrics?.cash_rent,
            _bv:benchmark,
            _cap:r.metrics?.implied_cap_rate,
            _fv:fair,
            _spread:spread,
            _rm:r.metrics?.rent_multiple,
            _noi:r.metrics?.noi_per_acre,
            _access:r.metrics?.access_score,
            _industrial_lineage:r.industrial?.lineage,
            _pidx:r.industrial?.power_cost_index,
            _ppx:r.industrial?.industrial_power_price,
            _zcap:r.zscores?.implied_cap_rate?.zscore,
            _zfv:r.zscores?.fair_value?.zscore,
            _zrent:r.zscores?.cash_rent?.zscore,
            _workflow:r.fips,
          };
        })}
        stickyHeader={true}
        onRow={r => nav(PG.COUNTY, {fips:r.fips})}
      />
    </div>}
  </div>;
}
