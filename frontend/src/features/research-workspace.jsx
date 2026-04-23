import { PG, RESEARCH_GRID_VIEW_KEY } from '../config.js';
import { $, $$, $int, $pct, benchmarkMethodBand, droughtRiskBand, floodRiskBand, sourceBand, parseTags, toast } from '../formatting.js';
import {
  api,
  defaultResearchRecord,
  fetchResearchWorkspaces,
  normalizeResearchRecord,
} from '../auth.js';
import { appendAssumptionParam, assumptionSetLabel, summarizeScenarioAssumptions } from '../shared/assumptions-ui.jsx';
import { evaluateAtlasCountyRead, evaluateAtlasThesisSupport } from '../shared/atlas-read.js';
import {
  DataGrid,
  CountyPicker,
} from '../shared/data-ui.jsx';
import {
  getDefaultResearchViewState,
  getResearchColumns,
  getResearchRowAccent,
  hydrateResearchRows,
  ResearchRecordPanel,
} from '../shared/research-grid.jsx';
import { persistGridViewState, readStoredGridViewState } from '../shared/grid-view-state.js';
import { getThesisLens, getThesisLensesForPlaybook, thesisBadgeClass } from '../shared/thesis-lenses.js';
import { ActionEmptyState, ErrBox, Loading } from '../shared/system.jsx';

