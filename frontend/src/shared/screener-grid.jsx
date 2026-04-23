import { PG } from '../config.js';
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
  productivityBand,
  sourceBand,
  zBand,
} from '../formatting.js';
import { buildScreenReasons } from './atlas-read.js';

export const DEFAULT_SCREENER_VISIBLE_COLUMNS = [
  'county',
  'state',
  '_read',
  'source_quality',
  'benchmark_method',
  'productivity_active',
  '_yield_factor',
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

export const DEFAULT_SCREENER_ROW_COLORING = 'atlas_read';

export function getDefaultScreenerViewState() {
  return {
    visibleColumns: [...DEFAULT_SCREENER_VISIBLE_COLUMNS],
    columnOrder: null,
    groupBy: '',
    rowColoring: DEFAULT_SCREENER_ROW_COLORING,
  };
}

export function hydrateScreenerRows(rows, activeScreenFilters, activeThesisKey) {
  return (rows || []).map((r) => {
    const fair = r.metrics?.fair_value;
    const benchmark = r.metrics?.benchmark_value;
    const spread = fair != null && benchmark != null && benchmark > 0
      ? ((fair - benchmark) / benchmark) * 100
      : null;
    const why = buildScreenReasons(r, activeScreenFilters, activeThesisKey);
    return {
      ...r,
      _cash_rent: r.metrics?.cash_rent,
      _bv: benchmark,
      _cap: r.metrics?.implied_cap_rate,
      _fv: fair,
      _spread: spread,
      _rm: r.metrics?.rent_multiple,
      _noi: r.metrics?.noi_per_acre,
      _access: r.metrics?.access_score,
      _yield_factor: r.metrics?.yield_productivity_factor,
      _flood: r.flood?.hazard_score,
      _flood_agloss: r.flood?.ag_loss_rate_pct,
      _irrigated: r.irrigation?.irrigated_acres,
      _soil_share: r.soil?.significant_share_pct,
      _soil_aws100: r.soil?.rootzone_aws_100cm,
      _industrial_lineage: r.industrial?.lineage,
      _pidx: r.industrial?.power_cost_index,
      _ppx: r.industrial?.industrial_power_price,
      _zcap: r.zscores?.implied_cap_rate?.zscore,
      _zfv: r.zscores?.fair_value?.zscore,
      _zrent: r.zscores?.cash_rent?.zscore,
      _read: why.overall?.label,
      _why: why,
      _why_detail: why.reasons?.join(' • '),
      _workflow: r.fips,
    };
  });
}

export function getScreenerRowAccent(row, rowColoring = DEFAULT_SCREENER_ROW_COLORING) {
  if (!row || rowColoring === 'none') return null;
  if (rowColoring === 'atlas_read') {
    const cls = row?._why?.overall?.className;
    if (cls === 'badge-g') return 'var(--green)';
    if (cls === 'badge-r') return 'var(--red)';
    if (cls === 'badge-a') return 'var(--amber)';
    if (cls === 'badge-b') return 'var(--accent-2)';
  }
  return null;
}

export function ScreenerRecordPanel({ row, nav, workflowParams }) {
  if (!row) return null;
  const overall = row._why?.overall;
  const droughtBadge = droughtRiskBand(row.drought);
  const floodBadge = floodRiskBand(row.flood);
  const sourceBadge = sourceBand(row.source_quality);
  const basisBadge = benchmarkMethodBand(row.benchmark_method);
  const productivityBadge = productivityBand(row.productivity_active);

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', marginBottom: '.75rem' }}>
      <div>
        <div style={{ fontSize: '.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '.22rem' }}>County Record</div>
        <h3 style={{ fontSize: '1.18rem', marginBottom: '.18rem' }}>{row.county}, {row.state}</h3>
        <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>FIPS {row.fips}</div>
      </div>
      {overall && <span className={`badge ${overall.className}`}>{overall.label}</span>}
    </div>

    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
      <span className={`badge ${sourceBadge.className}`}>{sourceBadge.label}</span>
      <span className={`badge ${basisBadge.className}`}>{basisBadge.label}</span>
      <span className={`badge ${productivityBadge.className}`}>{productivityBadge.label}</span>
      <span className={`badge ${droughtBadge.className}`}>{droughtBadge.label}</span>
      <span className={`badge ${floodBadge.className}`}>{floodBadge.label}</span>
    </div>

    <div className="sc" style={{ marginTop: 0, marginBottom: '.75rem' }}>
      <div className="sc-l">Decision Read</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
        {(row._why?.reasons || []).length > 0
          ? row._why.reasons.slice(0, 4).map((reason) => <div key={reason}>• {reason}</div>)
          : <div>• No detailed reasons available yet.</div>}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: '.55rem', marginBottom: '.75rem' }}>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Benchmark Value</div>
        <div className="sc-v">{$$(row.metrics?.benchmark_value)}</div>
        <div className="sc-c">Current underwriting anchor / acre</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Fair Value</div>
        <div className="sc-v">{$$(row.metrics?.fair_value)}</div>
        <div className="sc-c">Active-assumption modeled output / acre</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Cap Rate</div>
        <div className="sc-v">{$pct(row.metrics?.implied_cap_rate)}</div>
        <div className="sc-c">Implied based on benchmark / NOI</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">NOI / ac</div>
        <div className="sc-v">{$$(row.metrics?.noi_per_acre)}</div>
        <div className="sc-c">Net income per acre</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Yield Factor</div>
        <div className="sc-v">{$(row.metrics?.yield_productivity_factor, 2)}</div>
        <div className="sc-c">Relative productivity proxy</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Access Score</div>
        <div className="sc-v">{$(row.metrics?.access_score, 1)}</div>
        <div className="sc-c">Atlas access composite</div>
      </div>
    </div>

    <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.85rem' }}>
      <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}><strong style={{ color: 'var(--text1)' }}>Drought:</strong> {row.drought?.summary || 'No drought summary loaded.'}</div>
      <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}><strong style={{ color: 'var(--text1)' }}>Flood:</strong> {row.flood?.summary || 'No flood summary loaded.'}</div>
      <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}><strong style={{ color: 'var(--text1)' }}>Irrigation:</strong> {row.irrigation?.summary || 'No irrigation summary loaded.'}</div>
      <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}><strong style={{ color: 'var(--text1)' }}>Soil:</strong> {row.soil?.summary || 'No soil summary loaded.'}</div>
    </div>

    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
      <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, { fips: row.fips })}>Open County</button>
      <button className="btn btn-sm" onClick={() => nav(PG.RESEARCH, workflowParams(row))}>Open Research</button>
      <button className="btn btn-sm btn-p" onClick={() => nav(PG.RESEARCH, workflowParams(row))}>Research Before Scenario</button>
    </div>
  </div>;
}

