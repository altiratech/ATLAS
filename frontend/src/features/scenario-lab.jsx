import { PG } from '../config.js';
import {
  $,
  $$,
  $pct,
  toast,
} from '../formatting.js';
import {
  api,
  fetchResearchWorkspace,
} from '../auth.js';
import { AssumptionContextBar, assumptionSetLabel } from '../shared/assumptions-ui.jsx';
import { CountyPicker, MiniBar } from '../shared/data-ui.jsx';

const SCENARIO_PRESETS = [
  { key: 'base', label: 'Base', description: 'Current central case', rp: 4.5, gr: 2.0, rs: 0 },
  { key: 'rate_shock', label: 'Rate Shock', description: 'Higher discount rate, softer growth', rp: 5.5, gr: 1.5, rs: -5 },
  { key: 'rent_downside', label: 'Rent Downside', description: 'Sharper rent reset with modest growth', rp: 4.75, gr: 1.5, rs: -10 },
  { key: 'bull_case', label: 'Bull Case', description: 'Lower premium, better growth, rent upside', rp: 4.0, gr: 3.0, rs: 5 },
  { key: 'credit_stress', label: 'Credit Stress', description: 'Higher premium, lower growth, rent downside', rp: 6.0, gr: 1.0, rs: -10 },
];

export function ScenarioLab({addToast, nav, params, researchUser, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId}) {
  const [county, setCounty] = React.useState(params?.fips || '');
  const [rp, setRp] = React.useState(4.5);
  const [gr, setGr] = React.useState(2.0);
  const [rs, setRs] = React.useState(0);
  const [entryPrice, setEntryPrice] = React.useState('');
  const [holdYears, setHoldYears] = React.useState('5');
  const [exitCapRate, setExitCapRate] = React.useState('');
  const [saleCostPct, setSaleCostPct] = React.useState('2');
  const [acres, setAcres] = React.useState('500');
  const [leverageLtvPct, setLeverageLtvPct] = React.useState('');
  const [leverageLoanRatePct, setLeverageLoanRatePct] = React.useState('');
  const [leverageLoanTermYears, setLeverageLoanTermYears] = React.useState('');
  const [refinanceYear, setRefinanceYear] = React.useState('');
  const [refinanceCapRate, setRefinanceCapRate] = React.useState('');
  const [refinanceLtvPct, setRefinanceLtvPct] = React.useState('');
  const [refinanceLoanRatePct, setRefinanceLoanRatePct] = React.useState('');
  const [refinanceLoanTermYears, setRefinanceLoanTermYears] = React.useState('');
  const [creditRentStressPct, setCreditRentStressPct] = React.useState('-10');
  const [creditRateShockBps, setCreditRateShockBps] = React.useState('100');
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [packName, setPackName] = React.useState('');
  const [packs, setPacks] = React.useState([]);
  const [packsLoading, setPacksLoading] = React.useState(false);
  const navPackRef = React.useRef('');
  const [presetKey, setPresetKey] = React.useState('base');

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
    const acquisitionInputs = params?.acquisitionInputs;
    if (!acquisitionInputs || typeof acquisitionInputs !== 'object') return;
    setEntryPrice(acquisitionInputs.entry_price_per_acre != null ? String(acquisitionInputs.entry_price_per_acre) : '');
    setHoldYears(acquisitionInputs.hold_years != null ? String(acquisitionInputs.hold_years) : '5');
    setExitCapRate(acquisitionInputs.exit_cap_rate != null ? String(acquisitionInputs.exit_cap_rate) : '');
    setSaleCostPct(acquisitionInputs.sale_cost_pct != null ? String(acquisitionInputs.sale_cost_pct) : '2');
    setAcres(acquisitionInputs.acres != null ? String(acquisitionInputs.acres) : '500');
    setLeverageLtvPct(acquisitionInputs.leverage_ltv_pct != null ? String(acquisitionInputs.leverage_ltv_pct) : '');
    setLeverageLoanRatePct(acquisitionInputs.leverage_loan_rate_pct != null ? String(acquisitionInputs.leverage_loan_rate_pct) : '');
    setLeverageLoanTermYears(acquisitionInputs.leverage_loan_term_years != null ? String(acquisitionInputs.leverage_loan_term_years) : '');
    setRefinanceYear(acquisitionInputs.refinance_year != null ? String(acquisitionInputs.refinance_year) : '');
    setRefinanceCapRate(acquisitionInputs.refinance_cap_rate != null ? String(acquisitionInputs.refinance_cap_rate) : '');
    setRefinanceLtvPct(acquisitionInputs.refinance_ltv_pct != null ? String(acquisitionInputs.refinance_ltv_pct) : '');
    setRefinanceLoanRatePct(acquisitionInputs.refinance_loan_rate_pct != null ? String(acquisitionInputs.refinance_loan_rate_pct) : '');
    setRefinanceLoanTermYears(acquisitionInputs.refinance_loan_term_years != null ? String(acquisitionInputs.refinance_loan_term_years) : '');
  }, [params?.acquisitionInputs]);
  React.useEffect(() => {
    const creditInputs = params?.creditInputs;
    if (!creditInputs || typeof creditInputs !== 'object') return;
    setCreditRentStressPct(creditInputs.rent_stress_pct != null ? String(creditInputs.rent_stress_pct) : '-10');
    setCreditRateShockBps(creditInputs.rate_shock_bps != null ? String(creditInputs.rate_shock_bps) : '100');
  }, [params?.creditInputs]);
  React.useEffect(() => {
    const matchedPreset = SCENARIO_PRESETS.find((preset) => preset.rp === Number(rp) && preset.gr === Number(gr) && preset.rs === Number(rs));
    setPresetKey(matchedPreset?.key || 'custom');
  }, [rp, gr, rs]);
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
  }, [params?.pack_id, county, packs, addToast]);

  const applyPreset = (preset) => {
    setRp(preset.rp);
    setGr(preset.gr);
    setRs(preset.rs);
    setPresetKey(preset.key);
    addToast(toast(`Loaded preset: ${preset.label}`, 'ok'));
  };

  const run = async () => {
    if (!county) { addToast(toast('Select a county','err')); return; }
    setLoading(true);
    try {
      const baseOverrides = { risk_premium: rp, long_run_growth: gr / 100, near_term_rent_shock: rs / 100 };
      const scenarioSets = [
        { name: 'Best Case', overrides: { risk_premium: Math.max(2, rp - 0.5), long_run_growth: (gr + 0.5) / 100, near_term_rent_shock: (rs + 5) / 100 } },
        { name: 'Base Case', overrides: baseOverrides },
        { name: 'Worst Case', overrides: { risk_premium: Math.min(8, rp + 0.5), long_run_growth: Math.max(0, gr - 0.5) / 100, near_term_rent_shock: (rs - 5) / 100 } },
      ];
      const d = await api('/run/scenario', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          geo_key: county,
          as_of: 'latest',
          assumption_set_id: activeAssumptionSetId ? Number(activeAssumptionSetId) : undefined,
          overrides: baseOverrides,
          acquisition: {
            entry_price_per_acre: entryPrice === '' ? null : Number(entryPrice),
            hold_years: holdYears === '' ? null : Number(holdYears),
            exit_cap_rate: exitCapRate === '' ? null : Number(exitCapRate),
            sale_cost_pct: saleCostPct === '' ? null : Number(saleCostPct),
            acres: acres === '' ? null : Number(acres),
            leverage_ltv_pct: leverageLtvPct === '' ? null : Number(leverageLtvPct),
            leverage_loan_rate_pct: leverageLoanRatePct === '' ? null : Number(leverageLoanRatePct),
            leverage_loan_term_years: leverageLoanTermYears === '' ? null : Number(leverageLoanTermYears),
            refinance_year: refinanceYear === '' ? null : Number(refinanceYear),
            refinance_cap_rate: refinanceCapRate === '' ? null : Number(refinanceCapRate),
            refinance_ltv_pct: refinanceLtvPct === '' ? null : Number(refinanceLtvPct),
            refinance_loan_rate_pct: refinanceLoanRatePct === '' ? null : Number(refinanceLoanRatePct),
            refinance_loan_term_years: refinanceLoanTermYears === '' ? null : Number(refinanceLoanTermYears),
          },
          credit: {
            rent_stress_pct: creditRentStressPct === '' ? null : Number(creditRentStressPct),
            rate_shock_bps: creditRateShockBps === '' ? null : Number(creditRateShockBps),
          },
          scenario_sets: scenarioSets,
          vary_params: [
            {param:'risk_premium', values:[2,3,4,4.5,5,5.5,6,7], target_metric:'fair_value'},
            {param:'long_run_growth', values:[0.01,0.015,0.02,0.025,0.03,0.035,0.04], target_metric:'fair_value'},
          ],
        }),
      });
      setResult(d);
      try {
        await api(`/research/workspaces/${county}/scenario-runs`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            scenario_name: `${(SCENARIO_PRESETS.find((preset) => preset.key === presetKey)?.label || 'Custom')} Snapshot`,
            as_of_date: d.as_of || 'latest',
            assumptions: {
              base_assumption_set_id: activeAssumptionSetId ? Number(activeAssumptionSetId) : null,
              base_assumption_set_label: assumptionSetLabel(activeAssumptionSet),
              overrides: baseOverrides,
              acquisition: {
                entry_price_per_acre: entryPrice === '' ? null : Number(entryPrice),
                hold_years: holdYears === '' ? null : Number(holdYears),
                exit_cap_rate: exitCapRate === '' ? null : Number(exitCapRate),
                sale_cost_pct: saleCostPct === '' ? null : Number(saleCostPct),
                acres: acres === '' ? null : Number(acres),
                leverage_ltv_pct: leverageLtvPct === '' ? null : Number(leverageLtvPct),
                leverage_loan_rate_pct: leverageLoanRatePct === '' ? null : Number(leverageLoanRatePct),
                leverage_loan_term_years: leverageLoanTermYears === '' ? null : Number(leverageLoanTermYears),
                refinance_year: refinanceYear === '' ? null : Number(refinanceYear),
                refinance_cap_rate: refinanceCapRate === '' ? null : Number(refinanceCapRate),
                refinance_ltv_pct: refinanceLtvPct === '' ? null : Number(refinanceLtvPct),
                refinance_loan_rate_pct: refinanceLoanRatePct === '' ? null : Number(refinanceLoanRatePct),
                refinance_loan_term_years: refinanceLoanTermYears === '' ? null : Number(refinanceLoanTermYears),
              },
              credit: {
                rent_stress_pct: creditRentStressPct === '' ? null : Number(creditRentStressPct),
                rate_shock_bps: creditRateShockBps === '' ? null : Number(creditRateShockBps),
              },
            },
            comparison: {
              comparison_table: d.comparison_table || [],
              driver_decomposition: d.driver_decomposition || [],
              acquisition_snapshot: d.base?.acquisition || null,
              credit_snapshot: d.base?.credit || null,
            },
          }),
        });
      } catch {}
    } catch (e) {
      addToast(toast('Scenario failed', 'err'));
    } finally {
      setLoading(false);
    }
  };

  const base = result?.base;
  const bm = base?.metrics || {};
  const acquisition = base?.acquisition;
  const credit = base?.credit;
  const selectedCountyLabel = params?.countyName
    ? `${params.countyName}${params?.state ? `, ${params.state}` : ''}`
    : (county || 'None');
  const sourceLabel = params?.sourcePage === 'screener'
    ? 'Screener'
    : params?.sourcePage === 'county'
      ? 'County Detail'
      : params?.sourcePage === 'research'
        ? 'Research Workspace'
        : '';

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
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Scenario Base Assumptions"
      description="Scenario Lab starts from this saved assumption set, then applies the slider overrides for risk premium, growth, and rent shock."
    />
    {county && <div className="card" style={{marginBottom:'.7rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>Modeling Context</div>
          <div style={{fontSize:'1rem',fontWeight:600,marginBottom:'.2rem'}}>{selectedCountyLabel}</div>
          <div style={{fontSize:'.8rem',color:'var(--text2)'}}>
            {sourceLabel ? `Opened from ${sourceLabel}. ` : ''}Scenario inputs will run against the selected county without requiring another lookup step.
          </div>
        </div>
        <div className="rw-actions" style={{margin:0}}>
          <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, {fips: county})}>Open County Detail</button>
          <button className="btn btn-sm" onClick={() => nav(PG.RESEARCH, {fips: county, countyName: params?.countyName, state: params?.state, sourcePage: 'scenario', assetType: 'agriculture_land', targetUseCase: 'farmland_investment'})}>Open Research Workspace</button>
        </div>
      </div>
    </div>}
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Scenario Parameters</h3>
      <div className="fg"><label>County</label><CountyPicker value={county} onChange={setCounty} selectedLabel={selectedCountyLabel}/></div>
      <div style={{fontSize:'.7rem',color:'var(--text2)',marginBottom:'.5rem'}}>Session User: {researchUser || '--'}</div>
      <div style={{fontSize:'.74rem',color:'var(--text2)',marginBottom:'.6rem'}}>Base set: {assumptionSetLabel(activeAssumptionSet)}. Scenario controls below override only risk premium, growth, and near-term rent shock.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
        <div className="fg"><label>Risk Premium: {rp}%</label><input type="range" min="2" max="8" step="0.25" value={rp} onChange={e=>setRp(parseFloat(e.target.value))}/></div>
        <div className="fg"><label>Growth Rate: {gr}%</label><input type="range" min="0" max="5" step="0.25" value={gr} onChange={e=>setGr(parseFloat(e.target.value))}/></div>
        <div className="fg"><label>Rent Shock: {rs}%</label><input type="range" min="-20" max="20" step="1" value={rs} onChange={e=>setRs(parseFloat(e.target.value))}/></div>
      </div>
      <div style={{marginTop:'.7rem',borderTop:'1px solid var(--line)',paddingTop:'.6rem'}}>
        <h4 style={{fontSize:'.78rem',marginBottom:'.45rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Scenario Presets</h4>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'.45rem'}}>
          {SCENARIO_PRESETS.map((preset) => <button
            key={preset.key}
            className={`btn btn-sm ${presetKey === preset.key ? 'btn-p' : ''}`}
            onClick={() => applyPreset(preset)}
            title={preset.description}
          >
            {preset.label}
          </button>)}
        </div>
        <div style={{fontSize:'.74rem',color:'var(--text2)',marginTop:'.45rem'}}>
          {SCENARIO_PRESETS.find((preset) => preset.key === presetKey)?.description || 'Custom parameter mix. Save it as a pack if it becomes part of your workflow.'}
        </div>
      </div>
      <div style={{marginTop:'.7rem',borderTop:'1px solid var(--line)',paddingTop:'.6rem'}}>
        <h4 style={{fontSize:'.78rem',marginBottom:'.45rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Acquisition Underwrite</h4>
        <div style={{fontSize:'.74rem',color:'var(--text2)',marginBottom:'.6rem'}}>
          Atlas will run both unlevered and levered deal views on top of the scenario outputs. Leave entry price, exit cap, or leverage fields blank to use the live county benchmark and the active assumption-set debt terms.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'.75rem'}}>
          <div className="fg" style={{margin:0}}>
            <label>Entry $/ac</label>
            <input type="number" min="0" step="1" value={entryPrice} onChange={e=>setEntryPrice(e.target.value)} placeholder="Benchmark default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Hold Years</label>
            <input type="number" min="1" max="15" step="1" value={holdYears} onChange={e=>setHoldYears(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Exit Cap %</label>
            <input type="number" min="0.1" max="25" step="0.1" value={exitCapRate} onChange={e=>setExitCapRate(e.target.value)} placeholder="Current cap default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Sale Cost %</label>
            <input type="number" min="0" max="20" step="0.1" value={saleCostPct} onChange={e=>setSaleCostPct(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Acres</label>
            <input type="number" min="1" step="1" value={acres} onChange={e=>setAcres(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Deal LTV %</label>
            <input type="number" min="0" max="95" step="0.5" value={leverageLtvPct} onChange={e=>setLeverageLtvPct(e.target.value)} placeholder="Assumption-set default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Deal Loan Rate %</label>
            <input type="number" min="0" max="20" step="0.1" value={leverageLoanRatePct} onChange={e=>setLeverageLoanRatePct(e.target.value)} placeholder="Assumption-set default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Deal Loan Term</label>
            <input type="number" min="1" max="40" step="1" value={leverageLoanTermYears} onChange={e=>setLeverageLoanTermYears(e.target.value)} placeholder="Assumption-set default"/>
          </div>
        </div>
        <div style={{marginTop:'.65rem',fontSize:'.74rem',color:'var(--text2)',marginBottom:'.45rem'}}>
          Refinance is optional. If you leave the fields below blank, Atlas will keep the original debt through exit and still show the debt roll-forward schedule.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'.75rem'}}>
          <div className="fg" style={{margin:0}}>
            <label>Refi Year</label>
            <input type="number" min="1" max="15" step="1" value={refinanceYear} onChange={e=>setRefinanceYear(e.target.value)} placeholder="Optional"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Refi Cap %</label>
            <input type="number" min="0.1" max="25" step="0.1" value={refinanceCapRate} onChange={e=>setRefinanceCapRate(e.target.value)} placeholder="Exit cap default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Refi LTV %</label>
            <input type="number" min="0" max="95" step="0.5" value={refinanceLtvPct} onChange={e=>setRefinanceLtvPct(e.target.value)} placeholder="Deal LTV default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Refi Loan Rate %</label>
            <input type="number" min="0" max="20" step="0.1" value={refinanceLoanRatePct} onChange={e=>setRefinanceLoanRatePct(e.target.value)} placeholder="Deal loan-rate default"/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Refi Loan Term</label>
            <input type="number" min="1" max="40" step="1" value={refinanceLoanTermYears} onChange={e=>setRefinanceLoanTermYears(e.target.value)} placeholder="Deal loan-term default"/>
          </div>
        </div>
      </div>
      <div style={{marginTop:'.7rem',borderTop:'1px solid var(--line)',paddingTop:'.6rem'}}>
        <h4 style={{fontSize:'.78rem',marginBottom:'.45rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Lender / Credit Stress</h4>
        <div style={{fontSize:'.74rem',color:'var(--text2)',marginBottom:'.6rem'}}>
          Atlas uses the active LTV, loan rate, and term from the current assumption set, then applies the rent and rate shocks below to show downside debt-service resilience.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'.75rem'}}>
          <div className="fg" style={{margin:0}}>
            <label>Rent Stress %</label>
            <input type="number" min="-50" max="25" step="1" value={creditRentStressPct} onChange={e=>setCreditRentStressPct(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Rate Shock (bps)</label>
            <input type="number" min="0" max="1000" step="25" value={creditRateShockBps} onChange={e=>setCreditRateShockBps(e.target.value)}/>
          </div>
        </div>
      </div>
      <div className="rw-actions">
        <button className="btn btn-p" onClick={run} disabled={loading}>{loading ? 'Running...' : 'Run Scenario'}</button>
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
      {acquisition && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Acquisition Underwrite</h3>
        <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.65rem'}}>
          Atlas is showing unlevered and levered deal views using the active scenario NOI path. Entry defaults to the Atlas benchmark, exit cap defaults to the current implied cap, leverage defaults to the active assumption set unless you override it, and refinance stays optional.
        </div>
        <div className="sg">
          <div className="sc"><div className="sc-l">Entry $/ac</div><div className="sc-v">{$$(acquisition.entry_price_per_acre)}</div><div className="sc-c">{formatAcquisitionBasis(acquisition.entry_price_basis, 'entry')}</div></div>
          <div className="sc"><div className="sc-l">Deal Size</div><div className="sc-v">{$$(acquisition.deal_size)}</div><div className="sc-c">{Number(acquisition.acres || 0).toLocaleString()} acres</div></div>
          <div className="sc"><div className="sc-l">Year 1 Cash Yield</div><div className="sc-v">{$pct(acquisition.year1_cash_yield_pct)}</div><div className="sc-c">NOI / entry price</div></div>
          <div className="sc"><div className="sc-l">Year 1 Cash-on-Cash</div><div className="sc-v">{$pct(acquisition.year1_cash_on_cash_yield_pct)}</div><div className="sc-c">{formatLeverageMode(acquisition.leverage_mode)}</div></div>
          <div className="sc"><div className="sc-l">IRR</div><div className="sc-v">{$pct(acquisition.irr_pct)}</div><div className="sc-c">{acquisition.hold_years}-year unlevered</div></div>
          <div className="sc"><div className="sc-l">Levered IRR</div><div className="sc-v">{$pct(acquisition.levered_irr_pct)}</div><div className="sc-c">{formatLeverageMode(acquisition.leverage_mode)}</div></div>
          <div className="sc"><div className="sc-l">MOIC</div><div className="sc-v">{acquisition.moic != null ? `${$(acquisition.moic,2)}x` : 'N/A'}</div><div className="sc-c">NOI + exit / entry</div></div>
          <div className="sc"><div className="sc-l">Levered MOIC</div><div className="sc-v">{acquisition.levered_moic != null ? `${$(acquisition.levered_moic,2)}x` : 'N/A'}</div><div className="sc-c">Cash after debt + exit equity / equity check</div></div>
          <div className="sc"><div className="sc-l">Equity Check</div><div className="sc-v">{$$(acquisition.equity_check_total)}</div><div className="sc-c">{acquisition.ltv_pct != null ? `${$(acquisition.ltv_pct,1)}% deal leverage` : 'Leverage unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Net Exit Equity</div><div className="sc-v">{$$(acquisition.net_exit_equity_total)}</div><div className="sc-c">{acquisition.exit_cap_rate != null ? `${$(acquisition.exit_cap_rate,2)}% exit cap` : 'Exit cap unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Levered Profit</div><div className="sc-v">{$$(acquisition.levered_total_profit)}</div><div className="sc-c">{acquisition.entry_discount_to_fair_value_pct != null ? `${acquisition.entry_discount_to_fair_value_pct >= 0 ? '+' : ''}${$(acquisition.entry_discount_to_fair_value_pct,2)}% vs fair value` : 'Fair value discount unavailable'}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem',marginTop:'.75rem'}}>
          <div className="workflow-card">
            <div className="workflow-step">Underwrite Inputs</div>
            <div className="workflow-p">
              <div style={{marginBottom:'.28rem'}}><strong>Hold:</strong> {acquisition.hold_years} years</div>
              <div style={{marginBottom:'.28rem'}}><strong>Growth:</strong> {$pct(acquisition.annual_noi_growth_pct)}</div>
              <div style={{marginBottom:'.28rem'}}><strong>Near-term shock:</strong> {$pct(acquisition.near_term_rent_shock_pct)}</div>
              <div style={{marginBottom:'.28rem'}}><strong>Leverage:</strong> {acquisition.ltv_pct != null ? `${$(acquisition.ltv_pct,1)}% @ ${$pct(acquisition.loan_rate_pct)} / ${acquisition.loan_term_years}y` : 'Unavailable'}</div>
              <div><strong>Sale costs:</strong> {$pct(acquisition.sale_cost_pct)}</div>
            </div>
          </div>
          <div className="workflow-card">
            <div className="workflow-step">Deal Read</div>
            <div className="workflow-p">
              {(acquisition.notes || []).map((note, idx) => <div key={idx} style={{marginBottom:'.28rem'}}>• {note}</div>)}
            </div>
          </div>
        </div>
        <div style={{marginTop:'.75rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
          <div className="workflow-card">
            <div className="workflow-step">Debt Roll-Forward</div>
            <div className="workflow-p">
              {(acquisition.balance_roll_forward || []).length === 0
                ? 'Debt roll-forward is unavailable for this deal view.'
                : acquisition.balance_roll_forward.map((point) => <div key={point.year} style={{marginBottom:'.28rem'}}>• Year {point.year}: {$$(point.balance_per_acre)} / ac balance</div>)}
            </div>
          </div>
          <div className="workflow-card">
            <div className="workflow-step">Refinance View</div>
            <div className="workflow-p">
              {acquisition.refinance_mode === 'modeled'
                ? <>
                    <div style={{marginBottom:'.28rem'}}><strong>Refi Year:</strong> {acquisition.refinance_year}</div>
                    <div style={{marginBottom:'.28rem'}}><strong>Refi Value / ac:</strong> {$$(acquisition.refinance_value_per_acre)}</div>
                    <div style={{marginBottom:'.28rem'}}><strong>Cash Out / ac:</strong> {$$(acquisition.refinance_cash_out_per_acre)}</div>
                    <div style={{marginBottom:'.28rem'}}><strong>Refi DSCR:</strong> {acquisition.refinance_dscr != null ? `${$(acquisition.refinance_dscr,2)}x` : 'N/A'}</div>
                    <div><strong>Exit Balance After Refi:</strong> {$$(acquisition.exit_remaining_balance_after_refi_per_acre)}</div>
                  </>
                : acquisition.refinance_mode === 'invalid'
                  ? 'Refinance inputs are invalid for the selected hold. Clear or adjust them to restore refinance outputs.'
                  : 'No refinance modeled. Atlas is holding the original debt through exit while still showing debt paydown above.'}
            </div>
          </div>
        </div>
      </div>}
      {credit && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Lender / Credit Stress</h3>
        <div style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.65rem'}}>
          Debt stress uses the active leverage assumptions and tests how current NOI holds up under rent and refinancing pressure.
        </div>
        <div className="sg">
          <div className="sc"><div className="sc-l">Base DSCR</div><div className="sc-v">{$(credit.base_dscr,2)}x</div><div className="sc-c">Current NOI / annual debt service</div></div>
          <div className="sc"><div className="sc-l">Rent Stress DSCR</div><div className="sc-v">{$(credit.rent_stress_dscr,2)}x</div><div className="sc-c">{credit.rent_stress_pct != null ? `${$(credit.rent_stress_pct,1)}% NOI shock` : 'Rent stress unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Rate Stress DSCR</div><div className="sc-v">{$(credit.rate_stress_dscr,2)}x</div><div className="sc-c">{credit.rate_shock_bps != null ? `+${$(credit.rate_shock_bps,0)} bps loan rate` : 'Rate stress unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Combined Stress DSCR</div><div className="sc-v">{$(credit.combined_stress_dscr,2)}x</div><div className="sc-c">Rent + rate stress together</div></div>
          <div className="sc"><div className="sc-l">Debt Yield</div><div className="sc-v">{$pct(credit.debt_yield_pct)}</div><div className="sc-c">NOI / debt basis</div></div>
          <div className="sc"><div className="sc-l">Break-even Rent</div><div className="sc-v">{$$(credit.break_even_rent)}</div><div className="sc-c">Rent needed to clear required return</div></div>
          <div className="sc"><div className="sc-l">Debt / Acre</div><div className="sc-v">{$$(credit.debt_per_acre)}</div><div className="sc-c">{credit.ltv != null ? `${$(credit.ltv,1)}% LTV` : 'LTV unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Annual Debt Service</div><div className="sc-v">{$$(credit.annual_debt_service_per_acre)}</div><div className="sc-c">{credit.loan_rate_pct != null ? `${$(credit.loan_rate_pct,2)}% / ${credit.loan_term_years}y` : 'Debt terms unavailable'}</div></div>
          <div className="sc"><div className="sc-l">Value Cushion</div><div className="sc-v">{$pct(credit.value_decline_to_100_ltv_pct)}</div><div className="sc-c">Benchmark decline before 100% LTV</div></div>
          <div className="sc"><div className="sc-l">Fair Value LTV</div><div className="sc-v">{$pct(credit.fair_value_ltv_pct)}</div><div className="sc-c">{credit.fair_value_equity_cushion_pct != null ? `${$pct(credit.fair_value_equity_cushion_pct)} equity cushion at fair value` : 'Fair value cushion unavailable'}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem',marginTop:'.75rem'}}>
          <div className="workflow-card">
            <div className="workflow-step">Stress Inputs</div>
            <div className="workflow-p">
              <div style={{marginBottom:'.28rem'}}><strong>Base loan rate:</strong> {$pct(credit.loan_rate_pct)}</div>
              <div style={{marginBottom:'.28rem'}}><strong>Term / leverage:</strong> {credit.loan_term_years} years • {$pct(credit.ltv)}</div>
              <div style={{marginBottom:'.28rem'}}><strong>Rent stress:</strong> {$pct(credit.rent_stress_pct)}</div>
              <div><strong>Rate shock:</strong> {credit.rate_shock_bps != null ? `${$(credit.rate_shock_bps,0)} bps` : 'N/A'}</div>
            </div>
          </div>
          <div className="workflow-card">
            <div className="workflow-step">Credit Read</div>
            <div className="workflow-p">
              {(credit.notes || []).map((note, idx) => <div key={idx} style={{marginBottom:'.28rem'}}>• {note}</div>)}
            </div>
          </div>
        </div>
      </div>}
      {result.sensitivities && Object.keys(result.sensitivities).length > 0 && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Sensitivity Analysis</h3>
        {Object.entries(result.sensitivities).map(([param, values]) => <div key={param} style={{marginBottom:'1rem'}}>
          <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem',textTransform:'capitalize'}}>{param.replace(/_/g,' ')}</h4>
          <MiniBar items={values.map(v => ({label:String(v.input_value), value:v.fair_value || 0}))} height={80}/>
        </div>)}
      </div>}
      {result.comparison_table && result.comparison_table.length > 0 && <div className="card">
        <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Scenario Compare</h3>
        <div className="tc"><table>
          <thead><tr><th>Scenario</th><th>Fair Value</th><th>Cap Rate</th><th>NOI</th><th>IRR</th><th>Levered IRR</th><th>MOIC</th><th>COC</th><th>DSCR</th><th>Stress DSCR</th><th>Δ vs Base</th></tr></thead>
          <tbody>{result.comparison_table.map(row => <tr key={row.scenario}>
            <td>{row.scenario}</td>
            <td className="n">{$$(row.fair_value)}</td>
            <td className="n">{$pct(row.implied_cap_rate)}</td>
            <td className="n">{$$(row.noi_per_acre)}</td>
            <td className="n">{$pct(row.irr_pct)}</td>
            <td className="n">{$pct(row.levered_irr_pct)}</td>
            <td className="n">{row.moic != null ? `${$(row.moic,2)}x` : 'N/A'}</td>
            <td className="n">{$pct(row.year1_cash_on_cash_yield_pct)}</td>
            <td className="n">{row.dscr != null ? `${$(row.dscr,2)}x` : 'N/A'}</td>
            <td className="n">{row.combined_stress_dscr != null ? `${$(row.combined_stress_dscr,2)}x` : 'N/A'}</td>
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

function formatLeverageMode(mode) {
  if (mode === 'cash') return 'Cash deal view';
  if (mode === 'invalid') return 'Invalid leverage inputs';
  return 'Levered deal view';
}
