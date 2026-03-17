import { PG } from '../config.js';
import { $int } from '../formatting.js';
import { getThesisLens, thesisBadgeClass } from './thesis-lenses.js';

const RESEARCH_STATUS_META = {
  exploring: { label: 'Exploring', className: 'badge-a' },
  watch: { label: 'Watchlist Candidate', className: 'badge-b' },
  diligence: { label: 'In Diligence', className: 'badge-a' },
  high_conviction: { label: 'High Conviction', className: 'badge-g' },
  pass: { label: 'Pass', className: 'badge-r' },
  active: { label: 'Active Position', className: 'badge-g' },
};

const DECISION_STATE_META = {
  exploring: { label: 'Exploring', className: 'badge-a' },
  monitoring: { label: 'Monitoring', className: 'badge-b' },
  underwriting: { label: 'Underwriting', className: 'badge-a' },
  investment_committee: { label: 'IC Review', className: 'badge-b' },
  approved: { label: 'Approved', className: 'badge-g' },
  rejected: { label: 'Rejected', className: 'badge-r' },
};

const APPROVAL_STATE_META = {
  '': { label: 'Not Set', className: 'badge-a' },
  watch: { label: 'Watch', className: 'badge-b' },
  pursue: { label: 'Pursue', className: 'badge-g' },
  hold: { label: 'Hold', className: 'badge-a' },
  pass: { label: 'Pass', className: 'badge-r' },
  approved: { label: 'Approved', className: 'badge-g' },
};

export const DEFAULT_RESEARCH_VISIBLE_COLUMNS = [
  'county',
  'status',
  'conviction',
  '_decision_state',
  '_approval_state',
  '_thesis_lens_label',
  '_notes_count',
  '_scenario_runs_count',
  'updated_at',
];

export const DEFAULT_RESEARCH_ROW_COLORING = 'status';

export function getDefaultResearchViewState() {
  return {
    visibleColumns: [...DEFAULT_RESEARCH_VISIBLE_COLUMNS],
    columnOrder: null,
    groupBy: 'status',
    rowColoring: DEFAULT_RESEARCH_ROW_COLORING,
  };
}

function splitCountyLabel(label, fallbackFips) {
  if (!label) return { countyName: fallbackFips || '--', state: '--' };
  const parts = String(label).split(',');
  if (parts.length < 2) return { countyName: label, state: '--' };
  return {
    countyName: parts.slice(0, -1).join(',').trim(),
    state: parts.at(-1)?.trim() || '--',
  };
}

function formatUpdatedAt(value) {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '--';
  }
}

function statusMeta(status) {
  return RESEARCH_STATUS_META[status] || { label: String(status || 'Unspecified').replace(/_/g, ' '), className: 'badge-a' };
}

function decisionStateMeta(state) {
  return DECISION_STATE_META[state] || { label: String(state || 'Unspecified').replace(/_/g, ' '), className: 'badge-a' };
}

function approvalStateMeta(state) {
  return APPROVAL_STATE_META[state || ''] || { label: String(state || 'Unspecified').replace(/_/g, ' '), className: 'badge-a' };
}

