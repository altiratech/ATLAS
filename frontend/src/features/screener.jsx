import { API, PG } from '../config.js';
import {
  $,
  $$,
  $chg,
  $int,
  $pct,
  benchmarkMethodBand,
  droughtRiskBand,
  floodRiskBand,
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
import { buildScreenReasons } from '../shared/atlas-read.js';
import { ErrBox } from '../shared/system.jsx';
import { STable } from '../shared/data-ui.jsx';

const DEFAULT_VIEW_COLUMNS = [
  'county',
  'state',
  '_read',
  'source_quality',
  'benchmark_method',
  'productivity_active',
  '_cash_rent',
  '_bv',
  '_noi',
  '_cap',
  '_fv',
  '_spread',
  '_access',
  '_drought',
  '_flood',
  '_irrigated',
  '_soil_share',
  '_workflow',
];

function asInputValue(value) {
  return value == null ? '' : String(value);
}

function findFilterValue(filters, metric, op) {
  return filters.find((filter) => filter.metric === metric && filter.op === op)?.value;
}

export function Screener({
  addToast,
  nav,
  params,
  assumptionSets,
  activeAssumptionSetId,
  activeAssumptionSet,
  setActiveAssumptionSetId,
  activePlaybook,
  activePlaybookKey,
}) {
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [minCap, setMinCap] = React.useState('');
  const [maxRentMult, setMaxRentMult] = React.useState('');
  const [minAccess, setMinAccess] = React.useState('');
  const [minPowerIndex, setMinPowerIndex] = React.useState('');
  const [maxPowerPrice, setMaxPowerPrice] = React.useState('');
  const [maxDroughtRisk, setMaxDroughtRisk] = React.useState('');
  const [maxFloodRisk, setMaxFloodRisk] = React.useState('');
  const [minSoilFarmlandPct, setMinSoilFarmlandPct] = React.useState('');
  const [state, setState] = React.useState('');
  const [basisFilter, setBasisFilter] = React.useState('');
  const [preset, setPreset] = React.useState('');
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
  const [screenNotes, setScreenNotes] = React.useState('');
  const [savingScreen, setSavingScreen] = React.useState(false);

  const applyPreset = React.useCallback((value) => {
    setPreset(value);
    setBasisFilter('');
    setSelScreen('');
    setZCapMin('');
    setZCapMax('');
    setZFairMin('');
    setZFairMax('');
    setZRentMin('');
    setZRentMax('');
    if (value === '') {
      return;
    }
    if (value === 'quality_land') {
      setMinCap('');
      setMaxRentMult('');
      setMinAccess('');
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('60');
      setMaxFloodRisk('60');
      setMinSoilFarmlandPct('70');
      setSortBy('soil_significant_farmland_share_pct');
      setSortDir('desc');
      return;
    }
    if (value === 'resilient_value') {
      setMinCap('2.5');
      setMaxRentMult('');
      setMinAccess('');
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('50');
      setMaxFloodRisk('50');
      setMinSoilFarmlandPct('55');
      setSortBy('implied_cap_rate');
      setSortDir('desc');
      return;
    }
    if (value === 'irrigated_quality') {
      setMinCap('');
      setMaxRentMult('');
      setMinAccess('');
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('70');
      setMaxFloodRisk('');
      setMinSoilFarmlandPct('50');
      setSortBy('irrigated_ag_land_acres');
      setSortDir('desc');
      return;
    }
    if (value === 'decision_ready') {
      setMinCap('2.5');
      setMaxRentMult('');
      setMinAccess('40');
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('60');
      setMaxFloodRisk('60');
      setMinSoilFarmlandPct('60');
      setSortBy('access_score');
      setSortDir('desc');
    }
  }, []);

  const resetFilters = React.useCallback(() => {
    setPreset('');
    setMinCap('');
    setMaxRentMult('');
    setMinAccess('');
    setMinPowerIndex('');
    setMaxPowerPrice('');
    setMaxDroughtRisk('');
    setMaxFloodRisk('');
    setMinSoilFarmlandPct('');
    setState('');
    setBasisFilter('');
    setSortBy('implied_cap_rate');
    setSortDir('desc');
    setZCapMin('');
    setZCapMax('');
    setZFairMin('');
    setZFairMax('');
    setZRentMin('');
    setZRentMax('');
    setSelScreen('');
    setScreenName('');
    setScreenNotes('');
  }, []);

  const loadScreens = React.useCallback(() => {
    api('/screens').then(d => setScreens(d)).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadScreens();
  }, [loadScreens]);

  const availableScreens = React.useMemo(
    () => screens.filter((screen) => !screen.playbook_key || screen.playbook_key === activePlaybookKey),
    [screens, activePlaybookKey],
  );

  const applySavedView = React.useCallback((view) => {
    const filters = view?.filters || [];
    const ranking = view?.ranking || {};
    const viewState = view?.view_state || {};
    setScreenName(view?.name || '');
    setScreenNotes(view?.notes || '');
    setPreset(asInputValue(viewState.preset));
    setMinCap(asInputValue(findFilterValue(filters, 'implied_cap_rate', '>')));
    setMaxRentMult(asInputValue(findFilterValue(filters, 'rent_multiple', '<')));
    setMinAccess(asInputValue(findFilterValue(filters, 'access_score', '>')));
    setMinPowerIndex(asInputValue(viewState.minPowerIndex));
    setMaxPowerPrice(asInputValue(viewState.maxPowerPrice));
    setMaxDroughtRisk(asInputValue(viewState.maxDroughtRisk));
    setMaxFloodRisk(asInputValue(viewState.maxFloodRisk));
    setMinSoilFarmlandPct(asInputValue(viewState.minSoilFarmlandPct));
    setState(asInputValue(viewState.state).toUpperCase());
    setBasisFilter(asInputValue(viewState.basisFilter));
    setSortBy(ranking.sort_by || viewState.sortBy || 'implied_cap_rate');
    setSortDir(ranking.sort_dir || viewState.sortDir || 'desc');
    setZCapMin(asInputValue(viewState.zCapMin));
    setZCapMax(asInputValue(viewState.zCapMax));
    setZFairMin(asInputValue(viewState.zFairMin));
    setZFairMax(asInputValue(viewState.zFairMax));
    setZRentMin(asInputValue(viewState.zRentMin));
    setZRentMax(asInputValue(viewState.zRentMax));
    if (view?.assumption_set_id != null) {
      setActiveAssumptionSetId?.(String(view.assumption_set_id));
    }
  }, [setActiveAssumptionSetId]);

  React.useEffect(() => {
    if (params?.preset) applyPreset(params.preset);
    if (params?.screen_id) setSelScreen(String(params.screen_id));
    if (params?.screen_name) setScreenName(params.screen_name);
  }, [applyPreset, params?.preset, params?.screen_id, params?.screen_name]);

  React.useEffect(() => {
    if (!selScreen) return;
    const selected = screens.find((screen) => String(screen.id) === String(selScreen));
    if (selected) applySavedView(selected);
  }, [applySavedView, screens, selScreen]);

  const run = React.useCallback(() => {
    setLoading(true);
    setErr(null);
    let qs = `?sort_by=${sortBy}&sort_dir=${sortDir}`;
    if (minCap) qs += `&min_cap=${minCap}`;
    if (maxRentMult) qs += `&max_rent_mult=${maxRentMult}`;
    if (minAccess) qs += `&min_access=${minAccess}`;
    if (minPowerIndex) qs += `&min_power_index=${minPowerIndex}`;
    if (maxPowerPrice) qs += `&max_power_price=${maxPowerPrice}`;
    if (maxDroughtRisk) qs += `&max_drought_risk=${maxDroughtRisk}`;
    if (maxFloodRisk) qs += `&max_flood_risk=${maxFloodRisk}`;
    if (minSoilFarmlandPct) qs += `&min_soil_farmland_pct=${minSoilFarmlandPct}`;
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
    maxDroughtRisk,
    maxFloodRisk,
    minSoilFarmlandPct,
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
    playbookKey: activePlaybookKey,
    assetType: activePlaybook?.assetType || 'agriculture_land',
    targetUseCase: activePlaybook?.targetUseCase || 'farmland_income',
  }), [activePlaybook, activePlaybookKey]);
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
    if (basisFilter) filters.push(`basis=${basisFilter.replace(/_/g, ' ')}`);
    if (minPowerIndex) filters.push(`min power index ${minPowerIndex}`);
    if (maxPowerPrice) filters.push(`max power price ${maxPowerPrice}`);
    if (maxDroughtRisk) filters.push(`max drought risk ${maxDroughtRisk}`);
    if (maxFloodRisk) filters.push(`max flood risk ${maxFloodRisk}`);
    if (minSoilFarmlandPct) filters.push(`min NRCS farmland ${minSoilFarmlandPct}%`);
    if (zCapMin || zCapMax) filters.push('cap z-score');
    if (zFairMin || zFairMax) filters.push('fair value z-score');
    if (zRentMin || zRentMax) filters.push('cash rent z-score');
    return filters;
  }, [maxDroughtRisk, maxFloodRisk, maxPowerPrice, minPowerIndex, minSoilFarmlandPct, state, zCapMax, zCapMin, zFairMax, zFairMin, zRentMax, zRentMin]);
  const activeScreenFilters = React.useMemo(() => ({
    minCap,
    minAccess,
    maxDroughtRisk,
    maxFloodRisk,
    minSoilFarmlandPct,
    minPowerIndex,
    maxPowerPrice,
  }), [maxDroughtRisk, maxFloodRisk, maxPowerPrice, minAccess, minCap, minPowerIndex, minSoilFarmlandPct]);

  const viewState = React.useMemo(() => ({
    preset,
    state: state.toUpperCase(),
    basisFilter,
    minPowerIndex,
    maxPowerPrice,
    maxDroughtRisk,
    maxFloodRisk,
    minSoilFarmlandPct,
    zCapMin,
    zCapMax,
    zFairMin,
    zFairMax,
    zRentMin,
    zRentMax,
    sortBy,
    sortDir,
  }), [
    basisFilter,
    maxDroughtRisk,
    maxFloodRisk,
    maxPowerPrice,
    minPowerIndex,
    minSoilFarmlandPct,
    preset,
    sortBy,
    sortDir,
    state,
    zCapMax,
    zCapMin,
    zFairMax,
    zFairMin,
    zRentMax,
    zRentMin,
  ]);

  const persistScreen = async (openBacktest = false) => {
    if (reusableFilters.length === 0) {
      addToast(toast('Add at least one reusable core metric filter before saving a view', 'err'));
      return;
    }
    setSavingScreen(true);
    const trimmedName = screenName.trim();
    const derivedName = trimmedName || `${state ? state.toUpperCase() + ' ' : ''}${activePlaybook?.shortLabel || 'View'} ${new Date().toLocaleDateString('en-US')}`;
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
          columns: DEFAULT_VIEW_COLUMNS,
          playbook_key: activePlaybookKey,
          notes: screenNotes.trim(),
          assumption_set_id: activeAssumptionSetId ? Number(activeAssumptionSetId) : null,
          view_state: viewState,
        }),
      });
      await loadScreens();
      setSelScreen(String(created.id));
      setScreenName(created.name);
      setScreenNotes(created.notes || screenNotes);
      addToast(toast(openBacktest ? 'Saved view created and sent to backtest' : 'Saved view created', 'ok'));
      if (openBacktest) {
        nav(PG.BACKTEST, {
          screen_id: String(created.id),
          screen_name: created.name,
          sourcePage: 'screener',
          autorun: true,
        });
      }
    } catch (e) {
      addToast(toast('Failed to save view', 'err'));
    } finally {
      setSavingScreen(false);
    }
  };

  const visibleRows = React.useMemo(() => {
    const rows = results?.results || [];
    if (!basisFilter) return rows;
    return rows.filter((row) => row.benchmark_method === basisFilter);
  }, [basisFilter, results]);

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Screening Assumptions"
      description={`${activePlaybook?.label || 'This playbook'} uses this active assumption set for screening, saved views, and any downstream backtests.`}
    />
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <h3 style={{fontSize:'1rem'}}>Filter Builder</h3>
        <div style={{display:'flex',gap:'.5rem'}}>
          <button className="btn btn-sm" onClick={resetFilters}>Reset Filters</button>
          <button className="btn btn-sm" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-sm btn-p" onClick={run} disabled={loading}>{loading ? 'Running...' : 'Run Screen'}</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'.75rem'}}>
        <div className="fg"><label>Evidence Preset</label>
          <select value={preset} onChange={e => applyPreset(e.target.value)}>
            <option value="">None</option>
            <option value="quality_land">High-Quality Land</option>
            <option value="resilient_value">Resilient Value</option>
            <option value="irrigated_quality">Irrigated Quality</option>
            <option value="decision_ready">Decision-Ready Counties</option>
          </select>
        </div>
        <div className="fg"><label>Min Cap Rate</label><input type="number" step="0.1" value={minCap} onChange={e => setMinCap(e.target.value)} placeholder="e.g. 2.0"/></div>
        <div className="fg"><label>Max Rent Multiple</label><input type="number" step="1" value={maxRentMult} onChange={e => setMaxRentMult(e.target.value)} placeholder="e.g. 25"/></div>
        <div className="fg"><label>Min Access Score</label><input type="number" step="1" value={minAccess} onChange={e => setMinAccess(e.target.value)} placeholder="e.g. 50"/></div>
        <div className="fg"><label>Min Power Index</label><input type="number" step="1" value={minPowerIndex} onChange={e => setMinPowerIndex(e.target.value)} placeholder="e.g. 80"/></div>
        <div className="fg"><label>Max Power Price</label><input type="number" step="0.1" value={maxPowerPrice} onChange={e => setMaxPowerPrice(e.target.value)} placeholder="c/kWh"/></div>
        <div className="fg"><label>Max Drought Risk</label><input type="number" step="1" value={maxDroughtRisk} onChange={e => setMaxDroughtRisk(e.target.value)} placeholder="0-100, lower is safer"/></div>
        <div className="fg"><label>Max Flood Risk</label><input type="number" step="1" value={maxFloodRisk} onChange={e => setMaxFloodRisk(e.target.value)} placeholder="0-100, lower is safer"/></div>
        <div className="fg"><label>Min NRCS Farmland %</label><input type="number" step="1" value={minSoilFarmlandPct} onChange={e => setMinSoilFarmlandPct(e.target.value)} placeholder="0-100, higher is stronger"/></div>
        <div className="fg"><label>Z Cap Min</label><input type="number" step="0.1" value={zCapMin} onChange={e => setZCapMin(e.target.value)} placeholder="e.g. 1.0"/></div>
        <div className="fg"><label>Z Cap Max</label><input type="number" step="0.1" value={zCapMax} onChange={e => setZCapMax(e.target.value)} placeholder="e.g. 2.5"/></div>
        <div className="fg"><label>Z Fair Min</label><input type="number" step="0.1" value={zFairMin} onChange={e => setZFairMin(e.target.value)} placeholder="e.g. -1.0"/></div>
        <div className="fg"><label>Z Fair Max</label><input type="number" step="0.1" value={zFairMax} onChange={e => setZFairMax(e.target.value)} placeholder="e.g. 1.0"/></div>
        <div className="fg"><label>Z Rent Min</label><input type="number" step="0.1" value={zRentMin} onChange={e => setZRentMin(e.target.value)} placeholder="e.g. -0.5"/></div>
        <div className="fg"><label>Z Rent Max</label><input type="number" step="0.1" value={zRentMax} onChange={e => setZRentMax(e.target.value)} placeholder="e.g. 1.5"/></div>
        <div className="fg"><label>State</label><input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="e.g. IA"/></div>
        <div className="fg"><label>Benchmark Basis</label>
          <select value={basisFilter} onChange={e => setBasisFilter(e.target.value)}>
            <option value="">All basis types</option>
            <option value="county_observed">County observed</option>
            <option value="rent_multiple_proxy">Rent multiple proxy</option>
            <option value="mixed_fallback">Mixed county/state</option>
            <option value="state_fallback">State fallback</option>
            <option value="national_fallback">National fallback</option>
          </select>
        </div>
        <div className="fg"><label>Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="implied_cap_rate">Cap Rate</option>
            <option value="fair_value">Fair Value</option>
            <option value="cash_rent">Cash Rent</option>
            <option value="benchmark_value">Benchmark Value</option>
            <option value="access_score">Access Score</option>
            <option value="irrigated_ag_land_acres">Irrigated Acres</option>
            <option value="power_cost_index">Power Cost Index</option>
            <option value="industrial_power_price">Power Price</option>
            <option value="drought_risk_score">Drought Risk</option>
            <option value="flood_hazard_score">Flood Risk</option>
            <option value="soil_significant_farmland_share_pct">NRCS Farmland %</option>
            <option value="soil_rootzone_aws_100cm">AWS 100cm</option>
            <option value="noi_per_acre">NOI/Acre</option>
            <option value="rent_multiple">Rent Multiple</option>
          </select>
        </div>
        <div className="fg"><label>Saved View</label>
          <select value={selScreen} onChange={e => setSelScreen(e.target.value)}>
            <option value="">None</option>
            {availableScreens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{marginTop:'.85rem',paddingTop:'.85rem',borderTop:'1px solid var(--line)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',flexWrap:'wrap',marginBottom:'.55rem'}}>
          <div>
            <div style={{fontSize:'.78rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.18rem'}}>Saved View</div>
            <div style={{fontSize:'.8rem',color:'var(--text2)'}}>Save the playbook context, sort, notes, and reusable core metric filters that Atlas can reopen later.</div>
          </div>
          <div style={{display:'flex',gap:'.45rem',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={() => persistScreen(false)} disabled={savingScreen}>{savingScreen ? 'Saving...' : 'Save View'}</button>
            <button className="btn btn-sm btn-p" onClick={() => persistScreen(true)} disabled={savingScreen}>{savingScreen ? 'Saving...' : 'Save View + Backtest'}</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(220px,1.4fr) 1fr',gap:'.75rem',alignItems:'start'}}>
          <div className="fg" style={{margin:0}}>
            <label>View Name</label>
            <input type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="e.g. Defensive Midwest Income View"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>View Notes</label>
            <input type="text" value={screenNotes} onChange={e => setScreenNotes(e.target.value)} placeholder="Optional context for future reopening or sync"/>
          </div>
        </div>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center'}}>
          <span className="badge badge-b">PLAYBOOK {(activePlaybook?.shortLabel || 'Farmland Income').toUpperCase()}</span>
          {activeAssumptionSet && <span className="badge badge-a">MODEL {activeAssumptionSet.name} v{activeAssumptionSet.version}</span>}
        </div>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center',marginTop:'.55rem'}}>
            {reusableFilters.length > 0
              ? reusableFilters.map((filter, idx) => <span key={`${filter.metric}-${idx}`} className="badge badge-g">{filter.metric} {filter.op} {filter.value}</span>)
              : <span className="badge badge-r">NO REUSABLE CORE FILTERS SET</span>}
            {liveOnlyFilters.length > 0 && <span className="badge badge-a">LIVE-ONLY: {liveOnlyFilters.join(' • ')}</span>}
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text2)',marginTop:'.45rem'}}>
          Saved views now keep the playbook, notes, sort order, active model basis, and full Screener state for reopening. Backtest still reuses the core metric filters only, because historical replay is not yet wired to every live-only screen control.
        </div>
      </div>
    </div>

    {err && <ErrBox title="Screener Error" msg={err}/>}

    {results && <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <h3 style={{fontSize:'1rem'}}>Results ({basisFilter ? `${visibleRows.length} of ${results.count}` : results.count} counties)</h3>
        <span className="badge badge-b">as of {results.as_of}</span>
      </div>
      <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.45rem',maxWidth:'980px'}}>
        Atlas is showing an underwriting benchmark for the current land lens in each county, not a whole-county urban appraisal. Rows tagged <strong style={{color:'var(--text1)'}}>PROXY</strong> derive benchmark value from county cash rent multiplied by the state land-value rent multiple when direct county land value is unavailable.
      </div>
      <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.55rem',maxWidth:'980px'}}>
        Irrigated acreage is a USDA Census water-footprint layer. Atlas carries the latest census baseline forward between census years so it remains visible in current screening views.
      </div>
      <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.55rem',maxWidth:'980px'}}>
        NRCS farmland and soil-water fields are county-weighted from the official SSURGO survey areas that overlap each county. Use NRCS Farmland % as a land-quality screen and AWS 100cm as a soil moisture-buffering signal.
      </div>
      <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.55rem',maxWidth:'980px'}}>
        New screener presets are evidence-aware, not synthetic. They simply prefill real Atlas filters for land quality, hazard burden, irrigation footprint, and decision-readiness so an analyst can get to a defendable first pass faster.
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
          {key:'county',label:'County',fmt:(_,r) => <div>
            <div>{r.county}</div>
            <div style={{fontSize:'.7rem',color:'var(--text2)',marginTop:'.18rem'}}>{r._why?.reasons?.[0] || 'County-level underwriting row'}</div>
          </div>},
          {key:'state',label:'ST'},
          {key:'_read',label:'Read',sortable:false,fmt:(_,r) => <span className={`badge ${r._why?.overall?.className || 'badge-a'}`}>{r._why?.overall?.label || 'N/A'}</span>},
          {key:'source_quality',label:'Data',fmt:(v,r) => {
            const badge = sourceBand(v);
            return <span className={`badge ${badge.className}`} title={r.benchmark_method_detail || r.source_quality_detail || 'Source quality detail unavailable.'}>{badge.label}</span>;
          }},
          {key:'benchmark_method',label:'Basis',fmt:(v,r) => {
            const badge = benchmarkMethodBand(v);
            return <span className={`badge ${badge.className}`} title={r.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{badge.label}</span>;
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
          {key:'_bv',label:'Benchmark Value',num:true,fmt:(_,r) => <span title={r.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{$$(r.metrics?.benchmark_value)}</span>},
          {key:'_noi',label:'NOI/ac',num:true,fmt:(_,r) => $$(r.metrics?.noi_per_acre)},
          {key:'_cap',label:'Cap Rate',num:true,fmt:(_,r) => $pct(r.metrics?.implied_cap_rate)},
          {key:'_fv',label:'Fair Value',num:true,fmt:(_,r) => $$(r.metrics?.fair_value)},
          {key:'_spread',label:'Spread',num:true,fmt:(_,r) => {
            const v = r._spread;
            return v == null ? '--' : <span className={v > 0 ? 'pos' : 'neg'}>{$chg(v)}</span>;
          }},
          {key:'_rm',label:'Rent Mult',num:true,fmt:(_,r) => $(r.metrics?.rent_multiple,1)},
          {key:'_access',label:'Access',num:true,fmt:(_,r) => $(r.metrics?.access_score,1)},
          {key:'_drought',label:'Drought',num:true,fmt:(_,r) => {
            const badge = droughtRiskBand(r.drought);
            return <span className={`badge ${badge.className}`} title={r.drought?.summary || 'FEMA drought evidence not loaded yet.'}>{badge.label}</span>;
          }},
          {key:'_agloss',label:'Drought Ag Loss %',num:true,fmt:(_,r) => $pct(r.drought?.ag_loss_rate_pct)},
          {key:'_flood',label:'Flood',num:true,fmt:(_,r) => {
            const badge = floodRiskBand(r.flood);
            return <span className={`badge ${badge.className}`} title={r.flood?.summary || 'FEMA flood evidence not loaded yet.'}>{badge.label}</span>;
          }},
          {key:'_flood_agloss',label:'Flood Ag Loss %',num:true,fmt:(_,r) => $pct(r.flood?.ag_loss_rate_pct)},
          {key:'_irrigated',label:'Irrigated Acres',num:true,fmt:(_,r) => <span title={r.irrigation?.summary || 'USDA irrigation footprint not loaded yet.'}>{$int(r.irrigation?.irrigated_acres)}</span>},
          {key:'_soil_share',label:'NRCS Farmland %',num:true,fmt:(_,r) => <span title={r.soil?.summary || 'NRCS soil evidence not loaded yet.'}>{$pct(r.soil?.significant_share_pct)}</span>},
          {key:'_soil_aws100',label:'AWS 100cm',num:true,fmt:(_,r) => <span title={r.soil?.summary || 'NRCS soil evidence not loaded yet.'}>{$(r.soil?.rootzone_aws_100cm,1)}</span>},
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
          {key:'_why_detail',label:'Why',sortable:false,fmt:(_,r) => <div style={{fontSize:'.74rem',lineHeight:1.45,color:'var(--text2)',minWidth:'260px'}}>
            {(r._why?.reasons || []).slice(0, 3).map((reason, idx) => <div key={idx}>• {reason}</div>)}
          </div>},
          {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r) => <div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.COUNTY, {fips:r.fips}); }}>View</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav(PG.SCENARIO, workflowParams(r)); }}>Scenario</button>
          </div>},
        ]}
      rows={visibleRows.map(r => {
        const fair = r.metrics?.fair_value;
        const benchmark = r.metrics?.benchmark_value;
        const spread = fair != null && benchmark != null && benchmark > 0
          ? ((fair - benchmark) / benchmark) * 100
          : null;
        const why = buildScreenReasons(r, activeScreenFilters);
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
            _flood:r.flood?.hazard_score,
            _flood_agloss:r.flood?.ag_loss_rate_pct,
            _irrigated:r.irrigation?.irrigated_acres,
            _soil_share:r.soil?.significant_share_pct,
            _soil_aws100:r.soil?.rootzone_aws_100cm,
            _industrial_lineage:r.industrial?.lineage,
            _pidx:r.industrial?.power_cost_index,
            _ppx:r.industrial?.industrial_power_price,
            _zcap:r.zscores?.implied_cap_rate?.zscore,
            _zfv:r.zscores?.fair_value?.zscore,
            _zrent:r.zscores?.cash_rent?.zscore,
            _read:why.overall?.label,
            _why:why,
            _why_detail:why.reasons?.join(' • '),
            _workflow:r.fips,
          };
        })}
        stickyHeader={true}
        onRow={r => nav(PG.COUNTY, {fips:r.fips})}
      />
    </div>}
  </div>;
}