export function ResearchWorkspace({
  addToast,
  nav,
  params,
  researchUser,
  activeAssumptionSet,
  activeAssumptionSetId,
  activePlaybookKey,
  setActivePlaybookKey,
  activeThesis,
  activeThesisKey,
  setActiveThesisKey,
}) {
  const [store, setStore] = React.useState({});
  const [storeLoading, setStoreLoading] = React.useState(true);
  const [storeErr, setStoreErr] = React.useState(null);
  const [counties, setCounties] = React.useState([]);
  const [county, setCounty] = React.useState(params?.fips || '');
  const [researchSearch, setResearchSearch] = React.useState('');
  const [researchStatusFilter, setResearchStatusFilter] = React.useState('');
  const [researchThesisFilter, setResearchThesisFilter] = React.useState('');
  const [researchViewConfig, setResearchViewConfig] = React.useState(() => readStoredGridViewState(RESEARCH_GRID_VIEW_KEY, getDefaultResearchViewState));
  const [thesis, setThesis] = React.useState('');
  const [tagsInput, setTagsInput] = React.useState('');
  const [status, setStatus] = React.useState('exploring');
  const [conviction, setConviction] = React.useState(50);
  const [noteInput, setNoteInput] = React.useState('');
  const [bullCase, setBullCase] = React.useState('');
  const [bearCase, setBearCase] = React.useState('');
  const [keyRisksInput, setKeyRisksInput] = React.useState('');
  const [catalystsInput, setCatalystsInput] = React.useState('');
  const [decisionState, setDecisionState] = React.useState('exploring');
  const [assetType, setAssetType] = React.useState('');
  const [targetUseCase, setTargetUseCase] = React.useState('');
  const [thesisLensKey, setThesisLensKey] = React.useState(activeThesisKey || '');
  const [criticalDependenciesInput, setCriticalDependenciesInput] = React.useState('');
  const [missingDataNotesInput, setMissingDataNotesInput] = React.useState('');
  const [approvalState, setApprovalState] = React.useState('');
  const [scenarioRuns, setScenarioRuns] = React.useState([]);
  const [countySummary, setCountySummary] = React.useState(null);
  const [countySummaryLoading, setCountySummaryLoading] = React.useState(false);
  const [trackedSources, setTrackedSources] = React.useState([]);
  const [trackedSourcesLoading, setTrackedSourcesLoading] = React.useState(false);
  const [trackedSourcesErr, setTrackedSourcesErr] = React.useState(null);
  const [sourceUrlInput, setSourceUrlInput] = React.useState('');
  const [sourceTitleInput, setSourceTitleInput] = React.useState('');
  const [sourceTypeInput, setSourceTypeInput] = React.useState('operator_or_news');
  const [sourceSaving, setSourceSaving] = React.useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = React.useState(null);
  const workspaceRecord = county ? normalizeResearchRecord(store[county]) : null;
  const currentPlaybookKey = workspaceRecord?.playbook_key || params?.playbookKey || activePlaybookKey;
  const thesisLenses = React.useMemo(
    () => getThesisLensesForPlaybook(currentPlaybookKey),
    [currentPlaybookKey],
  );

  const statuses = [
    { value:'exploring', label:'Exploring' },
    { value:'watch', label:'Watchlist Candidate' },
    { value:'diligence', label:'In Diligence' },
    { value:'high_conviction', label:'High Conviction' },
    { value:'pass', label:'Pass' },
    { value:'active', label:'Active Position' },
  ];
  const sourceTypeOptions = [
    { value:'operator_or_news', label:'Operator / News' },
    { value:'county_economic_development', label:'County EDC' },
    { value:'planning_or_zoning', label:'Planning / Zoning' },
    { value:'state_agriculture_or_water', label:'State Ag / Water' },
    { value:'utility_or_power', label:'Utility / Power' },
    { value:'other', label:'Other' },
  ];

  const loadStore = React.useCallback(() => {
    setStoreLoading(true);
    setStoreErr(null);
    fetchResearchWorkspaces()
      .then(setStore)
      .catch((e) => {
        setStore({});
        setStoreErr(e.message || 'Failed to load research workspaces');
      })
      .finally(() => setStoreLoading(false));
  }, []);

  const loadTrackedSources = React.useCallback((geoKey = county) => {
    if (!geoKey) {
      setTrackedSources([]);
      setTrackedSourcesErr(null);
      setTrackedSourcesLoading(false);
      return Promise.resolve([]);
    }
    setTrackedSourcesLoading(true);
    setTrackedSourcesErr(null);
    return api(`/research/workspaces/${geoKey}/sources`)
      .then((rows) => {
        const nextRows = Array.isArray(rows) ? rows : [];
        setTrackedSources(nextRows);
        return nextRows;
      })
      .catch((e) => {
        setTrackedSources([]);
        setTrackedSourcesErr(e.message || 'Failed to load tracked sources');
        return [];
      })
      .finally(() => setTrackedSourcesLoading(false));
  }, [county]);

  React.useEffect(() => {
    api('/counties').then(setCounties).catch(() => setCounties([]));
    loadStore();
  }, [loadStore, researchUser]);

  React.useEffect(() => {
    if (params?.fips) setCounty(params.fips);
  }, [params?.fips]);

  React.useEffect(() => {
    if (!county) {
      const base = defaultResearchRecord();
      setThesis(base.thesis);
      setTagsInput('');
      setStatus(base.status);
      setConviction(base.conviction);
      setNoteInput('');
      setBullCase(base.analysis.bull_case);
      setBearCase(base.analysis.bear_case);
      setKeyRisksInput(base.analysis.key_risks.join(', '));
      setCatalystsInput(base.analysis.catalysts.join(', '));
      setDecisionState(base.analysis.decision_state);
      setAssetType(base.analysis.asset_type);
      setTargetUseCase(base.analysis.target_use_case);
      setThesisLensKey(params?.thesisKey || activeThesisKey || '');
      setCriticalDependenciesInput(base.analysis.critical_dependencies.join(', '));
      setMissingDataNotesInput(base.analysis.missing_data_notes.join(', '));
      setApprovalState(base.analysis.approval_state);
      setScenarioRuns([]);
      return;
    }
    if (!store[county]) {
      const base = defaultResearchRecord();
      setThesis(base.thesis);
      setTagsInput('');
      setStatus(base.status);
      setConviction(base.conviction);
      setNoteInput('');
      setBullCase(base.analysis.bull_case);
      setBearCase(base.analysis.bear_case);
      setKeyRisksInput(base.analysis.key_risks.join(', '));
      setCatalystsInput(base.analysis.catalysts.join(', '));
      setDecisionState(base.analysis.decision_state);
      setAssetType(params?.assetType || 'agriculture_land');
      setTargetUseCase(params?.targetUseCase || 'farmland_investment');
      setThesisLensKey(params?.thesisKey || activeThesisKey || '');
      setCriticalDependenciesInput(base.analysis.critical_dependencies.join(', '));
      setMissingDataNotesInput(base.analysis.missing_data_notes.join(', '));
      setApprovalState(base.analysis.approval_state);
      return;
    }
    const rec = normalizeResearchRecord(store[county]);
    setThesis(rec.thesis);
    setTagsInput(rec.tags.join(', '));
    setStatus(rec.status);
    setConviction(rec.conviction);
    setNoteInput('');
    setBullCase(rec.analysis?.bull_case || '');
    setBearCase(rec.analysis?.bear_case || '');
    setKeyRisksInput((rec.analysis?.key_risks || []).join(', '));
    setCatalystsInput((rec.analysis?.catalysts || []).join(', '));
    setDecisionState(rec.analysis?.decision_state || 'exploring');
    setAssetType(rec.analysis?.asset_type || '');
    setTargetUseCase(rec.analysis?.target_use_case || '');
    setThesisLensKey(rec.analysis?.thesis_lens_key || params?.thesisKey || activeThesisKey || '');
    setCriticalDependenciesInput((rec.analysis?.critical_dependencies || []).join(', '));
    setMissingDataNotesInput((rec.analysis?.missing_data_notes || []).join(', '));
    setApprovalState(rec.analysis?.approval_state || '');
  }, [county, store, params?.assetType, params?.targetUseCase, params?.thesisKey, activeThesisKey]);

  React.useEffect(() => {
    if (currentPlaybookKey && currentPlaybookKey !== activePlaybookKey) {
      setActivePlaybookKey?.(currentPlaybookKey);
    }
  }, [activePlaybookKey, currentPlaybookKey, setActivePlaybookKey]);

  React.useEffect(() => {
    if (thesisLensKey && thesisLensKey !== activeThesisKey) {
      setActiveThesisKey?.(thesisLensKey);
    }
  }, [activeThesisKey, setActiveThesisKey, thesisLensKey]);

  React.useEffect(() => {
    persistGridViewState(RESEARCH_GRID_VIEW_KEY, researchViewConfig);
  }, [researchViewConfig]);

  React.useEffect(() => {
    if (!county) return;
    api(`/research/workspaces/${county}/scenario-runs`)
      .then(setScenarioRuns)
      .catch(() => setScenarioRuns([]));
  }, [county, store[county]?.updated_at]);

  React.useEffect(() => {
    if (!county) {
      setTrackedSources([]);
      setTrackedSourcesErr(null);
      setTrackedSourcesLoading(false);
      return;
    }
    loadTrackedSources(county);
  }, [county, loadTrackedSources]);

  React.useEffect(() => {
    setSourceUrlInput('');
    setSourceTitleInput('');
    setSourceTypeInput('operator_or_news');
    setRefreshingSourceId(null);
  }, [county]);

  React.useEffect(() => {
    if (!county) {
      setCountySummary(null);
      setCountySummaryLoading(false);
      return;
    }
    let cancelled = false;
    setCountySummaryLoading(true);
    api(appendAssumptionParam(`/geo/${county}/summary`, activeAssumptionSetId))
      .then((summary) => {
        if (!cancelled) setCountySummary(summary);
      })
      .catch(() => {
        if (!cancelled) setCountySummary(null);
      })
      .finally(() => {
        if (!cancelled) setCountySummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [county, activeAssumptionSetId]);

  const countyMap = React.useMemo(
    () => Object.fromEntries(counties.map(c => [c.fips, `${c.name}, ${c.state}`])),
    [counties]
  );
  const getCountyContext = React.useCallback((fips) => {
    const label = countyMap[fips] || '';
    const parts = label ? String(label).split(',') : [];
    if (parts.length >= 2) {
      return {
        countyName: parts.slice(0, -1).join(',').trim(),
        state: parts.at(-1)?.trim() || '',
      };
    }
    return {
      countyName: fips === county ? params?.countyName || fips : (label || fips),
      state: fips === county ? params?.state || '' : '',
    };
  }, [county, countyMap, params?.countyName, params?.state]);
  const researchRowColorOptions = React.useMemo(() => [
    { value: 'status', label: 'Status' },
    { value: 'conviction', label: 'Conviction' },
    { value: 'thesis_lens', label: 'Thesis Lens' },
    { value: 'none', label: 'None' },
  ], []);

  const active = workspaceRecord || defaultResearchRecord();
  const latestScenarioRun = scenarioRuns[0] || null;
  const latestComparisonTable = Array.isArray(latestScenarioRun?.comparison?.comparison_table) ? latestScenarioRun.comparison.comparison_table : [];
  const latestBaseScenario = latestComparisonTable.find((row) => /base/i.test(row.scenario || '')) || latestComparisonTable[0] || null;
  const latestBestScenario = latestComparisonTable.length
    ? [...latestComparisonTable].sort((a, b) => (b.delta_fair_value_vs_base ?? Number.NEGATIVE_INFINITY) - (a.delta_fair_value_vs_base ?? Number.NEGATIVE_INFINITY))[0]
    : null;
  const latestWorstScenario = latestComparisonTable.length
    ? [...latestComparisonTable].sort((a, b) => (a.delta_fair_value_vs_base ?? Number.POSITIVE_INFINITY) - (b.delta_fair_value_vs_base ?? Number.POSITIVE_INFINITY))[0]
    : null;
  const latestDriverDecomposition = Array.isArray(latestScenarioRun?.comparison?.driver_decomposition) ? latestScenarioRun.comparison.driver_decomposition : [];
  const latestScenarioAcquisitionInputs = readAcquisitionInputs(latestScenarioRun);
  const latestScenarioCreditInputs = readCreditInputs(latestScenarioRun);
  const latestScenarioAcquisition = readAcquisitionSnapshot(latestScenarioRun, latestBaseScenario);
  const latestTopDriver = latestDriverDecomposition
    .map((entry) => ({ scenario: entry.scenario, driver: Array.isArray(entry.drivers) ? entry.drivers[0] : null }))
    .find((entry) => entry.driver?.driver && entry.driver?.delta != null) || null;
  const latestScenarioAssumptionSummary = summarizeScenarioAssumptions(latestScenarioRun?.assumptions);
  const selectedThesisLens = getThesisLens(thesisLensKey, currentPlaybookKey) || activeThesis || null;
  const selectedCountyLabel = county
    ? (countyMap[county] || (params?.countyName ? `${params.countyName}${params?.state ? `, ${params.state}` : ''}` : county))
    : 'None';
  const sourceLabel = params?.sourcePage === 'screener'
    ? 'Screener'
    : params?.sourcePage === 'county'
      ? 'County Detail'
      : '';
  const hasSavedWorkspace = county ? Object.prototype.hasOwnProperty.call(store, county) : false;
  const memoRequirements = React.useMemo(() => ([
    { label: 'Thesis', complete: !!thesis.trim() },
    { label: 'Bull Case', complete: !!bullCase.trim() },
    { label: 'Bear Case', complete: !!bearCase.trim() },
  ]), [bearCase, bullCase, thesis]);
  const incompleteMemoRequirements = memoRequirements.filter((item) => !item.complete);
  const memoReadyForScenario = !!county && hasSavedWorkspace && incompleteMemoRequirements.length === 0;
  const scenarioActionLabel = !county
    ? 'Select County First'
    : !hasSavedWorkspace
      ? 'Save Memo First'
      : incompleteMemoRequirements.length
        ? 'Finish Core Memo First'
        : 'Pressure Test In Scenario Lab';
  const thesisPreview = thesis.trim() || active.thesis || 'No written thesis yet. Use this workspace to turn screening output into a defendable investment view.';
  const keyRisks = parseTags(keyRisksInput);
  const catalysts = parseTags(catalystsInput);
  const criticalDependencies = parseTags(criticalDependenciesInput);
  const missingDataNotes = parseTags(missingDataNotesInput);
  const memoStatus = approvalState || decisionState || status;
  const memoVerdict = approvalState === 'pursue' || approvalState === 'approved' || decisionState === 'approved'
    ? 'PURSUE'
    : approvalState === 'pass' || decisionState === 'rejected' || status === 'pass'
      ? 'PASS'
      : decisionState === 'investment_committee'
        ? 'IC REVIEW'
        : status === 'high_conviction'
          ? 'HIGH CONVICTION'
          : 'IN PROGRESS';
  const memoScenarioText = !latestScenarioRun
    ? 'No saved scenario compare snapshot yet.'
    : latestBestScenario?.delta_fair_value_vs_base != null || latestWorstScenario?.delta_fair_value_vs_base != null
      ? `Latest scenario snapshot: base fair value ${latestBaseScenario?.fair_value != null ? `$${Math.round(latestBaseScenario.fair_value).toLocaleString('en-US')}` : 'N/A'}, upside ${latestBestScenario?.delta_fair_value_vs_base != null ? `${latestBestScenario.scenario} ${latestBestScenario.delta_fair_value_vs_base > 0 ? '+' : ''}$${Math.round(Math.abs(latestBestScenario.delta_fair_value_vs_base)).toLocaleString('en-US')}` : 'N/A'}, downside ${latestWorstScenario?.delta_fair_value_vs_base != null ? `${latestWorstScenario.scenario} ${latestWorstScenario.delta_fair_value_vs_base > 0 ? '+' : ''}$${Math.round(Math.abs(latestWorstScenario.delta_fair_value_vs_base)).toLocaleString('en-US')}` : 'N/A'}.`
      : 'Latest scenario snapshot is saved, but compare deltas are not available.';
  const memoAcquisitionText = !latestScenarioAcquisition
    ? 'No saved acquisition underwrite is attached to the latest scenario snapshot yet.'
    : `Latest underwrite: ${latestScenarioAcquisitionInputs?.hold_years ?? latestScenarioAcquisition.hold_years ?? '--'}-year hold on ${Number(latestScenarioAcquisition.acres || latestScenarioAcquisitionInputs?.acres || 0).toLocaleString('en-US')} acres at ${$$(latestScenarioAcquisition.entry_price_per_acre ?? latestScenarioAcquisitionInputs?.entry_price_per_acre)} / ac -> ${$pct(latestScenarioAcquisition.irr_pct)} unlevered IRR, ${$pct(latestScenarioAcquisition.levered_irr_pct)} levered IRR, ${$pct(latestScenarioAcquisition.year1_cash_on_cash_yield_pct)} year 1 cash-on-cash, ${latestScenarioAcquisition.ltv_pct != null ? `${$(latestScenarioAcquisition.ltv_pct, 1)}% leverage` : 'no leverage detail'}, ${latestScenarioAcquisition.refinance_mode === 'modeled' ? `refi year ${latestScenarioAcquisition.refinance_year} with ${$$(latestScenarioAcquisition.refinance_cash_out_total)} cash out` : 'no refinance modeled'}.`;
  const currentCountyContext = county ? getCountyContext(county) : { countyName: params?.countyName || '', state: params?.state || '' };
  const currentCountyName = currentCountyContext.countyName;
  const currentState = currentCountyContext.state;
  const countyMetrics = countySummary?.metrics || {};
  const countyCredit = countySummary?.credit || null;
  const countySoil = countySummary?.soil || null;
  const countyIrrigation = countySummary?.irrigation || null;
  const countyDrought = countySummary?.drought || null;
  const countyFlood = countySummary?.flood || null;
  const countyDecisionRead = countySummary
    ? evaluateAtlasCountyRead({
        metrics: countyMetrics,
        sourceQuality: countySummary.source_quality,
        productivityActive: countySummary.productivity_active,
        yieldProductivityFactor: countyMetrics.yield_productivity_factor,
        soil: countySoil,
        irrigation: countyIrrigation,
        drought: countyDrought,
        flood: countyFlood,
        credit: countyCredit,
        benchmarkMethodDetail: countySummary.benchmark_method_detail,
      })
    : null;
  const countyThesisRead = countySummary
    ? evaluateAtlasThesisSupport({
        lensKey: thesisLensKey || activeThesisKey,
        metrics: countyMetrics,
        productivityActive: countySummary.productivity_active,
        yieldProductivityFactor: countyMetrics.yield_productivity_factor,
        soil: countySoil,
        irrigation: countyIrrigation,
        drought: countyDrought,
        flood: countyFlood,
      })
    : null;
  const countyDroughtBadge = droughtRiskBand(countyDrought);
  const countyFloodBadge = floodRiskBand(countyFlood);
  const trackedSourcesCount = trackedSources.length;
  const lastTrackedSourceRefresh = trackedSources
    .map((source) => source.last_crawled_at || source.latest_crawl?.fetched_at || null)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || null;
  const buildScenarioNavParamsForFips = React.useCallback((fips, options = {}) => {
    const scenarioRun = options.scenarioRun || null;
    const countyContext = getCountyContext(fips);
    const lensKey = options.thesisKey ?? thesisLensKey;
    const resolvedPlaybookKey = options.playbookKey || currentPlaybookKey;
    const lens = lensKey ? getThesisLens(lensKey, resolvedPlaybookKey) : null;
    return {
      fips,
      countyName: countyContext.countyName,
      state: countyContext.state,
      sourcePage: 'research',
      playbookKey: resolvedPlaybookKey,
      thesisKey: lensKey || '',
      thesisLabel: options.thesisLabel ?? lens?.label ?? '',
      acquisitionInputs: readAcquisitionInputs(scenarioRun) || options.acquisitionInputs || latestScenarioAcquisitionInputs || undefined,
      creditInputs: readCreditInputs(scenarioRun) || options.creditInputs || latestScenarioCreditInputs || undefined,
      assetType: options.assetType || lens?.assetType || assetType || params?.assetType || 'agriculture_land',
      targetUseCase: options.targetUseCase || lens?.targetUseCase || targetUseCase || params?.targetUseCase || 'farmland_investment',
    };
  }, [
    assetType,
    currentPlaybookKey,
    getCountyContext,
    latestScenarioAcquisitionInputs,
    latestScenarioCreditInputs,
    params?.assetType,
    params?.targetUseCase,
    targetUseCase,
    thesisLensKey,
  ]);
  const buildScenarioNavParams = (scenarioRun = null) => buildScenarioNavParamsForFips(county, { scenarioRun });

  const addTrackedSource = async () => {
    if (!county) {
      addToast(toast('Select a county first', 'err'));
      return;
    }
    if (!sourceUrlInput.trim()) {
      addToast(toast('Source URL is required', 'err'));
      return;
    }
    try {
      setSourceSaving(true);
      const created = await api(`/research/workspaces/${county}/sources`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          url: sourceUrlInput.trim(),
          title: sourceTitleInput.trim(),
          source_type: sourceTypeInput,
        }),
      });
      await Promise.all([loadTrackedSources(county), loadStore()]);
      setSourceUrlInput('');
      setSourceTitleInput('');
      setSourceTypeInput('operator_or_news');
      addToast(toast(created?.duplicate ? 'Source already tracked' : 'Tracked source added', created?.duplicate ? 'info' : 'ok'));
    } catch (e) {
      addToast(toast('Add source failed', 'err'));
    } finally {
      setSourceSaving(false);
    }
  };

  const refreshTrackedSources = async (sourceId = null) => {
    if (!county) {
      addToast(toast('Select a county first', 'err'));
      return;
    }
    try {
      setRefreshingSourceId(sourceId ?? 'all');
      const response = await api(`/research/workspaces/${county}/source-crawls`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(sourceId ? { source_id: sourceId } : {}),
      });
      await Promise.all([loadTrackedSources(county), loadStore()]);
      addToast(toast(
        response?.mode === 'not_configured'
          ? 'Refresh recorded, but crawl executor is not configured yet'
          : (sourceId ? 'Tracked source refreshed' : 'Tracked sources refreshed'),
        response?.mode === 'not_configured' ? 'info' : 'ok',
      ));
    } catch (e) {
      addToast(toast('Source refresh failed', 'err'));
    } finally {
      setRefreshingSourceId(null);
    }
  };

  const saveWorkspace = async () => {
    if (!county) { addToast(toast('Select a county first', 'err')); return; }
    try {
      const updated = await api(`/research/workspaces/${county}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          playbook_key: currentPlaybookKey || '',
          thesis: thesis.trim(),
          analysis: {
            thesis: thesis.trim(),
            bull_case: bullCase.trim(),
            bear_case: bearCase.trim(),
            key_risks: parseTags(keyRisksInput),
            catalysts: parseTags(catalystsInput),
            decision_state: decisionState,
            asset_type: assetType,
            target_use_case: targetUseCase,
            thesis_lens_key: thesisLensKey,
            thesis_lens_label: getThesisLens(thesisLensKey, currentPlaybookKey)?.label || '',
            critical_dependencies: parseTags(criticalDependenciesInput),
            missing_data_notes: parseTags(missingDataNotesInput),
            approval_state: approvalState,
          },
          tags: parseTags(tagsInput),
          status,
          conviction: Number(conviction),
        }),
      });
      setStore(prev => ({ ...prev, [county]: normalizeResearchRecord(updated) }));
      addToast(toast('Research workspace saved', 'ok'));
    } catch (e) {
      addToast(toast('Save failed', 'err'));
    }
  };

  const addNote = async () => {
    if (!county) { addToast(toast('Select a county first', 'err')); return; }
    if (!noteInput.trim()) return;
    try {
      const note = await api(`/research/workspaces/${county}/notes`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ content: noteInput.trim() }),
      });
      setStore(prev => {
        const current = normalizeResearchRecord(prev[county]);
        return {
          ...prev,
          [county]: normalizeResearchRecord({
            ...current,
            notes: [note, ...current.notes],
            updated_at: note.created_at || current.updated_at,
          }),
        };
      });
      setNoteInput('');
      addToast(toast('Research note added', 'ok'));
    } catch (e) {
      addToast(toast('Save failed', 'err'));
    }
  };

  const deleteNote = async (id) => {
    if (!county) return;
    try {
      await api(`/research/notes/${id}`, { method:'DELETE' });
      setStore(prev => {
        const current = normalizeResearchRecord(prev[county]);
        return {
          ...prev,
          [county]: normalizeResearchRecord({
            ...current,
            notes: current.notes.filter(n => n.id !== id),
            updated_at: new Date().toISOString(),
          }),
        };
      });
    } catch (e) {
      addToast(toast('Delete failed', 'err'));
    }
  };

  const records = React.useMemo(() => Object.entries(store)
    .map(([fips, rec]) => ({ fips, ...normalizeResearchRecord(rec) }))
    .filter(r => r.thesis || r.analysis?.bull_case || r.analysis?.bear_case || r.analysis?.target_use_case || r.analysis?.critical_dependencies?.length || r.analysis?.missing_data_notes?.length || r.tags.length || r.notes.length || r.scenario_packs.length || r.scenario_runs.length || r.scenario_runs_count || r.sources_count)
    .sort((a,b) => (b.updated_at || '').localeCompare(a.updated_at || '')), [store]);
  const researchRows = React.useMemo(
    () => hydrateResearchRows(records, countyMap, currentPlaybookKey),
    [records, countyMap, currentPlaybookKey],
  );
  const filteredResearchRows = React.useMemo(() => {
    const query = researchSearch.trim().toLowerCase();
    return researchRows.filter((row) => {
      if (researchStatusFilter && row.status !== researchStatusFilter) return false;
      if (researchThesisFilter && row.analysis?.thesis_lens_key !== researchThesisFilter) return false;
      if (query && !row._search_blob.includes(query)) return false;
      return true;
    });
  }, [researchRows, researchSearch, researchStatusFilter, researchThesisFilter]);
  const researchColumns = React.useMemo(
    () => getResearchColumns({ activeCounty: county }),
    [county],
  );
  const hasResearchFilters = !!(researchSearch.trim() || researchStatusFilter || researchThesisFilter);
  const queueSurface = (
    <div className="card" style={{marginBottom:'.8rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'.75rem',marginBottom:'.65rem',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.18rem'}}>Research Queue</h3>
          <div style={{fontSize:'.8rem',color:'var(--text2)',maxWidth:'900px'}}>
            Open a record before you drop into the memo editor. Use the side panel for a quick read, then make one county the active workspace.
          </div>
        </div>
        <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
          <span className="badge badge-a">{records.length} RECORDS</span>
          <span className="badge badge-b">{filteredResearchRows.length} IN VIEW</span>
          {county && <span className="badge badge-g">ACTIVE {selectedCountyLabel.toUpperCase()}</span>}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(240px,1.4fr) repeat(2,minmax(170px,1fr)) auto',gap:'.55rem',alignItems:'end',marginBottom:'.65rem'}}>
        <div className="fg" style={{margin:0}}>
          <label>Search Records</label>
          <input
            type="text"
            value={researchSearch}
            onChange={(e) => setResearchSearch(e.target.value)}
            placeholder="County, thesis, bull case, risks, tags..."
          />
        </div>
        <div className="fg" style={{margin:0}}>
          <label>Status Filter</label>
          <select value={researchStatusFilter} onChange={(e) => setResearchStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="fg" style={{margin:0}}>
          <label>Thesis Lens Filter</label>
          <select value={researchThesisFilter} onChange={(e) => setResearchThesisFilter(e.target.value)}>
            <option value="">All thesis lenses</option>
            {thesisLenses.map((lens) => <option key={lens.key} value={lens.key}>{lens.label}</option>)}
          </select>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button className="btn btn-sm" onClick={() => setResearchViewConfig(getDefaultResearchViewState())}>Reset Grid View</button>
            {hasResearchFilters && <button
              className="btn btn-sm"
              onClick={() => {
                setResearchSearch('');
                setResearchStatusFilter('');
                setResearchThesisFilter('');
              }}
            >
              Clear Filters
            </button>}
          </div>
        </div>
      </div>
      {storeLoading && records.length === 0 ? <Loading/>
      : filteredResearchRows.length === 0 && !hasResearchFilters
        ? <ActionEmptyState
            title="Research Queue"
            body="Research is where Atlas turns a promising county into a defendable decision record."
            detail="Start from Screener or County Detail, open one county you want to investigate, then save it into Research Workspace so the memo and scenario history have a home."
            actions={[
              { label: 'Open Screener', primary: true, onClick: () => nav(PG.SCREEN) },
            ]}
          />
        : <DataGrid
          columns={researchColumns}
          rows={filteredResearchRows}
          rowKey="fips"
          stickyHeader
          viewConfig={researchViewConfig}
          onViewChange={setResearchViewConfig}
          rowColorFn={(row) => getResearchRowAccent(row, researchViewConfig?.rowColoring)}
          rowColorOptions={researchRowColorOptions}
          emptyMessage={hasResearchFilters ? 'No research records match the current filters.' : 'No saved research workspaces yet.'}
          renderRecordPanel={(row, closePanel) => <ResearchRecordPanel
            row={row}
            closePanel={closePanel}
            setCounty={setCounty}
            nav={nav}
            buildScenarioNavParams={(recordRow) => buildScenarioNavParamsForFips(recordRow.fips, {
              playbookKey: recordRow.playbook_key || recordRow._playbook_key || currentPlaybookKey,
              thesisKey: recordRow.analysis?.thesis_lens_key || '',
              thesisLabel: recordRow.analysis?.thesis_lens_label || '',
              assetType: recordRow.analysis?.asset_type || '',
              targetUseCase: recordRow.analysis?.target_use_case || '',
            })}
          />}
        />}
    </div>
  );

  return <div>
    {storeErr && <ErrBox title="Research Sync Error" msg={storeErr} onRetry={loadStore}/>}
    <div className="card hero-card" style={{marginBottom:'.8rem'}}>
      <div className="hero-k">Research Workspace</div>
      <h2 className="hero-h">{county ? selectedCountyLabel : 'Open A Record Or Start A Memo'}</h2>
      <p className="hero-p">
        {county
          ? `${sourceLabel ? `Opened from ${sourceLabel}. ` : ''}${hasSavedWorkspace ? 'Existing research workspace loaded. ' : 'New research workspace ready. '}Use this page to turn a county read into a defendable decision record.`
          : 'Browse the research queue, open a record from the side panel, then move the best counties into the memo editor.'}
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'.55rem',marginBottom:'.85rem'}}>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Queue</div>
          <div className="sc-v" style={{fontSize:'.95rem'}}>{filteredResearchRows.length} in view</div>
          <div style={{fontSize:'.72rem',color:'var(--text2)'}}>{records.length} total saved records across the current workspace.</div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Active Record</div>
          <div style={{fontSize:'.92rem',fontWeight:600}}>{county ? memoVerdict : 'No county selected'}</div>
          <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.22rem'}}>
            {county ? `${String(memoStatus || 'exploring').replace(/_/g, ' ')} • conviction ${Math.round(conviction)}/100` : 'Open a record or pick a county to start a new memo.'}
          </div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Best Next Move</div>
          <div style={{fontSize:'.82rem',color:'var(--text1)',lineHeight:1.35}}>
            {!county
              ? 'Open a record from the queue first, or select one county and turn it into a memo before modeling anything.'
              : !hasSavedWorkspace
                ? 'Write the core call, save the memo once, then move into Scenario Lab.'
                : incompleteMemoRequirements.length
                  ? `Finish ${incompleteMemoRequirements.map((item) => item.label).join(', ')} before pressure testing.`
                  : 'Memo is ready. Pressure test it in Scenario Lab and bring the model output back into this record.'}
          </div>
        </div>
      </div>
      <div className="hero-actions">
        {county && <button className="btn btn-p" onClick={saveWorkspace}>Save Memo</button>}
        {county && <button className="btn" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams())} disabled={!memoReadyForScenario}>{scenarioActionLabel}</button>}
        {county && <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, {fips: county, playbookKey: currentPlaybookKey, thesisKey: thesisLensKey})}>Open County Detail</button>}
      </div>
    </div>

    {!county ? queueSurface : null}
    <div className="rw-grid">
      <div className="card">
        <h3 style={{fontSize:'.98rem',marginBottom:'.65rem'}}>Memo Editor</h3>
        <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.65rem',lineHeight:1.45}}>
          Keep the first pass simple: choose one county, write the call in plain language, save it, then pressure test it in Scenario Lab.
        </div>
        <div className="fg"><label>County</label><CountyPicker value={county} onChange={setCounty} placeholder="Select county for research workspace..." selectedLabel={selectedCountyLabel}/></div>
        {!county ? <ActionEmptyState
          title="Memo Editor"
          body="Pick one county first. Then Atlas will keep the memo fields visible and use Scenario Lab only after the written call exists."
          detail="You can open a record from the queue above, or select a county directly here to start a new memo."
          actions={[
            { label: 'Open Screener', primary: true, onClick: () => nav(PG.SCREEN) },
          ]}
        /> : <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem'}}>
            <div className="fg"><label>Decision Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="fg"><label>Conviction Score: {Math.round(conviction)}/100</label>
              <input type="range" min="0" max="100" step="1" value={conviction} onChange={e => setConviction(Number(e.target.value))}/>
            </div>
          </div>
          <div className="fg"><label>Thesis</label>
            <textarea value={thesis} onChange={e => setThesis(e.target.value)} placeholder="Why this county matters, what must be true, and what could break..." style={{minHeight:'92px'}}/>
          </div>
          <div className="fg"><label>Bull Case</label>
            <textarea value={bullCase} onChange={e => setBullCase(e.target.value)} placeholder="What drives upside?" style={{minHeight:'70px'}}/>
          </div>
          <div className="fg"><label>Bear Case</label>
            <textarea value={bearCase} onChange={e => setBearCase(e.target.value)} placeholder="What breaks the thesis?" style={{minHeight:'70px'}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem'}}>
            <div className="fg"><label>Key Risks (comma separated)</label><input type="text" value={keyRisksInput} onChange={e => setKeyRisksInput(e.target.value)} placeholder="drought, policy, financing"/></div>
            <div className="fg"><label>Catalysts (comma separated)</label><input type="text" value={catalystsInput} onChange={e => setCatalystsInput(e.target.value)} placeholder="rate cuts, rent reset, infra build"/></div>
          </div>
          <div className="card" style={{marginTop:'.75rem',padding:'.7rem .8rem'}}>
            <div style={{fontSize:'.76rem',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.45rem'}}>Memo Readiness</div>
            <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.55rem'}}>
              Atlas uses this checklist to decide whether the memo is ready for Scenario Lab.
            </div>
            <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
              {memoRequirements.map((item) => (
                <span key={item.label} className={`badge ${item.complete ? 'badge-g' : 'badge-r'}`}>
                  {item.complete ? 'DONE' : 'NEEDED'} {item.label.toUpperCase()}
                </span>
              ))}
              <span className={`badge ${hasSavedWorkspace ? 'badge-g' : 'badge-a'}`}>
                {hasSavedWorkspace ? 'DONE SAVED' : 'NEEDED SAVE'}
              </span>
            </div>
            <div style={{fontSize:'.74rem',color:'var(--text2)',marginTop:'.5rem'}}>
              {memoReadyForScenario
                ? 'The core memo is ready. You can pressure test it in Scenario Lab now.'
                : !hasSavedWorkspace
                  ? 'Save the memo once after drafting the core call. Then Atlas will treat Scenario Lab as the next step.'
                  : `Finish ${incompleteMemoRequirements.map((item) => item.label).join(', ')} before moving into Scenario Lab.`}
            </div>
          </div>
          <div className="card" style={{marginTop:'.75rem',padding:'.7rem .8rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:'.55rem',alignItems:'flex-start',flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:'.76rem',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.45rem'}}>Tracked Sources</div>
                <div style={{fontSize:'.78rem',color:'var(--text2)',maxWidth:'760px',lineHeight:1.45}}>
                  Attach the few outside pages this memo depends on. Keep it tight: county EDC, zoning/planning, utility/power, state ag or water, or one operator/news source worth revisiting.
                </div>
              </div>
              <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
                <span className="badge badge-b">{trackedSourcesCount} SOURCES</span>
                <span className={`badge ${lastTrackedSourceRefresh ? 'badge-g' : 'badge-a'}`}>
                  {lastTrackedSourceRefresh ? `LAST REFRESH ${new Date(lastTrackedSourceRefresh).toLocaleDateString()}` : 'NO REFRESH YET'}
                </span>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'minmax(280px,1.8fr) minmax(170px,1fr) minmax(180px,1fr) auto',gap:'.55rem',alignItems:'end',marginTop:'.7rem'}}>
              <div className="fg" style={{margin:0}}>
                <label>Source URL</label>
                <input
                  type="url"
                  value={sourceUrlInput}
                  onChange={(e) => setSourceUrlInput(e.target.value)}
                  placeholder="https://example.gov/project-update"
                />
              </div>
              <div className="fg" style={{margin:0}}>
                <label>Source Type</label>
                <select value={sourceTypeInput} onChange={(e) => setSourceTypeInput(e.target.value)}>
                  {sourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="fg" style={{margin:0}}>
                <label>Optional Label</label>
                <input
                  type="text"
                  value={sourceTitleInput}
                  onChange={(e) => setSourceTitleInput(e.target.value)}
                  placeholder="County utility update"
                />
              </div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="btn btn-sm btn-p" onClick={addTrackedSource} disabled={sourceSaving}>
                  {sourceSaving ? 'ADDING...' : 'ADD SOURCE'}
                </button>
              </div>
            </div>
            <div className="rw-actions" style={{marginTop:'.65rem'}}>
              <button
                className="btn btn-sm"
                onClick={() => refreshTrackedSources()}
                disabled={!trackedSourcesCount || refreshingSourceId != null}
              >
                {refreshingSourceId === 'all' ? 'REFRESHING...' : 'REFRESH ALL SOURCES'}
              </button>
            </div>
            {trackedSourcesErr && <div style={{fontSize:'.74rem',color:'var(--danger)',marginTop:'.5rem'}}>{trackedSourcesErr}</div>}
            <div style={{marginTop:'.65rem'}}>
              {trackedSourcesLoading ? <Loading/>
              : trackedSources.length === 0 ? <ActionEmptyState
                  title="Tracked Sources"
                  body="No external source pages are attached to this memo yet."
                  detail="Add only the pages you expect to revisit while this county is in diligence. Slice A stores the source register and manual refresh history first."
                />
              : trackedSources.map((source) => {
                  const latestCrawl = source.latest_crawl || null;
                  const isRefreshing = refreshingSourceId === source.id;
                  const crawlStatusClass = latestCrawl?.status === 'completed'
                    ? 'badge-g'
                    : latestCrawl?.status === 'errored'
                      ? 'badge-r'
                      : latestCrawl?.status === 'not_configured'
                        ? 'badge-a'
                        : 'badge-b';
                  return (
                    <div key={source.id} className="rw-note" style={{alignItems:'flex-start'}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',alignItems:'center',marginBottom:'.25rem'}}>
                          <a href={source.url} target="_blank" rel="noreferrer" style={{fontSize:'.82rem',fontWeight:600}}>
                            {source.title || formatTrackedSourceHost(source.url)}
                          </a>
                          <span className="badge badge-b">{formatTrackedSourceType(source.source_type)}</span>
                          <span className={`badge ${crawlStatusClass}`}>{String(latestCrawl?.status || 'active').replace(/_/g, ' ').toUpperCase()}</span>
                        </div>
                        <div style={{fontSize:'.74rem',color:'var(--text2)',lineHeight:1.45}}>
                          {source.url}
                        </div>
                        <div style={{fontSize:'.73rem',color:'var(--text2)',marginTop:'.22rem',lineHeight:1.45}}>
                          {latestCrawl?.fetched_at
                            ? `Last refreshed ${new Date(latestCrawl.fetched_at).toLocaleString()}`
                            : source.last_crawled_at
                              ? `Last refreshed ${new Date(source.last_crawled_at).toLocaleString()}`
                              : 'No completed refresh yet.'}
                          {latestCrawl?.http_status ? ` • HTTP ${latestCrawl.http_status}` : ''}
                          {latestCrawl?.error_text ? ` • ${latestCrawl.error_text}` : ''}
                        </div>
                      </div>
                      <button className="btn btn-sm" onClick={() => refreshTrackedSources(source.id)} disabled={refreshingSourceId != null}>
                        {isRefreshing ? 'REFRESHING...' : 'REFRESH'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
          <details style={{marginTop:'.75rem'}}>
            <summary style={{cursor:'pointer',fontSize:'.8rem',color:'var(--text2)',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase'}}>More memo structure</summary>
            <div style={{marginTop:'.75rem'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem'}}>
                <div className="fg"><label>Asset Type</label>
                  <select value={assetType} onChange={e => setAssetType(e.target.value)}>
                    <option value="">Select asset type</option>
                    <option value="agriculture_land">Agriculture Land</option>
                    <option value="industrial_land">Industrial Land</option>
                    <option value="alternative_land">Alternative Land</option>
                  </select>
                </div>
                <div className="fg"><label>Target Use Case</label>
                  <select value={targetUseCase} onChange={e => setTargetUseCase(e.target.value)}>
                    <option value="">Select use case</option>
                    <option value="farmland_investment">Farmland Investment</option>
                    <option value="ag_lending">Ag Lending</option>
                    <option value="data_center">Data Center</option>
                    <option value="logistics">Logistics</option>
                    <option value="light_industrial">Light Industrial</option>
                    <option value="energy_adjacent">Energy Adjacent</option>
                  </select>
                </div>
              </div>
              <div className="fg"><label>Thesis Lens</label>
                <select value={thesisLensKey} onChange={e => setThesisLensKey(e.target.value)}>
                  <option value="">None</option>
                  {thesisLenses.map((lens) => <option key={lens.key} value={lens.key}>{lens.label}</option>)}
                </select>
                {selectedThesisLens && <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.3rem'}}>
                  <strong style={{color:'var(--text1)'}}>Question:</strong> {selectedThesisLens.question}
                  <br/>
                  <strong style={{color:'var(--text1)'}}>Uses now:</strong> {selectedThesisLens.nowSignals.join(', ')}
                  <br/>
                  <strong style={{color:'var(--text1)'}}>Still missing:</strong> {selectedThesisLens.gapSignals.join(', ')}
                </div>}
              </div>
              <div className="fg"><label>Tags (comma separated)</label><input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="water, cap-rate, soils, logistics"/></div>
              <div className="fg"><label>Decision State</label>
                <select value={decisionState} onChange={e => setDecisionState(e.target.value)}>
                  <option value="exploring">Exploring</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="underwriting">Underwriting</option>
                  <option value="investment_committee">Investment Committee</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem'}}>
                <div className="fg"><label>Approval State</label>
                  <select value={approvalState} onChange={e => setApprovalState(e.target.value)}>
                    <option value="">Not set</option>
                    <option value="watch">Watch</option>
                    <option value="pursue">Pursue</option>
                    <option value="hold">Hold</option>
                    <option value="pass">Pass</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                <div className="fg"><label>Critical Dependencies (comma separated)</label><input type="text" value={criticalDependenciesInput} onChange={e => setCriticalDependenciesInput(e.target.value)} placeholder="utility upgrade, water agreement, zoning"/></div>
              </div>
              <div className="fg"><label>Missing Data Notes (comma separated)</label><input type="text" value={missingDataNotesInput} onChange={e => setMissingDataNotesInput(e.target.value)} placeholder="parcel zoning unknown, substation capacity unknown"/></div>
            </div>
          </details>
          <div className="rw-actions">
            <button className="btn btn-p" onClick={saveWorkspace}>Save Memo</button>
            <button className="btn" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams())} disabled={!memoReadyForScenario}>{scenarioActionLabel}</button>
          </div>
        </>}
      </div>

      <div className="card">
        <h3 style={{fontSize:'.98rem',marginBottom:'.65rem'}}>Record Snapshot</h3>
        <div className="sc"><div className="sc-l">Selected County</div><div className="sc-v" style={{fontSize:'.95rem'}}>{selectedCountyLabel}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Active Assumption Set</div><div className="sc-v" style={{fontSize:'.82rem'}}>{assumptionSetLabel(activeAssumptionSet)}</div></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:'.48rem',marginTop:'.48rem'}}>
          <div className="sc" style={{margin:0}}><div className="sc-l">Notes</div><div className="sc-v">{active.notes.length}</div></div>
          <div className="sc" style={{margin:0}}><div className="sc-l">Scenario Runs</div><div className="sc-v">{scenarioRuns.length}</div></div>
          <div className="sc" style={{margin:0}}><div className="sc-l">Packs</div><div className="sc-v">{active.scenario_packs.length}</div></div>
          <div className="sc" style={{margin:0}}><div className="sc-l">Tracked Sources</div><div className="sc-v">{trackedSourcesCount || active.sources_count || 0}</div></div>
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text2)',marginTop:'.55rem',lineHeight:1.45}}>
          Keep the memo and the active assumption set aligned. Atlas does not automatically rewrite your memo when the model basis changes.
        </div>
        <details style={{marginTop:'.75rem'}}>
          <summary style={{cursor:'pointer',fontSize:'.8rem',color:'var(--text2)',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase'}}>More record context</summary>
          <div style={{marginTop:'.7rem'}}>
            <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Session User</div><div className="sc-v" style={{fontSize:'.82rem'}}>{researchUser || '--'}</div></div>
            <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Asset Type</div><div className="sc-v" style={{fontSize:'.82rem'}}>{assetType || active.analysis?.asset_type || '--'}</div></div>
            <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Target Use Case</div><div className="sc-v" style={{fontSize:'.82rem'}}>{targetUseCase || active.analysis?.target_use_case || '--'}</div></div>
            <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Thesis Lens</div><div className="sc-v" style={{fontSize:'.82rem'}}>{selectedThesisLens?.label || active.analysis?.thesis_lens_label || '--'}</div></div>
            <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Last Update</div><div className="sc-v" style={{fontSize:'.82rem'}}>{active.updated_at ? new Date(active.updated_at).toLocaleString() : '--'}</div></div>
          </div>
        </details>
      </div>
    </div>

    {county && <details className="card" style={{marginBottom:'.8rem'}}>
      <summary style={{cursor:'pointer',fontSize:'.95rem',fontWeight:600}}>Switch Record / Research Queue</summary>
      <div style={{marginTop:'.6rem'}}>
        <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.65rem'}}>
          Keep the memo editor focused on the active county. Open this queue only when you want to switch records or scan other saved work.
        </div>
        {queueSurface}
      </div>
    </details>}

    <details className="card" style={{marginBottom:'.7rem'}}>
      <summary style={{cursor:'pointer',fontSize:'.95rem',fontWeight:600}}>Latest Scenario Snapshot</summary>
      <div style={{marginTop:'.55rem'}}>
      {!latestScenarioRun ? <ActionEmptyState
        title="Latest Scenario Snapshot"
        body="This section shows the latest saved compare run and underwrite attached to the active research record."
        detail={county ? 'After the memo is saved and the core call is in place, run one scenario from Scenario Lab to bring the latest upside, downside, and acquisition read back into this decision record.' : 'Choose a county first, then save a memo before running one scenario from Scenario Lab to attach modeling context here.'}
        actions={[
          { label: county ? scenarioActionLabel : 'Open Screener', primary: true, onClick: () => county ? nav(PG.SCENARIO, buildScenarioNavParams()) : nav(PG.SCREEN), disabled: county ? !memoReadyForScenario : false },
        ]}
      /> : <div>
        <div className="sc"><div className="sc-l">Snapshot</div><div className="sc-v" style={{fontSize:'.9rem'}}>{latestScenarioRun.scenario_name || 'Scenario Snapshot'}</div><div className="sc-c">{latestScenarioRun.created_at ? new Date(latestScenarioRun.created_at).toLocaleString() : '--'} • As of {latestScenarioRun.as_of_date || '--'}</div></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem',marginTop:'.6rem'}}>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Snapshot Model Basis</div>
            <div className="sc-v" style={{fontSize:'.88rem'}}>{latestScenarioAssumptionSummary.baseLabel}</div>
            <div className="sc-c">
              {latestScenarioAssumptionSummary.overrideCount > 0
                ? `${latestScenarioAssumptionSummary.overrideCount} override${latestScenarioAssumptionSummary.overrideCount === 1 ? '' : 's'} layered on top of the base set.`
                : 'No override values were stored with this snapshot.'}
            </div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Current vs Snapshot</div>
            <div className="sc-v" style={{fontSize:'.88rem'}}>
              {latestScenarioAssumptionSummary.baseId != null && String(latestScenarioAssumptionSummary.baseId) === String(activeAssumptionSetId)
                ? 'MATCHES ACTIVE SET'
                : 'CHECK ACTIVE SET'}
            </div>
            <div className="sc-c">
              {latestScenarioAssumptionSummary.baseId != null && String(latestScenarioAssumptionSummary.baseId) === String(activeAssumptionSetId)
                ? 'The latest saved scenario snapshot used the same base assumption set currently active in Atlas.'
                : `Active set now: ${assumptionSetLabel(activeAssumptionSet)}.`}
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.55rem',marginTop:'.6rem'}}>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Base Fair Value</div>
            <div className="sc-v">{$$(latestBaseScenario?.fair_value)}</div>
            <div className="sc-c">Base case from latest saved compare run.</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Best Delta</div>
            <div className="sc-v">{latestBestScenario?.delta_fair_value_vs_base != null ? `${latestBestScenario.scenario}: ${latestBestScenario.delta_fair_value_vs_base > 0 ? '+' : ''}${$$(latestBestScenario.delta_fair_value_vs_base)}` : 'N/A'}</div>
            <div className="sc-c">Largest upside move vs base in the saved compare run.</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Worst Delta</div>
            <div className="sc-v">{latestWorstScenario?.delta_fair_value_vs_base != null ? `${latestWorstScenario.scenario}: ${latestWorstScenario.delta_fair_value_vs_base > 0 ? '+' : ''}${$$(latestWorstScenario.delta_fair_value_vs_base)}` : 'N/A'}</div>
            <div className="sc-c">Largest downside move vs base in the saved compare run.</div>
          </div>
        </div>
        <div className="sc" style={{marginTop:'.6rem'}}>
          <div className="sc-l">Primary Driver</div>
          <div className="sc-v" style={{fontSize:'.88rem'}}>{latestTopDriver ? `${latestTopDriver.scenario}: ${latestTopDriver.driver.driver}` : 'N/A'}</div>
          <div className="sc-c">{latestTopDriver ? `Top one-at-a-time driver delta: ${$(latestTopDriver.driver.delta, 2)}` : 'Driver decomposition is not available for the latest snapshot.'}</div>
        </div>
        {latestScenarioAcquisition && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.55rem',marginTop:'.6rem'}}>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Acquisition Read</div>
            <div className="sc-v">{latestScenarioAcquisition.levered_irr_pct != null ? `${$pct(latestScenarioAcquisition.levered_irr_pct)} Levered IRR` : 'N/A'}</div>
            <div className="sc-c">{$pct(latestScenarioAcquisition.irr_pct)} unlevered IRR • {$pct(latestScenarioAcquisition.year1_cash_on_cash_yield_pct)} year 1 cash-on-cash</div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Deal Basis</div>
            <div className="sc-v">{latestScenarioAcquisitionInputs?.hold_years ?? latestScenarioAcquisition.hold_years ?? '--'} years</div>
            <div className="sc-c">
              {Number(latestScenarioAcquisition.acres || latestScenarioAcquisitionInputs?.acres || 0).toLocaleString('en-US')} acres • {latestScenarioAcquisition.entry_price_per_acre != null || latestScenarioAcquisitionInputs?.entry_price_per_acre != null ? `${$$(latestScenarioAcquisition.entry_price_per_acre ?? latestScenarioAcquisitionInputs?.entry_price_per_acre)} / ac` : 'Entry price unavailable'} • {latestScenarioAcquisition.ltv_pct != null ? `${$(latestScenarioAcquisition.ltv_pct, 1)}% leverage` : 'leverage unavailable'}
            </div>
          </div>
          <div className="sc" style={{margin:0}}>
            <div className="sc-l">Exit / Profit</div>
            <div className="sc-v">{$$(latestScenarioAcquisition.net_exit_equity_total ?? latestScenarioAcquisition.net_exit_value_total)}</div>
            <div className="sc-c">{latestScenarioAcquisition.levered_total_profit != null ? `${$$(latestScenarioAcquisition.levered_total_profit)} levered profit` : 'Profit unavailable'} • {formatAcquisitionBasis(latestScenarioAcquisition.exit_cap_basis, 'exit')}</div>
          </div>
        </div>}
        {latestScenarioAcquisition && <div className="sc" style={{marginTop:'.6rem'}}>
          <div className="sc-l">Refinance / Roll-Forward</div>
          <div className="sc-v" style={{fontSize:'.88rem'}}>
            {latestScenarioAcquisition.refinance_mode === 'modeled'
              ? `Year ${latestScenarioAcquisition.refinance_year} refinance`
              : 'No refinance modeled'}
          </div>
          <div className="sc-c">
            {latestScenarioAcquisition.refinance_mode === 'modeled'
              ? `${$$(latestScenarioAcquisition.refinance_cash_out_total)} cash out • ${latestScenarioAcquisition.refinance_dscr != null ? `${$(latestScenarioAcquisition.refinance_dscr, 2)}x` : 'N/A'} refi DSCR • ${$$(latestScenarioAcquisition.exit_remaining_balance_after_refi_total)} exit balance after refi`
              : (latestScenarioAcquisition.balance_roll_forward || []).length
                ? latestScenarioAcquisition.balance_roll_forward.map((point) => `Y${point.year} ${$$(point.balance_per_acre)}`).join(' • ')
                : 'Debt roll-forward unavailable for the latest saved underwrite.'}
          </div>
        </div>}
        <div className="rw-actions">
          {county && <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams(latestScenarioRun))}>Reopen Scenario Lab</button>}
        </div>
      </div>}
      </div>
    </details>

    <details className="card" style={{marginBottom:'.7rem'}}>
      <summary style={{cursor:'pointer',fontSize:'.95rem',fontWeight:600}}>Research Notes</summary>
      <div style={{marginTop:'.55rem'}}>
      <div style={{display:'flex',gap:'.45rem',marginBottom:'.6rem'}}>
        <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Add diligence note, risk, catalyst, or follow-up question..." style={{minHeight:'68px',resize:'vertical'}}/>
        <button className="btn btn-p" onClick={addNote}>Add Note</button>
      </div>
      {active.notes.length === 0 ? <ActionEmptyState
        title="Research Notes"
        body="Notes are the running diligence trail for this memo."
        detail="Add one risk, catalyst, missing-data question, or follow-up note so the record starts to capture the work you are doing."
      />
      : active.notes.map(n => <div className="rw-note" key={n.id}>
        <div style={{flex:1}}>
          <div className="rw-meta">{new Date(n.created_at).toLocaleString()}</div>
          <div style={{fontSize:'.82rem'}}>{n.content}</div>
        </div>
        <button className="btn btn-sm btn-d" onClick={() => deleteNote(n.id)}>Del</button>
      </div>)}
      </div>
    </details>

    <details className="card" style={{marginBottom:'.7rem'}}>
      <summary style={{cursor:'pointer',fontSize:'.95rem',fontWeight:600}}>Saved Scenario Packs For Selected County</summary>
      <div style={{marginTop:'.55rem'}}>
      {active.scenario_packs.length === 0 ? <ActionEmptyState
        title="Saved Scenario Packs"
        body="Scenario packs let you reuse a repeatable modeling stance for this county."
        detail={county ? 'Save one in Scenario Lab after you have a saved memo and a parameter mix you want to reuse for this county.' : 'Pick a county first, then save a scenario pack from Scenario Lab once you have a reusable setup.'}
        actions={[
          { label: county ? scenarioActionLabel : 'Open Screener', primary: true, onClick: () => county ? nav(PG.SCENARIO, buildScenarioNavParams()) : nav(PG.SCREEN), disabled: county ? !memoReadyForScenario : false },
        ]}
      />
      : active.scenario_packs.map(pack => <div key={pack.id} className="pack-row">
        <div>
          <div style={{fontSize:'.8rem',fontWeight:600,marginBottom:'.18rem'}}>{pack.name}</div>
          <div style={{fontSize:'.74rem',color:'var(--text2)'}}>Risk Premium {pack.risk_premium}% | Growth {pack.growth_rate}% | Rent Shock {pack.rent_shock}%</div>
        </div>
        <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO,{fips:county,pack_id:pack.id, countyName: countyMap[county] ? countyMap[county].split(', ')[0] : params?.countyName, state: countyMap[county] ? countyMap[county].split(', ')[1] : params?.state, sourcePage: 'research', playbookKey: currentPlaybookKey, thesisKey: thesisLensKey})}>Open</button>
      </div>)}
      </div>
    </details>

    <details className="card" style={{marginBottom:'.7rem'}}>
      <summary style={{cursor:'pointer',fontSize:'.95rem',fontWeight:600}}>Scenario Run History</summary>
      <div style={{marginTop:'.55rem'}}>
      {scenarioRuns.length === 0 ? <ActionEmptyState
        title="Scenario Run History"
        body="This is the saved modeling history for the active research record."
        detail={county ? 'Once the memo is saved and the core call is written, run and save one scenario from Scenario Lab to start building a compare history here.' : 'Choose a county first, then save one memo and one scenario run so this history has something to show.'}
        actions={[
          { label: county ? scenarioActionLabel : 'Open Screener', primary: true, onClick: () => county ? nav(PG.SCENARIO, buildScenarioNavParams()) : nav(PG.SCREEN), disabled: county ? !memoReadyForScenario : false },
        ]}
      />
      : scenarioRuns.map(run => {
        const assumptionSummary = summarizeScenarioAssumptions(run.assumptions);
        const runAcquisitionInputs = readAcquisitionInputs(run);
        const runComparisonTable = Array.isArray(run.comparison?.comparison_table) ? run.comparison.comparison_table : [];
        const runBaseScenario = runComparisonTable.find((row) => /base/i.test(row.scenario || '')) || runComparisonTable[0] || null;
        const runAcquisition = readAcquisitionSnapshot(run, runBaseScenario);
        return <div key={run.id} className="pack-row">
          <div>
            <div style={{fontSize:'.8rem',fontWeight:600,marginBottom:'.18rem'}}>{run.scenario_name || 'Scenario Snapshot'}</div>
            <div style={{fontSize:'.74rem',color:'var(--text2)'}}>As of {run.as_of_date} • {run.created_at ? new Date(run.created_at).toLocaleString() : '--'}</div>
            <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.2rem'}}>
              Base set: {assumptionSummary.baseLabel}
              {assumptionSummary.overrideCount > 0 ? ` • overrides: ${assumptionSummary.overrideKeys.join(', ')}` : ' • no stored overrides'}
            </div>
            {runAcquisition && <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.18rem'}}>
              Underwrite: {$pct(runAcquisition.levered_irr_pct ?? runAcquisition.irr_pct)} {runAcquisition.levered_irr_pct != null ? 'levered IRR' : 'IRR'} • {$pct(runAcquisition.year1_cash_on_cash_yield_pct ?? runAcquisition.year1_cash_yield_pct)} {runAcquisition.year1_cash_on_cash_yield_pct != null ? 'cash-on-cash' : 'cash yield'} • {runAcquisitionInputs?.hold_years ?? runAcquisition.hold_years ?? '--'}y hold • {runAcquisition.ltv_pct != null ? `${$(runAcquisition.ltv_pct, 1)}% leverage` : 'leverage unavailable'} • {runAcquisition.refinance_mode === 'modeled' ? `refi Y${runAcquisition.refinance_year}` : 'no refi'}
            </div>}
          </div>
          <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams(run))}>Open</button>
        </div>;
      })}
      </div>
    </details>

  </div>;
}

function readAcquisitionInputs(run) {
  const acquisition = run?.assumptions?.acquisition;
  return acquisition && typeof acquisition === 'object' ? acquisition : null;
}

function readAcquisitionSnapshot(run, fallbackBaseScenario) {
  const saved = run?.comparison?.acquisition_snapshot;
  if (saved && typeof saved === 'object') return saved;
  if (!fallbackBaseScenario) return null;
  if (
    fallbackBaseScenario.irr_pct == null
    && fallbackBaseScenario.moic == null
    && fallbackBaseScenario.year1_cash_yield_pct == null
  ) {
    return null;
  }
  return {
    irr_pct: fallbackBaseScenario.irr_pct ?? null,
    moic: fallbackBaseScenario.moic ?? null,
    year1_cash_yield_pct: fallbackBaseScenario.year1_cash_yield_pct ?? null,
  };
}

function readCreditInputs(run) {
  const credit = run?.assumptions?.credit;
  return credit && typeof credit === 'object' ? credit : null;
}

function formatAcquisitionBasis(basis, kind) {
  if (kind === 'entry') {
    if (basis === 'custom') return 'Custom entry price';
    if (basis === 'benchmark_value') return 'Using current benchmark';
    return 'Entry price unavailable';
  }
  if (basis === 'custom') return 'Custom exit cap';
  if (basis === 'implied_cap_rate') return 'Using current cap rate';
  if (basis === 'required_return') return 'Using required return';
  return 'Exit cap unavailable';
}

function formatTrackedSourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatTrackedSourceType(value) {
  switch (value) {
    case 'county_economic_development':
      return 'COUNTY EDC';
    case 'planning_or_zoning':
      return 'PLANNING / ZONING';
    case 'state_agriculture_or_water':
      return 'STATE AG / WATER';
    case 'utility_or_power':
      return 'UTILITY / POWER';
    case 'operator_or_news':
      return 'OPERATOR / NEWS';
    default:
      return 'OTHER';
  }
}