export function getScreenerColumns({ nav, workflowParams }) {
  return [
    {
      key: 'county',
      label: 'County',
      type: 'text',
      domain: 'Overview',
      groupable: false,
      filterable: false,
      renderCell: (_, r) => <div>
        <div>{r.county}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--text2)', marginTop: '.18rem' }}>{r._why?.reasons?.[0] || 'County-level underwriting row'}</div>
      </div>,
    },
    { key: 'state', label: 'ST', type: 'text', domain: 'Overview', groupable: true, filterable: true },
    {
      key: '_read',
      label: 'Read',
      type: 'badge',
      domain: 'Overview',
      sortable: false,
      groupable: true,
      filterable: false,
      groupLabel: (value) => value || 'Unrated',
      renderCell: (_, r) => <span className={`badge ${r._why?.overall?.className || 'badge-a'}`}>{r._why?.overall?.label || 'N/A'}</span>,
    },
    {
      key: 'source_quality',
      label: 'Data',
      type: 'badge',
      domain: 'Overview',
      groupable: true,
      filterable: true,
      groupLabel: (value) => sourceBand(value).label,
      renderCell: (value, r) => {
        const badge = sourceBand(value);
        return <span className={`badge ${badge.className}`} title={r.benchmark_method_detail || r.source_quality_detail || 'Source quality detail unavailable.'}>{badge.label}</span>;
      },
    },
    {
      key: 'benchmark_method',
      label: 'Basis',
      type: 'badge',
      domain: 'Overview',
      groupable: true,
      filterable: true,
      groupLabel: (value) => benchmarkMethodBand(value).label,
      renderCell: (value, r) => {
        const badge = benchmarkMethodBand(value);
        return <span className={`badge ${badge.className}`} title={r.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{badge.label}</span>;
      },
    },
    {
      key: '_industrial_lineage',
      label: 'Ind',
      type: 'badge',
      domain: 'Power & Industrial',
      groupable: true,
      filterable: false,
      groupLabel: (value) => industrialLineageBand(value).label,
      renderCell: (_, r) => {
        const badge = industrialLineageBand(r.industrial?.lineage);
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    },
    {
      key: 'productivity_active',
      label: 'Prod',
      type: 'badge',
      domain: 'Productivity & Ag',
      groupable: true,
      filterable: true,
      groupLabel: (value) => productivityBand(value).label,
      renderCell: (value) => {
        const badge = productivityBand(value);
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    },
    { key: '_yield_factor', label: 'Yld Fx', type: 'number', num: true, domain: 'Productivity & Ag', sortKey: 'yield_productivity_factor', groupable: false, aggregateFn: 'avg', renderCell: (_, r) => $(r.metrics?.yield_productivity_factor, 2) },
    { key: '_cash_rent', label: 'Cash Rent', type: 'currency', num: true, domain: 'Land & Valuation', sortKey: 'cash_rent', aggregateFn: 'avg', renderCell: (_, r) => $$(r.metrics?.cash_rent) },
    { key: '_bv', label: 'Benchmark Value', type: 'currency', num: true, domain: 'Land & Valuation', sortKey: 'benchmark_value', aggregateFn: 'avg', renderCell: (_, r) => <span title={r.benchmark_method_detail || 'Benchmark method detail unavailable.'}>{$$(r.metrics?.benchmark_value)}</span> },
    { key: '_noi', label: 'NOI/ac', type: 'currency', num: true, domain: 'Land & Valuation', sortKey: 'noi_per_acre', aggregateFn: 'avg', renderCell: (_, r) => $$(r.metrics?.noi_per_acre) },
    { key: '_cap', label: 'Cap Rate', type: 'percent', num: true, domain: 'Land & Valuation', sortKey: 'implied_cap_rate', aggregateFn: 'avg', renderCell: (_, r) => $pct(r.metrics?.implied_cap_rate) },
    { key: '_fv', label: 'Fair Value', type: 'currency', num: true, domain: 'Land & Valuation', sortKey: 'fair_value', aggregateFn: 'avg', renderCell: (_, r) => $$(r.metrics?.fair_value) },
    {
      key: '_spread',
      label: 'Spread',
      type: 'percent',
      num: true,
      domain: 'Land & Valuation',
      sortable: false,
      renderCell: (_, r) => {
        const value = r._spread;
        return value == null ? '--' : <span className={value > 0 ? 'pos' : 'neg'}>{$chg(value)}</span>;
      },
    },
    { key: '_rm', label: 'Rent Mult', type: 'number', num: true, domain: 'Land & Valuation', sortKey: 'rent_multiple', aggregateFn: 'avg', renderCell: (_, r) => $(r.metrics?.rent_multiple, 1) },
    { key: '_access', label: 'Access', type: 'number', num: true, domain: 'Infrastructure', sortKey: 'access_score', aggregateFn: 'avg', renderCell: (_, r) => $(r.metrics?.access_score, 1) },
    {
      key: '_drought',
      label: 'Drought',
      type: 'badge',
      num: true,
      domain: 'Hazards',
      sortKey: 'drought_risk_score',
      renderCell: (_, r) => {
        const badge = droughtRiskBand(r.drought);
        return <span className={`badge ${badge.className}`} title={r.drought?.summary || 'FEMA drought evidence not loaded yet.'}>{badge.label}</span>;
      },
    },
    { key: '_agloss', label: 'Drought Ag Loss %', type: 'percent', num: true, domain: 'Hazards', sortable: false, renderCell: (_, r) => $pct(r.drought?.ag_loss_rate_pct) },
    {
      key: '_flood',
      label: 'Flood',
      type: 'badge',
      num: true,
      domain: 'Hazards',
      sortKey: 'flood_hazard_score',
      renderCell: (_, r) => {
        const badge = floodRiskBand(r.flood);
        return <span className={`badge ${badge.className}`} title={r.flood?.summary || 'FEMA flood evidence not loaded yet.'}>{badge.label}</span>;
      },
    },
    { key: '_flood_agloss', label: 'Flood Ag Loss %', type: 'percent', num: true, domain: 'Hazards', sortable: false, renderCell: (_, r) => $pct(r.flood?.ag_loss_rate_pct) },
    { key: '_irrigated', label: 'Irrigated Acres', type: 'number', num: true, domain: 'Productivity & Ag', sortKey: 'irrigated_ag_land_acres', aggregateFn: 'sum', renderCell: (_, r) => <span title={r.irrigation?.summary || 'USDA irrigation footprint not loaded yet.'}>{$int(r.irrigation?.irrigated_acres)}</span> },
    { key: '_soil_share', label: 'NRCS Farmland %', type: 'percent', num: true, domain: 'Soil & Water', sortKey: 'soil_significant_farmland_share_pct', aggregateFn: 'avg', renderCell: (_, r) => <span title={r.soil?.summary || 'NRCS soil evidence not loaded yet.'}>{$pct(r.soil?.significant_share_pct)}</span> },
    { key: '_soil_aws100', label: 'AWS 100cm', type: 'number', num: true, domain: 'Soil & Water', sortKey: 'soil_rootzone_aws_100cm', aggregateFn: 'avg', renderCell: (_, r) => <span title={r.soil?.summary || 'NRCS soil evidence not loaded yet.'}>{$(r.soil?.rootzone_aws_100cm, 1)}</span> },
    { key: '_pidx', label: 'Pwr Idx', type: 'number', num: true, domain: 'Power & Industrial', sortKey: 'power_cost_index', aggregateFn: 'avg', renderCell: (_, r) => $(r.industrial?.power_cost_index, 1) },
    { key: '_ppx', label: 'Pwr $', type: 'number', num: true, domain: 'Power & Industrial', sortKey: 'industrial_power_price', aggregateFn: 'avg', renderCell: (_, r) => $(r.industrial?.industrial_power_price, 2) },
    {
      key: '_zcap',
      label: 'Cap Z',
      type: 'badge',
      num: true,
      domain: 'Land & Valuation',
      sortable: false,
      renderCell: (_, r) => {
        const badge = zBand(r.zscores?.implied_cap_rate || {});
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    },
    {
      key: '_zfv',
      label: 'Fair Z',
      type: 'badge',
      num: true,
      domain: 'Land & Valuation',
      sortable: false,
      renderCell: (_, r) => {
        const badge = zBand(r.zscores?.fair_value || {});
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    },
    {
      key: '_zrent',
      label: 'Rent Z',
      type: 'badge',
      num: true,
      domain: 'Land & Valuation',
      sortable: false,
      renderCell: (_, r) => {
        const badge = zBand(r.zscores?.cash_rent || {});
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
      },
    },
    {
      key: '_why_detail',
      label: 'Why',
      type: 'text',
      domain: 'Overview',
      sortable: false,
      renderCell: (_, r) => <div style={{ fontSize: '.74rem', lineHeight: 1.45, color: 'var(--text2)', minWidth: '260px' }}>
        {(r._why?.reasons || []).slice(0, 3).map((reason, idx) => <div key={`${r.fips}-${idx}`}>• {reason}</div>)}
      </div>,
    },
    {
      key: '_workflow',
      label: 'Workflow',
      type: 'text',
      domain: 'Workflow',
      sortable: false,
      renderCell: (_, r) => <div style={{ display: 'flex', gap: '.3rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); nav(PG.COUNTY, { fips: r.fips }); }}>View</button>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research</button>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); nav(PG.RESEARCH, workflowParams(r)); }}>Research First</button>
      </div>,
    },
  ];
}
