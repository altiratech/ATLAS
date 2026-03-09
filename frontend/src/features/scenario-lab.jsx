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
import { CountyPicker, MiniBar } from '../shared/data-ui.jsx';

const SCENARIO_PRESETS = [
  { key: 'base', label: 'Base', description: 'Current central case', rp: 4.5, gr: 2.0, rs: 0 },
  { key: 'rate_shock', label: 'Rate Shock', description: 'Higher discount rate, softer growth', rp: 5.5, gr: 1.5, rs: -5 },
  { key: 'rent_downside', label: 'Rent Downside', description: 'Sharper rent reset with modest growth', rp: 4.75, gr: 1.5, rs: -10 },
  { key: 'bull_case', label: 'Bull Case', description: 'Lower premium, better growth, rent upside', rp: 4.0, gr: 3.0, rs: 5 },
  { key: 'credit_stress', label: 'Credit Stress', description: 'Higher premium, lower growth, rent downside', rp: 6.0, gr: 1.0, rs: -10 },
];

export function ScenarioLab({addToast, nav, params, researchUser}) {
  const [county, setCounty] = React.useState(params?.fips || '');
  const [rp, setRp] = React.useState(4.5);
  const [gr, setGr] = React.useState(2.0);
  const [rs, setRs] = React.useState(0);
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
          overrides: baseOverrides,
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
            assumptions: baseOverrides,
            comparison: {
              comparison_table: d.comparison_table || [],
              driver_decomposition: d.driver_decomposition || [],
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
      <div className="fg"><label>County</label><CountyPicker value={county} onChange={setCounty}/></div>
      <div style={{fontSize:'.7rem',color:'var(--text2)',marginBottom:'.5rem'}}>Session User: {researchUser || '--'}</div>
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
          <thead><tr><th>Scenario</th><th>Fair Value</th><th>Cap Rate</th><th>NOI</th><th>Δ vs Base</th></tr></thead>
          <tbody>{result.comparison_table.map(row => <tr key={row.scenario}>
            <td>{row.scenario}</td>
            <td className="n">{$$(row.fair_value)}</td>
            <td className="n">{$pct(row.implied_cap_rate)}</td>
            <td className="n">{$$(row.noi_per_acre)}</td>
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
