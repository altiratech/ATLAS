import { API, PG } from '../config.js';
import {
  industrialPowerSummaryBand,
  productivitySummaryBand,
  toast,
} from '../formatting.js';
import { api } from '../auth.js';
import { appendAssumptionParam, AssumptionContextBar } from '../shared/assumptions-ui.jsx';
import {
  DEFAULT_SCREENER_ROW_COLORING,
  DEFAULT_SCREENER_VISIBLE_COLUMNS,
  getDefaultScreenerViewState,
  getScreenerColumns,
  getScreenerRowAccent,
  hydrateScreenerRows,
  ScreenerRecordPanel,
} from '../shared/screener-grid.jsx';
import { getThesisLensesForPlaybook, thesisBadgeClass } from '../shared/thesis-lenses.js';
import { ErrBox } from '../shared/system.jsx';
import { DataGrid } from '../shared/data-ui.jsx';

function asInputValue(value) {
  return value == null ? '' : String(value);
}

function findFilterValue(filters, metric, op) {
  return filters.find((filter) => filter.metric === metric && filter.op === op)?.value;
}

const SCREENER_CORE_FILTER_DEFS = [
  {
    id: 'implied_cap_rate_min',
    metric: 'implied_cap_rate',
    op: '>',
    label: 'Min Cap Rate',
    shortLabel: 'Cap Rate',
    placeholder: 'e.g. 2.0',
    step: '0.1',
    queryParam: 'min_cap',
  },
  {
    id: 'rent_multiple_max',
    metric: 'rent_multiple',
    op: '<',
    label: 'Max Rent Multiple',
    shortLabel: 'Rent Multiple',
    placeholder: 'e.g. 25',
    step: '1',
    queryParam: 'max_rent_mult',
  },
  {
    id: 'access_score_min',
    metric: 'access_score',
    op: '>',
    label: 'Min Access Score',
    shortLabel: 'Access Score',
    placeholder: 'e.g. 50',
    step: '1',
    queryParam: 'min_access',
  },
  {
    id: 'yield_productivity_factor_min',
    metric: 'yield_productivity_factor',
    op: '>',
    label: 'Min Yield Factor',
    shortLabel: 'Yield Factor',
    placeholder: 'e.g. 1.02',
    step: '0.01',
    queryParam: 'min_yield_factor',
  },
];

const SCREENER_PRESET_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'quality_land', label: 'High-Quality Land' },
  { value: 'resilient_value', label: 'Resilient Value' },
  { value: 'irrigated_quality', label: 'Irrigated Quality' },
  { value: 'decision_ready', label: 'Decision-Ready Counties' },
  { value: 'ag_transition_thesis', label: 'Ag Transition Thesis' },
  { value: 'resilient_production_base', label: 'Resilient Production Base' },
];

function getCoreFilterDefById(id) {
  return SCREENER_CORE_FILTER_DEFS.find((definition) => definition.id === id) || null;
}

function getCoreFilterDef(metric, op) {
  return SCREENER_CORE_FILTER_DEFS.find((definition) => definition.metric === metric && definition.op === op) || null;
}

function normalizeCoreFilters(filters) {
  return (filters || [])
    .filter((filter) => getCoreFilterDef(filter.metric, filter.op))
    .map((filter) => ({
      metric: filter.metric,
      op: filter.op,
      value: asInputValue(filter.value),
    }));
}

function buildDefaultCoreFilters() {
  return [];
}

function buildCoreQueryParams(filters) {
  const params = [];
  for (const filter of filters || []) {
    const definition = getCoreFilterDef(filter.metric, filter.op);
    const value = filter?.value;
    if (!definition || value == null || value === '') continue;
    params.push(`${definition.queryParam}=${encodeURIComponent(String(value))}`);
  }
  return params;
}

function getPresetOption(value) {
  return SCREENER_PRESET_OPTIONS.find((option) => option.value === value) || SCREENER_PRESET_OPTIONS[0];
}

