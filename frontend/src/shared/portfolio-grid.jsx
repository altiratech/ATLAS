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
  sourceBand,
} from '../formatting.js';

export const DEFAULT_PORTFOLIO_VISIBLE_COLUMNS = [
  'county_name',
  'state',
  '_read_label',
  'source_quality',
  'benchmark_method',
  'acres',
  'weight_pct',
  'current_value_acre',
  'fair_value_acre',
  '_drought_label',
  '_flood_label',
  '_stress_dscr',
];

export const DEFAULT_PORTFOLIO_ROW_COLORING = 'atlas_read';

export function getDefaultPortfolioViewState() {
  return {
    visibleColumns: [...DEFAULT_PORTFOLIO_VISIBLE_COLUMNS],
    columnOrder: null,
    groupBy: 'state',
    rowColoring: DEFAULT_PORTFOLIO_ROW_COLORING,
  };
}

export function hydratePortfolioRows(holdings) {
  return (holdings || []).map((holding) => {
    const sourceBadge = sourceBand(holding.source_quality);
    const basisBadge = benchmarkMethodBand(holding.benchmark_method);
    const droughtBadge = droughtRiskBand(holding.drought);
    const floodBadge = floodRiskBand(holding.flood);
    return {
      ...holding,
      current_value_acre: holding.acres > 0 ? holding.current_value / holding.acres : null,
      fair_value_acre: holding.acres > 0 ? holding.fair_value / holding.acres : null,
      _read_label: holding._read?.overall?.label || 'UNKNOWN',
      _read_className: holding._read?.overall?.className || 'badge-a',
      _read_summary: holding._read?.overall?.summary || 'Atlas county read is unavailable for this holding.',
      _source_badge: sourceBadge,
      _basis_badge: basisBadge,
      _drought_badge: droughtBadge,
      _flood_badge: floodBadge,
      _drought_label: droughtBadge.label,
      _flood_label: floodBadge.label,
      _soil_share: holding.soil?.significant_share_pct ?? null,
      _stress_dscr: holding.credit?.combined_stress_dscr ?? null,
      _search_blob: [
        holding.county_name,
        holding.state,
        holding._read?.overall?.label,
        holding._read?.overall?.summary,
        sourceBadge.label,
        basisBadge.label,
        droughtBadge.label,
        floodBadge.label,
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });
}

export function getPortfolioRowAccent(row, rowColoring = DEFAULT_PORTFOLIO_ROW_COLORING) {
  if (!row || rowColoring === 'none') return null;
  if (rowColoring === 'atlas_read') {
    if (row._read_className === 'badge-g') return 'var(--green)';
    if (row._read_className === 'badge-r') return 'var(--red)';
    if (row._read_className === 'badge-a') return 'var(--amber)';
    if (row._read_className === 'badge-b') return 'var(--accent-2)';
  }
  if (rowColoring === 'hazard') {
    const drought = Number(row.drought?.risk_score);
    const flood = Number(row.flood?.hazard_score);
    const maxHazard = Math.max(Number.isFinite(drought) ? drought : 0, Number.isFinite(flood) ? flood : 0);
    if (maxHazard >= 80) return 'var(--red)';
    if (maxHazard >= 55) return 'var(--amber)';
    return 'var(--green)';
  }
  if (rowColoring === 'basis') {
    if (row.source_quality === 'county_observed') return 'var(--green)';
    if (row.source_quality === 'proxy') return 'var(--red)';
    if (row.source_quality) return 'var(--amber)';
  }
  return null;
}

function portfolioContextLine(row, riskSummary) {
  const notes = [];
  if (row.weight_pct != null) {
    notes.push(`This holding represents ${$pct(row.weight_pct)} of portfolio acreage.`);
  }
  if (row.drought?.risk_score != null && riskSummary?.weighted_drought_risk != null) {
    const relation = row.drought.risk_score >= riskSummary.weighted_drought_risk ? 'above' : 'below';
    notes.push(`Drought risk is ${relation} the portfolio average (${Number(riskSummary.weighted_drought_risk).toFixed(1)}).`);
  }
  if (row.credit?.combined_stress_dscr != null && riskSummary?.weighted_combined_stress_dscr != null) {
    const relation = row.credit.combined_stress_dscr >= riskSummary.weighted_combined_stress_dscr ? 'stronger than' : 'weaker than';
    notes.push(`Stress DSCR is ${relation} the portfolio rollup (${Number(riskSummary.weighted_combined_stress_dscr).toFixed(2)}x).`);
  }
  return notes.slice(0, 3);
}

export function PortfolioRecordPanel({
  row,
  closePanel,
  nav,
  removeHolding,
  portfolioName,
  riskSummary,
}) {
  if (!row) return null;
  const contextLines = portfolioContextLine(row, riskSummary);

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', marginBottom: '.75rem' }}>
      <div>
        <div style={{ fontSize: '.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '.22rem' }}>Portfolio Holding</div>
        <h3 style={{ fontSize: '1.14rem', marginBottom: '.18rem' }}>{row.county_name}, {row.state}</h3>
        <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>{portfolioName || 'Portfolio'} • {row.geo_key}</div>
      </div>
      <span className={`badge ${row._read_className}`}>{row._read_label}</span>
    </div>

    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
      <span className={`badge ${row._source_badge.className}`}>{row._source_badge.label}</span>
      <span className={`badge ${row._basis_badge.className}`}>{row._basis_badge.label}</span>
      <span className={`badge ${row._drought_badge.className}`}>{row._drought_badge.label}</span>
      <span className={`badge ${row._flood_badge.className}`}>{row._flood_badge.label}</span>
    </div>

    <div className="sc" style={{ marginTop: 0, marginBottom: '.75rem' }}>
      <div className="sc-l">County Read</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
        <div style={{ marginBottom: '.35rem' }}>{row._read_summary}</div>
        {(row._read?.supportPoints || []).slice(0, 3).map((item) => <div key={item}>• {item}</div>)}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: '.55rem', marginBottom: '.75rem' }}>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Acres</div>
        <div className="sc-v">{$int(row.acres)}</div>
        <div className="sc-c">{row.weight_pct != null ? `${$pct(row.weight_pct)} of the portfolio` : 'Portfolio weight unavailable'}</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Purchase Basis</div>
        <div className="sc-v">{$$(row.purchase_price_per_acre)}</div>
        <div className="sc-c">{row.purchase_year || 'Purchase year unavailable'}</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Current Value / ac</div>
        <div className="sc-v">{$$(row.current_value_acre)}</div>
        <div className="sc-c">Live benchmark basis under the active assumption set</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Fair Value / ac</div>
        <div className="sc-v">{$$(row.fair_value_acre)}</div>
        <div className="sc-c">Atlas-modeled fair value under the active set</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Soil Share</div>
        <div className="sc-v">{row._soil_share != null ? `${$(row._soil_share, 1)}%` : 'N/A'}</div>
        <div className="sc-c">NRCS significant farmland share</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Stress DSCR</div>
        <div className="sc-v">{row._stress_dscr != null ? `${$(row._stress_dscr, 2)}x` : 'N/A'}</div>
        <div className="sc-c">Combined stress credit view</div>
      </div>
    </div>

    <div style={{ display: 'grid', gap: '.42rem', marginBottom: '.85rem', fontSize: '.76rem', color: 'var(--text2)' }}>
      {contextLines.length > 0
        ? contextLines.map((item) => <div key={item}>• {item}</div>)
        : <div>• Portfolio context will get richer as more holdings and risk rollups accumulate.</div>}
      {(row._read?.gatingChecks || []).slice(0, 2).map((item) => <div key={item}>• {item}</div>)}
    </div>

    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
      <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, { fips: row.geo_key })}>Open County</button>
      <button className="btn btn-sm" onClick={() => nav(PG.RESEARCH, { fips: row.geo_key, countyName: row.county_name, state: row.state, sourcePage: 'portfolio' })}>Open Research</button>
      <button className="btn btn-sm btn-p" onClick={() => nav(PG.SCENARIO, { fips: row.geo_key, countyName: row.county_name, state: row.state, sourcePage: 'portfolio' })}>Open Scenario</button>
      <button className="btn btn-sm btn-d" onClick={() => { closePanel?.(); removeHolding?.(row.geo_key); }}>Remove</button>
    </div>
  </div>;
}

