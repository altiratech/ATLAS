export const WIRED_ASSUMPTION_FIELDS = [
  { key: 'risk_premium', label: 'Risk Premium', step: '0.01', note: 'Adds to base rate to derive required return.' },
  { key: 'long_run_growth', label: 'Long-Run Growth', step: '0.001', note: 'Used in fair value and rate duration.' },
  { key: 'near_term_rent_shock', label: 'Near-Term Rent Shock', step: '0.001', note: 'Applies a near-term rent stress or uplift.' },
  { key: 'cost_pct', label: 'Cost %', step: '0.001', note: 'Used in owner costs, NOI, and break-even rent.' },
  { key: 'grain_price', label: 'Grain Price', step: '0.01', note: 'Fallback for rent-to-revenue proxy when market data is absent.' },
  { key: 'ltv', label: 'LTV', step: '0.001', note: 'Used in DSCR and debt sizing.' },
  { key: 'loan_rate', label: 'Loan Rate', step: '0.001', note: 'Used in DSCR debt service calculations.' },
  { key: 'loan_term_years', label: 'Loan Term Years', step: '1', note: 'Used in DSCR amortization.' },
  { key: 'base_rate_default', label: 'Base Rate Default', step: '0.01', note: 'Fallback only when treasury data is missing.' },
];

export const STORED_ONLY_ASSUMPTION_FIELDS = [
  { key: 'base_rate_series', label: 'Base Rate Series' },
  { key: 'vacancy', label: 'Vacancy' },
  { key: 'capex_reserve_pct', label: 'Capex Reserve %' },
];

export function assumptionSetLabel(set) {
  if (!set) return 'Default (latest)';
  return `${set.name} v${set.version}`;
}

export function appendAssumptionParam(path, assumptionSetId) {
  if (!assumptionSetId) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}assumption_set_id=${encodeURIComponent(String(assumptionSetId))}`;
}

export function buildVersionedAssumptionParams(baseParams, nextValues) {
  const merged = { ...(baseParams || {}) };
  for (const field of WIRED_ASSUMPTION_FIELDS) {
    const raw = nextValues?.[field.key];
    if (raw == null || raw === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) merged[field.key] = parsed;
  }
  return merged;
}

export function summarizeScenarioAssumptions(assumptions) {
  const safe = assumptions && typeof assumptions === 'object' ? assumptions : {};
  const usesStructuredBase = Object.prototype.hasOwnProperty.call(safe, 'base_assumption_set_id')
    || Object.prototype.hasOwnProperty.call(safe, 'base_assumption_set_label')
    || Object.prototype.hasOwnProperty.call(safe, 'overrides');
  const overrideSource = usesStructuredBase
    ? (safe.overrides && typeof safe.overrides === 'object' ? safe.overrides : {})
    : safe;
  const overrideEntries = Object.entries(overrideSource).filter(([, value]) => value != null && value !== '');
  return {
    baseId: safe.base_assumption_set_id ?? null,
    baseLabel: typeof safe.base_assumption_set_label === 'string' && safe.base_assumption_set_label
      ? safe.base_assumption_set_label
      : (usesStructuredBase ? 'Saved set unavailable' : 'Legacy ad hoc overrides'),
    overrideCount: overrideEntries.length,
    overrideKeys: overrideEntries.map(([key]) => key),
  };
}

export function AssumptionContextBar({
  assumptionSets,
  activeAssumptionSetId,
  activeAssumptionSet,
  onChange,
  title = 'Assumption Set',
  description = 'Model outputs on this page use the active assumption set.',
}) {
  return <div className="card" style={{marginBottom:'.7rem',padding:'.65rem .75rem'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',flexWrap:'wrap'}}>
      <div>
        <div style={{fontSize:'.72rem',letterSpacing:'.12em',textTransform:'uppercase',color:'var(--text2)',marginBottom:'.2rem'}}>{title}</div>
        <div style={{fontSize:'1rem',fontWeight:600,marginBottom:'.2rem'}}>{assumptionSetLabel(activeAssumptionSet)}</div>
        <div style={{fontSize:'.8rem',color:'var(--text2)'}}>{description}</div>
      </div>
      <div className="fg" style={{margin:0,minWidth:'260px',flex:'0 1 320px'}}>
        <label>Active Assumption Set</label>
        <select value={activeAssumptionSetId ? String(activeAssumptionSetId) : ''} onChange={(e) => onChange?.(e.target.value)}>
          {assumptionSets.map((set) => <option key={set.id} value={String(set.id)}>{assumptionSetLabel(set)}</option>)}
        </select>
      </div>
    </div>
  </div>;
}