function CoreFilterBuilder({ filters, onChange }) {
  const availableDefs = SCREENER_CORE_FILTER_DEFS.filter((definition) => !filters.some((filter) => filter.metric === definition.metric && filter.op === definition.op));

  const updateFilterValue = (index, nextValue) => {
    onChange(filters.map((filter, filterIndex) => (
      filterIndex === index ? { ...filter, value: nextValue } : filter
    )));
  };

  const updateFilterDefinition = (index, nextId) => {
    const definition = getCoreFilterDefById(nextId);
    if (!definition) return;
    onChange(filters.map((filter, filterIndex) => (
      filterIndex === index
        ? { metric: definition.metric, op: definition.op, value: '' }
        : filter
    )));
  };

  const removeFilter = (index) => {
    onChange(filters.filter((_, filterIndex) => filterIndex !== index));
  };

  const addFilter = () => {
    if (availableDefs.length === 0) return;
    const definition = availableDefs[0];
    onChange([
      ...filters,
      {
        metric: definition.metric,
        op: definition.op,
        value: '',
      },
    ]);
  };

  return <div className="sc" style={{ marginTop: 0, marginBottom: '.85rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.55rem' }}>
      <div>
        <div className="sc-l">Basic Filters</div>
        <div className="sc-c">Add the durable filters that define this screen. Atlas can save and reopen these later, but you only need a few to get started.</div>
      </div>
      <button className="btn btn-sm" onClick={addFilter} disabled={availableDefs.length === 0}>Add Filter</button>
    </div>

    {filters.length === 0 && <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}>
      No basic filters yet. Start with a starter screen or add one filter that defines the screen you care about.
    </div>}

    <div style={{ display: 'grid', gap: '.55rem' }}>
      {filters.map((filter, index) => {
        const definition = getCoreFilterDef(filter.metric, filter.op) || SCREENER_CORE_FILTER_DEFS[0];
        const rowDefs = [
          definition,
          ...availableDefs,
        ];
        return <div key={`${filter.metric}-${filter.op}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.2fr) 80px minmax(120px,1fr) auto', gap: '.45rem', alignItems: 'end' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Metric</label>
            <select value={definition.id} onChange={(e) => updateFilterDefinition(index, e.target.value)}>
              {rowDefs.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Rule</label>
            <input type="text" value={definition.op} readOnly />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Value</label>
            <input
              type="number"
              step={definition.step}
              value={filter.value}
              onChange={(e) => updateFilterValue(index, e.target.value)}
              placeholder={definition.placeholder}
            />
          </div>
          <button className="btn btn-sm" onClick={() => removeFilter(index)}>Remove</button>
        </div>;
      })}
    </div>
  </div>;
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
  activeThesis,
  activeThesisKey,
  setActiveThesisKey,
}) {
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [coreFilters, setCoreFilters] = React.useState(() => buildDefaultCoreFilters());
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
  const [showAdvancedControls, setShowAdvancedControls] = React.useState(false);
  const [runRequestKey, setRunRequestKey] = React.useState(0);
  const [gridViewState, setGridViewState] = React.useState(() => getDefaultScreenerViewState());
  const thesisLenses = React.useMemo(
    () => getThesisLensesForPlaybook(activePlaybookKey),
    [activePlaybookKey],
  );
  const lastAssumptionSetIdRef = React.useRef(activeAssumptionSetId);

  const requestRun = React.useCallback(() => {
    setRunRequestKey((value) => value + 1);
  }, []);

  const setPresetCoreFilters = React.useCallback((nextFilters) => {
    setCoreFilters(normalizeCoreFilters(nextFilters));
  }, []);

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
      setPresetCoreFilters([]);
      return;
    }
    if (value === 'quality_land') {
      setPresetCoreFilters([]);
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
      setPresetCoreFilters([
        { metric: 'implied_cap_rate', op: '>', value: '2.5' },
      ]);
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
      setPresetCoreFilters([]);
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
      setPresetCoreFilters([
        { metric: 'implied_cap_rate', op: '>', value: '2.5' },
        { metric: 'access_score', op: '>', value: '40' },
      ]);
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('60');
      setMaxFloodRisk('60');
      setMinSoilFarmlandPct('60');
      setSortBy('access_score');
      setSortDir('desc');
      return;
    }
    if (value === 'ag_transition_thesis') {
      setPresetCoreFilters([
        { metric: 'access_score', op: '>', value: '35' },
        { metric: 'yield_productivity_factor', op: '>', value: '1.02' },
      ]);
      setMinPowerIndex('45');
      setMaxPowerPrice('');
      setMaxDroughtRisk('75');
      setMaxFloodRisk('75');
      setMinSoilFarmlandPct('45');
      setSortBy('yield_productivity_factor');
      setSortDir('desc');
      return;
    }
    if (value === 'resilient_production_base') {
      setPresetCoreFilters([
        { metric: 'yield_productivity_factor', op: '>', value: '1.01' },
      ]);
      setMinPowerIndex('');
      setMaxPowerPrice('');
      setMaxDroughtRisk('50');
      setMaxFloodRisk('50');
      setMinSoilFarmlandPct('60');
      setSortBy('soil_rootzone_aws_100cm');
      setSortDir('desc');
    }
  }, [setPresetCoreFilters]);

  const applyThesisLens = React.useCallback((lensKey, shouldApplyDefaults = true) => {
    setActiveThesisKey?.(lensKey);
    if (!shouldApplyDefaults) return;
    const presetKey = thesisLenses.find((lens) => lens.key === lensKey)?.defaultPreset;
    if (presetKey) applyPreset(presetKey);
  }, [applyPreset, setActiveThesisKey, thesisLenses]);

  const resetFilters = React.useCallback(() => {
    setPreset('');
    setCoreFilters(buildDefaultCoreFilters());
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
    if (viewState.thesisKey) {
      setActiveThesisKey?.(viewState.thesisKey);
    }
    setScreenName(view?.name || '');
    setScreenNotes(view?.notes || '');
    setPreset(asInputValue(viewState.preset));
    setCoreFilters(normalizeCoreFilters(filters));
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
    if (
      viewState.minPowerIndex
      || viewState.maxPowerPrice
      || viewState.maxDroughtRisk
      || viewState.maxFloodRisk
      || viewState.minSoilFarmlandPct
      || viewState.zCapMin
      || viewState.zCapMax
      || viewState.zFairMin
      || viewState.zFairMax
      || viewState.zRentMin
      || viewState.zRentMax
      || viewState.state
      || viewState.basisFilter
    ) {
      setShowAdvancedControls(true);
    }
    setGridViewState({
      visibleColumns: Array.isArray(viewState.visibleColumns) && viewState.visibleColumns.length
        ? viewState.visibleColumns
        : (Array.isArray(view?.columns) && view.columns.length ? view.columns : DEFAULT_SCREENER_VISIBLE_COLUMNS),
      columnOrder: Array.isArray(viewState.columnOrder) && viewState.columnOrder.length ? viewState.columnOrder : null,
      groupBy: viewState.groupBy || '',
      rowColoring: viewState.rowColoring || DEFAULT_SCREENER_ROW_COLORING,
    });
    if (view?.assumption_set_id != null) {
      setActiveAssumptionSetId?.(String(view.assumption_set_id));
    }
  }, [setActiveAssumptionSetId, setActiveThesisKey]);

  React.useEffect(() => {
    if (params?.preset) applyPreset(params.preset);
    if (params?.thesisKey) setActiveThesisKey?.(params.thesisKey);
    if (params?.screen_id) setSelScreen(String(params.screen_id));
    if (params?.screen_name) setScreenName(params.screen_name);
    requestRun();
  }, [applyPreset, params?.preset, params?.screen_id, params?.screen_name, params?.thesisKey, requestRun, setActiveThesisKey]);

  React.useEffect(() => {
    if (!selScreen) return;
    const selected = screens.find((screen) => String(screen.id) === String(selScreen));
    if (selected) {
      applySavedView(selected);
      requestRun();
    }
  }, [applySavedView, requestRun, screens, selScreen]);

  const run = React.useCallback(() => {
    setLoading(true);
    setErr(null);
    let qs = `?sort_by=${sortBy}&sort_dir=${sortDir}`;
    const coreQueryParams = buildCoreQueryParams(coreFilters);
    if (coreQueryParams.length > 0) qs += `&${coreQueryParams.join('&')}`;
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
    coreFilters,
    maxPowerPrice,
    maxDroughtRisk,
    maxFloodRisk,
    minSoilFarmlandPct,
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
    if (runRequestKey === 0) return;
    run();
  }, [run, runRequestKey]);

  React.useEffect(() => {
    if (lastAssumptionSetIdRef.current !== activeAssumptionSetId) {
      lastAssumptionSetIdRef.current = activeAssumptionSetId;
      requestRun();
    }
  }, [activeAssumptionSetId, requestRun]);

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
    thesisKey: activeThesisKey,
    thesisLabel: activeThesis?.label,
    assetType: activeThesis?.assetType || activePlaybook?.assetType || 'agriculture_land',
    targetUseCase: activeThesis?.targetUseCase || activePlaybook?.targetUseCase || 'farmland_income',
  }), [activePlaybook, activePlaybookKey, activeThesis, activeThesisKey]);
  const reusableFilters = React.useMemo(() => {
    return (coreFilters || [])
      .map((filter) => ({
        metric: filter.metric,
        op: filter.op,
        value: Number(filter.value),
      }))
      .filter((filter) => Number.isFinite(filter.value));
  }, [coreFilters]);
  const coreFilterValues = React.useMemo(() => ({
    minCap: asInputValue(findFilterValue(coreFilters, 'implied_cap_rate', '>')),
    maxRentMult: asInputValue(findFilterValue(coreFilters, 'rent_multiple', '<')),
    minAccess: asInputValue(findFilterValue(coreFilters, 'access_score', '>')),
    minYieldFactor: asInputValue(findFilterValue(coreFilters, 'yield_productivity_factor', '>')),
  }), [coreFilters]);
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
    minCap: coreFilterValues.minCap,
    minAccess: coreFilterValues.minAccess,
    minYieldFactor: coreFilterValues.minYieldFactor,
    maxDroughtRisk,
    maxFloodRisk,
    minSoilFarmlandPct,
    minPowerIndex,
    maxPowerPrice,
  }), [coreFilterValues.minAccess, coreFilterValues.minCap, coreFilterValues.minYieldFactor, maxDroughtRisk, maxFloodRisk, maxPowerPrice, minPowerIndex, minSoilFarmlandPct]);
  const starterCards = activeThesis?.starterCards || [];
  const activePreset = getPresetOption(preset);
  const activeStarterCard = starterCards.find((card) => card.key === preset);
  const hasAdvancedFilters = liveOnlyFilters.length > 0;
  const hasReusableFilters = reusableFilters.length > 0;
  const canSaveView = hasReusableFilters && !savingScreen;

  const viewState = React.useMemo(() => ({
    preset,
    thesisKey: activeThesisKey,
    state: state.toUpperCase(),
    basisFilter,
    minYieldFactor: coreFilterValues.minYieldFactor,
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
    visibleColumns: gridViewState.visibleColumns,
    columnOrder: gridViewState.columnOrder,
    groupBy: gridViewState.groupBy,
    rowColoring: gridViewState.rowColoring,
  }), [
    basisFilter,
    gridViewState.columnOrder,
    gridViewState.groupBy,
    gridViewState.rowColoring,
    gridViewState.visibleColumns,
    maxDroughtRisk,
    maxFloodRisk,
    maxPowerPrice,
    coreFilterValues.minYieldFactor,
    minPowerIndex,
    minSoilFarmlandPct,
    preset,
    activeThesisKey,
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
          columns: gridViewState.visibleColumns,
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
  const screenRows = React.useMemo(
    () => hydrateScreenerRows(visibleRows, activeScreenFilters, activeThesisKey),
    [activeScreenFilters, activeThesisKey, visibleRows],
  );
  const screenerColumns = React.useMemo(
    () => getScreenerColumns({ nav, workflowParams }),
    [nav, workflowParams],
  );
  const handleGridSortChange = React.useCallback((nextSort) => {
    if (!nextSort?.key) return;
    setSortBy(nextSort.key);
    setSortDir(nextSort.dir || 'desc');
  }, []);
  const renderRecordPanel = React.useCallback(
    (row) => <ScreenerRecordPanel row={row} nav={nav} workflowParams={workflowParams} />,
    [nav, workflowParams],
  );

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Screening Assumptions"
      description={`${activePlaybook?.label || 'This perspective'} uses this active assumption set for screening, saved views, and any downstream backtests.`}
    />

    <div className="card hero-card" style={{ marginBottom: '.9rem' }}>
      <div className="hero-k">Screener</div>
      <h2 className="hero-h">{activePlaybook?.label || 'Farmland Income'} Screening</h2>
      <p className="hero-p">
        Start with one strong screen, run it, then open the best counties and move the defensible ones into research. Atlas should help you get to a result quickly before you refine anything.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.55rem', marginBottom: '.85rem' }}>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Starter Screen</div>
          <div style={{ fontSize: '.92rem', fontWeight: 600 }}>{activeStarterCard?.title || activePreset.label || 'Choose a starter screen'}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: '.22rem' }}>
            {activeStarterCard?.body || activeThesis?.question || 'Choose a starter screen or set a few filters to define this pass.'}
          </div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Basic Filters</div>
          <div className="sc-v" style={{ fontSize: '.95rem' }}>{reusableFilters.length}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)' }}>
            {hasAdvancedFilters ? `${liveOnlyFilters.length} optional refinements layered on this pass.` : 'No optional refinements applied yet.'}
          </div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Best Next Move</div>
          <div style={{ fontSize: '.82rem', color: 'var(--text1)', lineHeight: 1.35 }}>
            Pick a starter screen, add one or two basic filters if needed, then run the screen and open one county from the results.
          </div>
        </div>
      </div>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={run} disabled={loading}>{loading ? 'Running...' : 'Run Screen'}</button>
        <button className="btn" onClick={resetFilters}>Reset Filters</button>
        {results && <button className="btn" onClick={exportCSV}>Export CSV</button>}
      </div>
      <div style={{ fontSize: '.74rem', color: 'var(--text2)', marginTop: '.45rem' }}>
        Atlas reruns the grid when you press <strong style={{ color: 'var(--text1)' }}>Run Screen</strong>. That keeps filter changes, saved-view setup, and current results easier to reason about.
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(320px,.9fr)', gap: '.9rem', marginBottom: '.9rem', alignItems: 'start' }}>
      <div className="card">
        <div style={{ marginBottom: '.7rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Step 1: Start With A Screen</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
            Choose the active thesis frame, then use one starter screen or one preset to create a defendable first pass quickly.
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'.75rem', marginBottom:'.85rem' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Thesis Lens</label>
            <select value={activeThesisKey || ''} onChange={e => applyThesisLens(e.target.value, true)}>
              {thesisLenses.map((lens) => <option key={lens.key} value={lens.key}>{lens.label}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Evidence Preset</label>
            <select value={preset} onChange={e => applyPreset(e.target.value)}>
              {SCREENER_PRESET_OPTIONS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        {starterCards.length > 0 && <div style={{ display:'grid', gap:'.55rem', marginBottom:'.85rem' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>
            Starter Screens
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'.55rem' }}>
            {starterCards.map((card) => {
              const active = preset === card.key;
              return <button
                key={card.key}
                type="button"
                onClick={() => applyPreset(card.key)}
                className={`btn ${active ? 'btn-p' : ''}`}
                style={{ textAlign:'left', justifyContent:'flex-start', minHeight:'96px', whiteSpace:'normal', lineHeight:1.35 }}
              >
                <div>
                  <div style={{ fontSize: '.84rem', fontWeight: 700, marginBottom: '.28rem' }}>{card.title}</div>
                  <div style={{ fontSize: '.74rem', color: active ? 'var(--bg0)' : 'var(--text2)' }}>{card.body}</div>
                </div>
              </button>;
            })}
          </div>
        </div>}
        <div style={{ marginBottom: '.7rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Step 2: Set Basic Filters</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
            Add one or two durable filters if you want to tighten the starter screen before running it.
          </div>
        </div>
        <CoreFilterBuilder filters={coreFilters} onChange={setCoreFilters} />
      </div>

      <div className="card">
        <div style={{ marginBottom: '.7rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Optional: Reopen Or Refine</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
            Resume a saved screen, or open the advanced controls only if the starter screen still needs more shaping.
          </div>
        </div>
        <div className="fg" style={{ marginBottom: '.75rem' }}>
          <label>Saved View</label>
          <select value={selScreen} onChange={e => setSelScreen(e.target.value)}>
            <option value="">None</option>
            {availableScreens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="sc" style={{ marginTop: 0, marginBottom: '.75rem' }}>
          <div className="sc-l">Current Lens</div>
          <div className="sc-v" style={{ fontSize: '.92rem' }}>{activeThesis?.label || 'No active thesis lens'}</div>
          <div className="sc-c">{activeThesis?.question || 'Choose a thesis lens to frame this screen.'}</div>
        </div>
        <div className="sc" style={{ marginTop: 0, marginBottom: 0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:'.75rem', alignItems:'center', flexWrap:'wrap', marginBottom:'.45rem' }}>
            <div>
              <div className="sc-l">Step 3: Refine This Pass</div>
              <div className="sc-c">
                Advanced controls are optional. Open these only when the starter screen and basic filters are not enough.
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setShowAdvancedControls((value) => !value)}>
              {showAdvancedControls ? 'Hide Advanced Controls' : 'Show Advanced Controls'}
            </button>
          </div>
          {!showAdvancedControls && <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}>
            {hasAdvancedFilters ? `Active refinements: ${liveOnlyFilters.join(' • ')}` : 'No advanced refinements applied yet.'}
          </div>}
          {showAdvancedControls && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'.75rem'}}>
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
                <option value="yield_productivity_factor">Yield Factor</option>
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
          </div>}
        </div>
      </div>
    </div>

    {err && <ErrBox title="Screener Error" msg={err}/>}

    {results && <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.7rem',gap:'.75rem',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.18rem'}}>Results ({basisFilter ? `${visibleRows.length} of ${results.count}` : results.count} counties)</h3>
          <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Open a county from the grid or the side panel, then decide whether it belongs in Research.</div>
        </div>
        <span className="badge badge-b">as of {results.as_of}</span>
      </div>
      <div className="sc" style={{ marginTop: 0, marginBottom: '.75rem' }}>
        <div className="sc-l">How To Read This Screen</div>
        <div style={{ fontSize: '.76rem', color: 'var(--text2)', lineHeight: 1.5 }}>
          <div style={{ marginBottom: '.28rem' }}>Atlas is showing one underwriting benchmark per county for the current land lens, not a whole-county urban appraisal.</div>
          <div style={{ marginBottom: '.28rem' }}>Rows tagged <strong style={{ color: 'var(--text1)' }}>PROXY</strong> derive benchmark value from county cash rent multiplied by the state land-value rent multiple when direct county land value is unavailable.</div>
          {activeThesis && <div>Active lens <strong style={{ color: 'var(--text1)' }}>{activeThesis.label}</strong> uses current Atlas proxies only. Missing inputs such as {activeThesis.gapSignals.join(', ')} are not being faked into the screen.</div>}
        </div>
      </div>
      {results.as_of_meta && <div style={{marginBottom:'.65rem',display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
        <span className="badge badge-b">PERSPECTIVE {(activePlaybook?.shortLabel || 'Farmland Income').toUpperCase()}</span>
        {activeThesis && <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>LENS {activeThesis.shortLabel.toUpperCase()}</span>}
        <span className={`badge ${results.as_of_meta.coverage_pct >= 0.7 ? 'badge-g' : 'badge-r'}`}>
          COVERAGE {Math.round((results.as_of_meta.coverage_pct || 0) * 100)}%
        </span>
        {screenerProductivity.total_count > 0 && <span className={`badge ${screenerProductivityBadge.className}`}>{screenerProductivityBadge.label}</span>}
        {screenerIndustrial.total_count > 0 && <span className={`badge ${screenerIndustrialBadge.className}`}>{screenerIndustrialBadge.label}</span>}
        <span className="badge badge-a">COUNTY-BACKED ROWS PREFERRED</span>
        {(results.as_of_meta.warnings || []).map(w => <span key={w} className="badge badge-r">{w}</span>)}
      </div>}
      <DataGrid
        columns={screenerColumns}
        rows={screenRows}
        rowKey="fips"
        stickyHeader={true}
        viewConfig={gridViewState}
        onViewChange={setGridViewState}
        sort={{ key: sortBy, dir: sortDir }}
        onSortChange={handleGridSortChange}
        rowColorFn={(row) => getScreenerRowAccent(row, gridViewState.rowColoring)}
        rowColorOptions={[
          { value: 'atlas_read', label: 'Atlas Read' },
          { value: 'none', label: 'None' },
        ]}
        renderRecordPanel={renderRecordPanel}
        emptyMessage="No counties matched the current filters."
      />

      <div className="card" style={{ marginTop: '.85rem', background: 'var(--bg1)' }}>
        <div style={{ marginBottom: '.7rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Step 4: Save This Screen</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
            If this screen is worth reusing, name it and save the durable filters. Backtest can replay only those durable filters later.
          </div>
        </div>
        <div className="fg" style={{marginBottom: '.65rem'}}>
          <label>View Name</label>
          <input type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="e.g. Defensive Midwest Income View"/>
        </div>
        <div className="fg" style={{marginBottom: 0}}>
          <label>View Notes</label>
          <input type="text" value={screenNotes} onChange={e => setScreenNotes(e.target.value)} placeholder="Optional context for future reopening or sync"/>
        </div>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center',marginTop:'.75rem'}}>
          <span className="badge badge-b">PERSPECTIVE {(activePlaybook?.shortLabel || 'Farmland Income').toUpperCase()}</span>
          {activeThesis && <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>LENS {activeThesis.shortLabel.toUpperCase()}</span>}
          {activeAssumptionSet && <span className="badge badge-a">MODEL {activeAssumptionSet.name} v{activeAssumptionSet.version}</span>}
        </div>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center',marginTop:'.55rem'}}>
          {hasReusableFilters
            ? reusableFilters.map((filter, idx) => <span key={`${filter.metric}-${idx}`} className="badge badge-g">{filter.metric} {filter.op} {filter.value}</span>)
            : <span className="badge">ADD ONE BASIC FILTER TO SAVE THIS SCREEN</span>}
          {hasAdvancedFilters && <span className="badge badge-a">OPTIONAL REFINEMENTS: {liveOnlyFilters.join(' • ')}</span>}
        </div>
        <div className="rw-actions">
          <button className="btn btn-sm" onClick={() => persistScreen(false)} disabled={!canSaveView}>{savingScreen ? 'Saving...' : 'Save View'}</button>
          <button className="btn btn-sm btn-p" onClick={() => persistScreen(true)} disabled={!canSaveView}>{savingScreen ? 'Saving...' : 'Save View + Backtest'}</button>
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text2)',marginTop:'.25rem'}}>
          {hasReusableFilters
            ? 'Saved views keep the perspective, lens, notes, sort order, active model basis, and full Screener state for reopening.'
            : 'Backtest and saved-view replay only work from the durable filters above, so Atlas needs at least one basic filter before this screen becomes reusable.'}
        </div>
      </div>
    </div>}
  </div>;
}