export function hydrateResearchRows(records, countyMap, playbookKey) {
  return (records || []).map((record) => {
    const countyLabel = countyMap?.[record.fips] || record.fips;
    const countyParts = splitCountyLabel(countyLabel, record.fips);
    const thesisLens = record.analysis?.thesis_lens_key
      ? getThesisLens(record.analysis.thesis_lens_key, playbookKey)
      : null;
    return {
      ...record,
      county: countyLabel,
      county_name: countyParts.countyName,
      state: countyParts.state,
      _status_meta: statusMeta(record.status),
      _decision_meta: decisionStateMeta(record.analysis?.decision_state),
      _approval_meta: approvalStateMeta(record.analysis?.approval_state),
      _thesis_lens: thesisLens,
      _thesis_lens_label: record.analysis?.thesis_lens_label || thesisLens?.label || 'None',
      _thesis_lens_status: thesisLens?.status || 'draft',
      _asset_type: record.analysis?.asset_type || 'unspecified',
      _target_use_case: record.analysis?.target_use_case || 'unspecified',
      _decision_state: record.analysis?.decision_state || 'exploring',
      _approval_state: record.analysis?.approval_state || '',
      _notes_count: Array.isArray(record.notes) ? record.notes.length : 0,
      _scenario_runs_count: Array.isArray(record.scenario_runs) ? record.scenario_runs.length : 0,
      _scenario_packs_count: Array.isArray(record.scenario_packs) ? record.scenario_packs.length : 0,
      _tags_text: Array.isArray(record.tags) ? record.tags.join(', ') : '',
      _updated_label: formatUpdatedAt(record.updated_at),
      _search_blob: [
        countyLabel,
        record.thesis,
        record.analysis?.bull_case,
        record.analysis?.bear_case,
        record.analysis?.thesis_lens_label,
        thesisLens?.label,
        Array.isArray(record.tags) ? record.tags.join(' ') : '',
        Array.isArray(record.analysis?.key_risks) ? record.analysis.key_risks.join(' ') : '',
        Array.isArray(record.analysis?.catalysts) ? record.analysis.catalysts.join(' ') : '',
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });
}

export function getResearchRowAccent(row, rowColoring = DEFAULT_RESEARCH_ROW_COLORING) {
  if (!row || rowColoring === 'none') return null;
  if (rowColoring === 'status') {
    const cls = row._status_meta?.className;
    if (cls === 'badge-g') return 'var(--green)';
    if (cls === 'badge-r') return 'var(--red)';
    if (cls === 'badge-a') return 'var(--amber)';
    if (cls === 'badge-b') return 'var(--accent-2)';
  }
  if (rowColoring === 'conviction') {
    if (row.conviction >= 75) return 'var(--green)';
    if (row.conviction >= 45) return 'var(--amber)';
    return 'var(--red)';
  }
  if (rowColoring === 'thesis_lens') {
    if (row._thesis_lens_status === 'live') return 'var(--green)';
    if (row._thesis_lens_status === 'in_build') return 'var(--accent-2)';
    return 'var(--amber)';
  }
  return null;
}

export function ResearchRecordPanel({ row, closePanel, setCounty, nav, buildScenarioNavParams }) {
  if (!row) return null;
  const scenarioCount = row._scenario_runs_count || 0;
  const packCount = row._scenario_packs_count || 0;
  const noteCount = row._notes_count || 0;

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', marginBottom: '.75rem' }}>
      <div>
        <div style={{ fontSize: '.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '.22rem' }}>Research Record</div>
        <h3 style={{ fontSize: '1.14rem', marginBottom: '.18rem' }}>{row.county}</h3>
        <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Updated {row._updated_label}</div>
      </div>
      <span className={`badge ${row._status_meta?.className || 'badge-a'}`}>{row._status_meta?.label || 'Unspecified'}</span>
    </div>

    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
      <span className={`badge ${row.conviction >= 75 ? 'badge-g' : row.conviction >= 45 ? 'badge-a' : 'badge-r'}`}>CONVICTION {Math.round(row.conviction || 0)}/100</span>
      <span className={`badge ${row._decision_meta?.className || 'badge-a'}`}>{row._decision_meta?.label || 'Decision Unset'}</span>
      <span className={`badge ${row._approval_meta?.className || 'badge-a'}`}>{row._approval_meta?.label || 'Approval Unset'}</span>
      <span className={`badge ${thesisBadgeClass(row._thesis_lens_status)}`}>{String(row._thesis_lens_label || 'None').toUpperCase()}</span>
    </div>

    <div className="sc" style={{ marginTop: 0, marginBottom: '.75rem' }}>
      <div className="sc-l">Thesis Snapshot</div>
      <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
        <div style={{ marginBottom: '.35rem' }}>{row.thesis?.trim() || 'No written thesis yet.'}</div>
        <div><strong style={{ color: 'var(--text1)' }}>Bull:</strong> {row.analysis?.bull_case || 'Not written yet.'}</div>
        <div style={{ marginTop: '.25rem' }}><strong style={{ color: 'var(--text1)' }}>Bear:</strong> {row.analysis?.bear_case || 'Not written yet.'}</div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: '.55rem', marginBottom: '.75rem' }}>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Notes</div>
        <div className="sc-v">{$int(noteCount)}</div>
        <div className="sc-c">Captured research notes</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Scenario Runs</div>
        <div className="sc-v">{$int(scenarioCount)}</div>
        <div className="sc-c">Saved underwriting snapshots</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Scenario Packs</div>
        <div className="sc-v">{$int(packCount)}</div>
        <div className="sc-c">Reusable saved assumptions</div>
      </div>
      <div className="sc" style={{ margin: 0 }}>
        <div className="sc-l">Target Use</div>
        <div className="sc-v" style={{ fontSize: '.8rem' }}>{String(row._target_use_case || 'unspecified').replace(/_/g, ' ')}</div>
        <div className="sc-c">Current workflow framing</div>
      </div>
    </div>

    <div style={{ display: 'grid', gap: '.42rem', marginBottom: '.85rem', fontSize: '.76rem', color: 'var(--text2)' }}>
      <div><strong style={{ color: 'var(--text1)' }}>Tags:</strong> {row._tags_text || 'No tags recorded yet.'}</div>
      <div><strong style={{ color: 'var(--text1)' }}>Risks:</strong> {Array.isArray(row.analysis?.key_risks) && row.analysis.key_risks.length ? row.analysis.key_risks.join(', ') : 'No key risks recorded yet.'}</div>
      <div><strong style={{ color: 'var(--text1)' }}>Catalysts:</strong> {Array.isArray(row.analysis?.catalysts) && row.analysis.catalysts.length ? row.analysis.catalysts.join(', ') : 'No catalysts recorded yet.'}</div>
    </div>

    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
      <button className="btn btn-p btn-sm" onClick={() => { setCounty(row.fips); closePanel?.(); }}>Open Workspace</button>
      <button className="btn btn-sm" onClick={() => nav(PG.COUNTY, { fips: row.fips, thesisKey: row.analysis?.thesis_lens_key || '' })}>Open County</button>
      <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, buildScenarioNavParams(row))}>Open Scenario</button>
    </div>
  </div>;
}