export function getPortfolioColumns() {
  return [
    {
      key: 'county_name',
      label: 'County',
      type: 'text',
      domain: 'Overview',
      renderCell: (_, row) => <div>
        <div>{row.county_name}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--text2)', marginTop: '.18rem' }}>{row._read_summary}</div>
      </div>,
    },
    { key: 'state', label: 'ST', type: 'text', domain: 'Overview', groupable: true },
    {
      key: '_read_label',
      label: 'Read',
      type: 'badge',
      domain: 'Overview',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._read_className}`}>{row._read_label}</span>,
    },
    {
      key: 'source_quality',
      label: 'Data',
      type: 'badge',
      domain: 'Overview',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._source_badge.className}`}>{row._source_badge.label}</span>,
      groupLabel: (value) => sourceBand(value).label,
    },
    {
      key: 'benchmark_method',
      label: 'Basis',
      type: 'badge',
      domain: 'Overview',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._basis_badge.className}`}>{row._basis_badge.label}</span>,
      groupLabel: (value) => benchmarkMethodBand(value).label,
    },
    {
      key: 'acres',
      label: 'Acres',
      type: 'integer',
      domain: 'Exposure',
      num: true,
      groupable: false,
      aggregateFn: 'sum',
      fmt: (value) => $int(value),
    },
    {
      key: 'weight_pct',
      label: 'Weight',
      type: 'percent',
      domain: 'Exposure',
      num: true,
      groupable: false,
      aggregateFn: 'sum',
      fmt: (value) => $pct(value),
    },
    {
      key: 'purchase_price_per_acre',
      label: 'Cost $/ac',
      type: 'currency',
      domain: 'Valuation',
      num: true,
      groupable: false,
      aggregateFn: 'weightedAvg',
      aggregateWeightKey: 'acres',
      fmt: (value) => $$(value),
    },
    {
      key: 'current_value_acre',
      label: 'Curr $/ac',
      type: 'currency',
      domain: 'Valuation',
      num: true,
      groupable: false,
      aggregateFn: 'weightedAvg',
      aggregateWeightKey: 'acres',
      fmt: (value) => $$(value),
    },
    {
      key: 'fair_value_acre',
      label: 'FV $/ac',
      type: 'currency',
      domain: 'Valuation',
      num: true,
      groupable: false,
      aggregateFn: 'weightedAvg',
      aggregateWeightKey: 'acres',
      fmt: (value) => $$(value),
    },
    {
      key: '_drought_label',
      label: 'Drought',
      type: 'badge',
      domain: 'Risk',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._drought_badge.className}`}>{row._drought_badge.label}</span>,
    },
    {
      key: '_flood_label',
      label: 'Flood',
      type: 'badge',
      domain: 'Risk',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._flood_badge.className}`}>{row._flood_badge.label}</span>,
    },
    {
      key: '_soil_share',
      label: 'Soil',
      type: 'percent',
      domain: 'Risk',
      num: true,
      groupable: false,
      aggregateFn: 'weightedAvg',
      aggregateWeightKey: 'acres',
      fmt: (value) => value != null ? `${$(value, 1)}%` : 'N/A',
    },
    {
      key: '_stress_dscr',
      label: 'Stress DSCR',
      type: 'number',
      domain: 'Risk',
      num: true,
      groupable: false,
      aggregateFn: 'weightedAvg',
      aggregateWeightKey: 'acres',
      fmt: (value) => value != null ? `${$(value, 2)}x` : 'N/A',
    },
    {
      key: 'unrealized_gain_pct',
      label: 'Gain',
      type: 'percent',
      domain: 'Valuation',
      num: true,
      groupable: false,
      fmt: (value) => value == null ? 'N/A' : <span className={value >= 0 ? 'pos' : 'neg'}>{$chg(value)}</span>,
    },
  ];
}
