import { PG } from '../config.js';
import { $, $$, $pct, parseTags, toast } from '../formatting.js';
import {
  api,
  defaultResearchRecord,
  fetchResearchWorkspaces,
  normalizeResearchRecord,
} from '../auth.js';
import { assumptionSetLabel, summarizeScenarioAssumptions } from '../shared/assumptions-ui.jsx';
import { ErrBox, Loading } from '../shared/system.jsx';
import { CountyPicker, STable } from '../shared/data-ui.jsx';

export function ResearchWorkspace({addToast, nav, params, researchUser, activeAssumptionSet, activeAssumptionSetId}) {
  const [store, setStore] = React.useState({});
  const [storeLoading, setStoreLoading] = React.useState(true);
  const [storeErr, setStoreErr] = React.useState(null);
  const [counties, setCounties] = React.useState([]);
  const [county, setCounty] = React.useState(params?.fips || '');
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
  const [criticalDependenciesInput, setCriticalDependenciesInput] = React.useState('');
  const [missingDataNotesInput, setMissingDataNotesInput] = React.useState('');
  const [approvalState, setApprovalState] = React.useState('');
  const [scenarioRuns, setScenarioRuns] = React.useState([]);

  const statuses = [
    { value:'exploring', label:'Exploring' },
    { value:'watch', label:'Watchlist Candidate' },
    { value:'diligence', label:'In Diligence' },
    { value:'high_conviction', label:'High Conviction' },
    { value:'pass', label:'Pass' },
    { value:'active', label:'Active Position' },
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
    setCriticalDependenciesInput((rec.analysis?.critical_dependencies || []).join(', '));
    setMissingDataNotesInput((rec.analysis?.missing_data_notes || []).join(', '));
    setApprovalState(rec.analysis?.approval_state || '');
  }, [county, store, params?.assetType, params?.targetUseCase]);

  React.useEffect(() => {
    if (!county) return;
    api(`/research/workspaces/${county}/scenario-runs`)
      .then(setScenarioRuns)
      .catch(() => setScenarioRuns([]));
  }, [county, store[county]?.updated_at]);

  const countyMap = React.useMemo(
    () => Object.fromEntries(counties.map(c => [c.fips, `${c.name}, ${c.state}`])),
    [counties]
  );

  const active = county ? normalizeResearchRecord(store[county]) : defaultResearchRecord();
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
  const selectedCountyLabel = county
    ? (countyMap[county] || (params?.countyName ? `${params.countyName}${params?.state ? `, ${params.state}` : ''}` : county))
    : 'None';
  const sourceLabel = params?.sourcePage === 'screener'
    ? 'Screener'
    : params?.sourcePage === 'county'
      ? 'County Detail'
      : '';
  const hasSavedWorkspace = county ? Object.prototype.hasOwnProperty.call(store, county) : false;
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
  const currentCountyName = countyMap[county] ? countyMap[county].split(', ')[0] : params?.countyName;
  const currentState = countyMap[county] ? countyMap[county].split(', ')[1] : params?.state;
  const buildScenarioNavParams = (scenarioRun = null) => ({
    fips: county,
    countyName: currentCountyName,
    state: currentState,
    sourcePage: 'research',
    acquisitionInputs: readAcquisitionInputs(scenarioRun) || latestScenarioAcquisitionInputs || undefined,
    creditInputs: readCreditInputs(scenarioRun) || latestScenarioCreditInputs || undefined,
  });

  const saveWorkspace = async () => {
    if (!county) { addToast(toast('Select a county first', 'err')); return; }
    try {
      const updated = await api(`/research/workspaces/${county}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
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
    .filter(r => r.thesis || r.analysis?.bull_case || r.analysis?.bear_case || r.analysis?.target_use_case || r.analysis?.critical_dependencies?.length || r.analysis?.missing_data_notes?.length || r.tags.length || r.notes.length || r.scenario_packs.length || r.scenario_runs.length)
    .sort((a,b) => (b.updated_at || '').localeCompare(a.updated_at || '')), [store]);

  return <div>
    {storeErr && <ErrBox title="Research Sync Error" msg={storeErr} onRetry={loadStore}/>}
    {county && <div className="card" style={{marginBottom:'.7rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>Workflow Context</div>
          <div style={{fontSize:'1rem',fontWeight:600,marginBottom:'.2rem'}}>{selectedCountyLabel}</div>
          <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
            {sourceLabel ? `Carried forward from ${sourceLabel}. ` : ''}{hasSavedWorkspace ? 'Existing research workspace loaded.' : 'New research workspace ready to capture thesis and next steps.'}
          </div>
        </div>
        <div className="rw-actions" style={{margin:0}}>
          <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, {fips: county})}>Open County Detail</button>
          <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams())}>Open Scenario Lab</button>
        </div>
      </div>
    </div>}
    {county && <div className="card hero-card" style={{marginBottom:'.7rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'.75rem',flexWrap:'wrap',marginBottom:'.7rem'}}>
        <div>
          <div className="hero-k">Investment Memo Snapshot</div>
          <div className="hero-h" style={{fontSize:'1.05rem',marginBottom:'.25rem'}}>{memoVerdict} | {selectedCountyLabel}</div>
          <div className="hero-p" style={{maxWidth:'920px',fontSize:'.82rem'}}>
            {thesisPreview}
          </div>
        </div>
        <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
          <span className="badge badge-a">{String(memoStatus || 'exploring').replace(/_/g, ' ').toUpperCase()}</span>
          <span className={`badge ${conviction >= 75 ? 'badge-g' : conviction >= 45 ? 'badge-a' : 'badge-r'}`}>CONVICTION {Math.round(conviction)}/100</span>
          {assetType && <span className="badge badge-b">{assetType.replace(/_/g, ' ').toUpperCase()}</span>}
          {targetUseCase && <span className="badge badge-b">{targetUseCase.replace(/_/g, ' ').toUpperCase()}</span>}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr',gap:'.75rem'}}>
        <div className="workflow-card">
          <div className="workflow-step">Core View</div>
          <div className="workflow-p">
            <div style={{marginBottom:'.32rem'}}><strong>Thesis:</strong> {thesisPreview}</div>
            <div><strong>Scenario read:</strong> {memoScenarioText}</div>
            <div style={{marginTop:'.35rem'}}><strong>Underwrite:</strong> {memoAcquisitionText}</div>
          </div>
        </div>
        <div className="workflow-card">
          <div className="workflow-step">Upside / Risks</div>
          <div className="workflow-p">
            <div style={{marginBottom:'.32rem'}}><strong>Bull:</strong> {bullCase.trim() || 'Bull case not yet written.'}</div>
            <div><strong>Bear:</strong> {bearCase.trim() || 'Bear case not yet written.'}</div>
            {keyRisks.length > 0 && <div style={{marginTop:'.35rem'}}><strong>Key risks:</strong> {keyRisks.join(', ')}</div>}
          </div>
        </div>
        <div className="workflow-card">
          <div className="workflow-step">What Still Needs Work</div>
          <div className="workflow-p">
            <div style={{marginBottom:'.32rem'}}><strong>Catalysts:</strong> {catalysts.length ? catalysts.join(', ') : 'No catalysts recorded yet.'}</div>
            <div style={{marginBottom:'.32rem'}}><strong>Dependencies:</strong> {criticalDependencies.length ? criticalDependencies.join(', ') : 'No critical dependencies recorded yet.'}</div>
            <div><strong>Missing data:</strong> {missingDataNotes.length ? missingDataNotes.join(', ') : 'No missing-data notes recorded yet.'}</div>
          </div>
        </div>
      </div>
    </div>}
    <div className="card" style={{marginBottom:'.7rem'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:'.75rem'}}>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Active Modeling Context</div>
          <div className="sc-v" style={{fontSize:'.95rem'}}>{assumptionSetLabel(activeAssumptionSet)}</div>
          <div className="sc-c">Dashboard, Screener, County Detail, Compare, Backtest, and new Scenario Lab runs all inherit this saved assumption set.</div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Research Guardrail</div>
          <div className="sc-v" style={{fontSize:'.95rem'}}>REPRODUCIBLE</div>
          <div className="sc-c">Workspace notes do not recalculate on their own, so keep the active set visible when moving between analysis surfaces and saved scenario runs.</div>
        </div>
      </div>
    </div>
    <div className="rw-grid">
      <div className="card">
        <h3 style={{fontSize:'.98rem',marginBottom:'.65rem'}}>Research Workspace</h3>
        <div className="fg"><label>County</label><CountyPicker value={county} onChange={setCounty} placeholder="Select county for research workspace..." selectedLabel={selectedCountyLabel}/></div>
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
        <div className="fg"><label>Tags (comma separated)</label><input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="water, cap-rate, soils, logistics"/></div>
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
        <div className="rw-actions">
          <button className="btn btn-p" onClick={saveWorkspace}>Save Workspace</button>
          {county && <button className="btn" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams())}>Open Scenario Lab</button>}
        </div>
      </div>

      <div className="card">
        <h3 style={{fontSize:'.98rem',marginBottom:'.65rem'}}>Workspace Snapshot</h3>
        <div className="sc"><div className="sc-l">Session User</div><div className="sc-v" style={{fontSize:'.82rem'}}>{researchUser || '--'}</div></div>
        <div className="sc"><div className="sc-l">Selected County</div><div className="sc-v" style={{fontSize:'.95rem'}}>{selectedCountyLabel}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Active Assumption Set</div><div className="sc-v" style={{fontSize:'.82rem'}}>{assumptionSetLabel(activeAssumptionSet)}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Asset Type</div><div className="sc-v" style={{fontSize:'.82rem'}}>{assetType || active.analysis?.asset_type || '--'}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Target Use Case</div><div className="sc-v" style={{fontSize:'.82rem'}}>{targetUseCase || active.analysis?.target_use_case || '--'}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Scenario Packs</div><div className="sc-v">{active.scenario_packs.length}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Scenario Runs</div><div className="sc-v">{scenarioRuns.length}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Research Notes</div><div className="sc-v">{active.notes.length}</div></div>
        <div className="sc" style={{marginTop:'.48rem'}}><div className="sc-l">Last Update</div><div className="sc-v" style={{fontSize:'.82rem'}}>{active.updated_at ? new Date(active.updated_at).toLocaleString() : '--'}</div></div>
      </div>
    </div>

    <div className="card" style={{marginBottom:'.7rem'}}>
      <h3 style={{fontSize:'.95rem',marginBottom:'.55rem'}}>Latest Scenario Snapshot</h3>
      {!latestScenarioRun ? <div className="empty"><p>No saved scenario compare snapshot yet.</p></div> : <div>
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
          {county && <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams(latestScenarioRun))}>Open Scenario Lab</button>}
        </div>
      </div>}
    </div>

    <div className="card" style={{marginBottom:'.7rem'}}>
      <h3 style={{fontSize:'.95rem',marginBottom:'.55rem'}}>Research Notes</h3>
      <div style={{display:'flex',gap:'.45rem',marginBottom:'.6rem'}}>
        <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Add diligence note, risk, catalyst, or follow-up question..." style={{minHeight:'68px',resize:'vertical'}}/>
        <button className="btn btn-p" onClick={addNote}>Add Note</button>
      </div>
      {active.notes.length === 0 ? <div className="empty"><p>No notes yet</p></div>
      : active.notes.map(n => <div className="rw-note" key={n.id}>
        <div style={{flex:1}}>
          <div className="rw-meta">{new Date(n.created_at).toLocaleString()}</div>
          <div style={{fontSize:'.82rem'}}>{n.content}</div>
        </div>
        <button className="btn btn-sm btn-d" onClick={() => deleteNote(n.id)}>Del</button>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:'.7rem'}}>
      <h3 style={{fontSize:'.95rem',marginBottom:'.55rem'}}>Saved Scenario Packs For Selected County</h3>
      {active.scenario_packs.length === 0 ? <div className="empty"><p>No scenario packs saved yet. Save one in Scenario Lab.</p></div>
      : active.scenario_packs.map(pack => <div key={pack.id} className="pack-row">
        <div>
          <div style={{fontSize:'.8rem',fontWeight:600,marginBottom:'.18rem'}}>{pack.name}</div>
          <div style={{fontSize:'.74rem',color:'var(--text2)'}}>Risk Premium {pack.risk_premium}% | Growth {pack.growth_rate}% | Rent Shock {pack.rent_shock}%</div>
        </div>
        <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO,{fips:county,pack_id:pack.id, countyName: countyMap[county] ? countyMap[county].split(', ')[0] : params?.countyName, state: countyMap[county] ? countyMap[county].split(', ')[1] : params?.state, sourcePage: 'research'})}>Open</button>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:'.7rem'}}>
      <h3 style={{fontSize:'.95rem',marginBottom:'.55rem'}}>Scenario Run History</h3>
      {scenarioRuns.length === 0 ? <div className="empty"><p>No scenario compare snapshots yet.</p></div>
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

    <div className="card">
      <h3 style={{fontSize:'.95rem',marginBottom:'.55rem'}}>Research Queue</h3>
      {storeLoading && records.length === 0 ? <Loading/>
      : records.length === 0 ? <div className="empty"><p>No saved research workspaces yet.</p></div>
      : <STable
          cols={[
            {key:'county',label:'County'},
            {key:'status',label:'Status'},
            {key:'conviction',label:'Conviction',num:true,fmt:v => `${Math.round(v)}/100`},
            {key:'tags',label:'Tags',fmt:v => v.join(', ') || '--'},
            {key:'scenario_packs',label:'Packs',num:true,fmt:v => v.length},
            {key:'notes',label:'Notes',num:true,fmt:v => v.length},
            {key:'updated_at',label:'Updated',fmt:v => v ? new Date(v).toLocaleDateString() : '--'},
          ]}
          rows={records.map(r => ({...r, county: countyMap[r.fips] || r.fips}))}
          onRow={r => setCounty(r.fips)}
        />}
    </div>
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