export function getResearchColumns({ activeCounty }) {
  return [
    {
      key: 'county',
      label: 'County',
      type: 'text',
      domain: 'Overview',
      renderCell: (_, row) => <div>
        <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{row.county}</span>
          {activeCounty === row.fips && <span className="badge badge-g">OPEN</span>}
        </div>
        <div style={{ fontSize: '.7rem', color: 'var(--text2)', marginTop: '.18rem' }}>{row.thesis?.trim() || row.analysis?.bull_case || 'Research record ready for review.'}</div>
      </div>,
    },
    {
      key: 'status',
      label: 'Status',
      type: 'badge',
      domain: 'Workflow',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._status_meta.className}`}>{row._status_meta.label}</span>,
      groupLabel: (value) => statusMeta(value).label,
    },
    {
      key: 'conviction',
      label: 'Conviction',
      type: 'number',
      domain: 'Workflow',
      num: true,
      groupable: false,
      aggregateFn: 'avg',
      aggregateFormatter: (value) => `${Math.round(value)}/100`,
      fmt: (value) => `${Math.round(value || 0)}/100`,
    },
    {
      key: '_decision_state',
      label: 'Decision',
      type: 'badge',
      domain: 'Workflow',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._decision_meta.className}`}>{row._decision_meta.label}</span>,
      groupLabel: (value) => decisionStateMeta(value).label,
    },
    {
      key: '_approval_state',
      label: 'Approval',
      type: 'badge',
      domain: 'Workflow',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${row._approval_meta.className}`}>{row._approval_meta.label}</span>,
      groupLabel: (value) => approvalStateMeta(value).label,
    },
    {
      key: '_thesis_lens_label',
      label: 'Thesis Lens',
      type: 'badge',
      domain: 'Thesis',
      groupable: true,
      renderCell: (_, row) => <span className={`badge ${thesisBadgeClass(row._thesis_lens_status)}`}>{row._thesis_lens_label}</span>,
    },
    {
      key: '_asset_type',
      label: 'Asset Type',
      type: 'text',
      domain: 'Thesis',
      groupable: true,
      fmt: (value) => String(value || 'unspecified').replace(/_/g, ' '),
    },
    {
      key: '_target_use_case',
      label: 'Use Case',
      type: 'text',
      domain: 'Thesis',
      groupable: true,
      fmt: (value) => String(value || 'unspecified').replace(/_/g, ' '),
    },
    {
      key: 'tags',
      label: 'Tags',
      type: 'text',
      domain: 'Research',
      sortable: false,
      renderCell: (_, row) => row._tags_text || '--',
    },
    {
      key: '_notes_count',
      label: 'Notes',
      type: 'integer',
      domain: 'Research',
      num: true,
      groupable: false,
      aggregateFn: 'sum',
      fmt: (value) => $int(value),
    },
    {
      key: '_scenario_runs_count',
      label: 'Runs',
      type: 'integer',
      domain: 'Research',
      num: true,
      groupable: false,
      aggregateFn: 'sum',
      fmt: (value) => $int(value),
    },
    {
      key: '_scenario_packs_count',
      label: 'Packs',
      type: 'integer',
      domain: 'Research',
      num: true,
      groupable: false,
      aggregateFn: 'sum',
      fmt: (value) => $int(value),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      type: 'text',
      domain: 'Research',
      groupable: false,
      renderCell: (_, row) => row._updated_label,
    },
  ];
}
