import { api, fetchResearchWorkspaces } from '../auth.js';
import { $$, $int, $pct } from '../formatting.js';
import { appendAssumptionParam, AssumptionContextBar } from '../shared/assumptions-ui.jsx';
import { LineChart, STable } from '../shared/data-ui.jsx';
import { ErrBox } from '../shared/system.jsx';
import { PG } from '../config.js';

function playbookStat(value, fallback = '--') {
  return value == null ? fallback : value;
}

function summarizeCoverage(coverage) {
  if (!coverage?.as_of_meta) return '--';
  const pct = coverage.as_of_meta.coverage_pct;
  return pct == null ? '--' : `${Math.round(Number(pct) * 100)}%`;
}

function recentDate(value) {
  if (!value) return '--';
  return String(value).replace('T', ' ').slice(0, 16);
}

function sortRecentResearch(rows = []) {
  return [...rows].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 4);
}

export function Dashboard({
  nav,
  assumptionSets,
  activeAssumptionSetId,
  activeAssumptionSet,
  setActiveAssumptionSetId,
  activePlaybook,
  activePlaybookKey,
}) {
  const [data, setData] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const [research, setResearch] = React.useState([]);
  const [savedViews, setSavedViews] = React.useState([]);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingContext, setLoadingContext] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setErr(null);
    setLoadingSummary(true);
    api(appendAssumptionParam('/dashboard', activeAssumptionSetId))
      .then((dashboardData) => {
        if (!cancelled) setData(dashboardData);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Failed to load playbook home');
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });

    setLoadingContext(true);
    Promise.all([
      api('/data/coverage').catch(() => null),
      fetchResearchWorkspaces().then((store) => Object.values(store || {})).catch(() => []),
      api('/screens').catch(() => []),
    ]).then(([coverageRows, researchRows, screenRows]) => {
      if (cancelled) return;
      setCoverage(coverageRows);
      setResearch(sortRecentResearch(researchRows || []));
      setSavedViews((screenRows || []).filter((row) => !row.playbook_key || row.playbook_key === activePlaybookKey).slice(0, 4));
    }).finally(() => {
      if (!cancelled) setLoadingContext(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeAssumptionSetId, activePlaybookKey]);

  const summary = data?.summary || {};
  const cap = summary.implied_cap_rate || {};
  const fairValue = summary.fair_value || {};
  const rent = summary.cash_rent || {};
  const charts = data?.charts || {};
  const stateSummary = data?.state_summary || {};
  const stateRows = Object.entries(stateSummary)
    .map(([state, value]) => ({ state, counties: value.count, avg_cap: value.avg_cap, avg_value: value.avg_value }))
    .sort((a, b) => b.counties - a.counties)
    .slice(0, 12);
  const basisSummary = data?.benchmark_method_summary || {};
  const sourceQualitySummary = data?.source_quality_summary || {};
  const capBuckets = data?.cap_rate_distribution || [];

  const starterCards = [
    {
      key: 'quality_land',
      title: 'Undervalued Quality Farmland',
      body: 'Start with stronger soil, manageable hazard load, and valuation support before widening the funnel.',
    },
    {
      key: 'irrigated_quality',
      title: 'Irrigated Resilient Farmland',
      body: 'Prioritize counties with irrigation footprint and stronger land quality for users focused on production resilience.',
    },
    {
      key: 'decision_ready',
      title: 'Observed-First Counties',
      body: 'Bias toward counties with fuller underwriting context and stronger research readiness before proxy-heavy exploration.',
    },
    {
      key: 'resilient_value',
      title: 'Low-Hazard Income Counties',
      body: 'Look for income-supportive counties where drought, flood, and soil constraints are less dominant.',
    },
  ];

  const openPreset = (preset) => {
    nav(PG.SCREEN, {
      preset,
      playbookKey: activePlaybookKey,
      sourcePage: 'playbook_home',
      assetType: activePlaybook?.assetType,
      targetUseCase: activePlaybook?.targetUseCase,
    });
  };

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Active Model Basis"
      description="The Farmland Income playbook uses this saved assumption set for modeled context, scenario defaults, and any saved view launched from this page."
    />

    <div className="card hero-card" style={{ marginBottom: '.9rem' }}>
      <div className="hero-k">Playbook Home</div>
      <h2 className="hero-h">{activePlaybook?.label || 'Farmland Income'}</h2>
      <p className="hero-p">This playbook covers {activePlaybook?.universeLabel || 'modeled U.S. counties with farmland-style valuation inputs'}. Atlas shows per-acre values and rents, separates observed/basis-quality context from modeled interpretation, and routes you into starter screens instead of pretending one default county list is “the answer.”</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => nav(PG.SCREEN, { playbookKey: activePlaybookKey })}>Open Screener</button>
        <button className="btn" onClick={() => nav(PG.HOME)}>Back to Atlas Home</button>
      </div>
    </div>

    {err && <ErrBox title="Playbook Home Error" msg={err}/>}

    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>What This Playbook Covers</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)', maxWidth: '980px' }}>
            Current universe: modeled U.S. counties with farmland-style valuation inputs. Current units: benchmark value, fair value, NOI, and cash rent are shown per acre. Benchmark value is Atlas&apos;s farmland underwriting anchor, not a whole-county appraisal of every land use.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge badge-b">PLAYBOOK {activePlaybook?.shortLabel || 'Farmland Income'}</span>
          <span className="badge badge-a">UNITS {activePlaybook?.unitsLabel || 'Per-acre values and rent'}</span>
          <span className="badge badge-g">COVERAGE {summarizeCoverage(coverage)}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.55rem' }}>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Modeled Counties</div>
          <div className="sc-v">{loadingSummary ? '--' : playbookStat($int(data?.county_count))}</div>
          <div className="sc-c">Current farmland-style modeled universe</div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">County-Observed Basis</div>
          <div className="sc-v">{loadingSummary ? '--' : playbookStat($int(basisSummary.county_observed || 0))}</div>
          <div className="sc-c">Counties anchored by county-observed benchmark inputs</div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Proxy-Derived Basis</div>
          <div className="sc-v">{loadingSummary ? '--' : playbookStat($int(basisSummary.rent_multiple_proxy || 0))}</div>
          <div className="sc-c">Counties where benchmark value is derived from county rent × state multiple</div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Full Valuation Stack</div>
          <div className="sc-v">{loadingSummary ? '--' : playbookStat($int(data?.full_valuation_stack_count || 0))}</div>
          <div className="sc-c">Counties with benchmark, fair value, cap rate, and NOI populated</div>
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '.9rem', marginBottom: '.9rem' }}>
      <div className="card">
        <h3 style={{ fontSize: '.95rem', marginBottom: '.55rem' }}>Observed / Basis-Quality Context</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: '.55rem' }}>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Median Cash Rent / ac</div>
            <div className="sc-v">{loadingSummary ? '--' : $$(rent.median)}</div>
            <div className="sc-c">Modeled county universe • per acre</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Coverage Freshness</div>
            <div className="sc-v" style={{ fontSize: '.88rem' }}>{loadingContext ? '--' : recentDate(coverage?.freshness?.[0]?.last_updated)}</div>
            <div className="sc-c">Latest data freshness row from Atlas coverage tracking</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">County Source Quality</div>
            <div className="sc-v">{loadingSummary ? '--' : $int(sourceQualitySummary.county || 0)}</div>
            <div className="sc-c">Rows where source lineage remains county-anchored</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Proxy Source Quality</div>
            <div className="sc-v">{loadingSummary ? '--' : $int(sourceQualitySummary.proxy || 0)}</div>
            <div className="sc-c">Rows that remain useful for triage but need more care in interpretation</div>
          </div>
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginTop: '.65rem' }}>
          Atlas uses benchmark value as its farmland underwriting anchor. When county land value is unavailable, Atlas derives the benchmark from county cash rent multiplied by the state land-value rent multiple. Treat this playbook as farmland-oriented underwriting context, not a full appraisal of every county land use.
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '.95rem', marginBottom: '.55rem' }}>Modeled Interpretation</h3>
        <div style={{ display: 'grid', gap: '.55rem' }}>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Median Implied Cap Rate</div>
            <div className="sc-v">{loadingSummary ? '--' : $pct(cap.median)}</div>
            <div className="sc-c">Atlas-modeled median across the farmland playbook universe</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Median Fair Value / ac</div>
            <div className="sc-v">{loadingSummary ? '--' : $$(fairValue.median)}</div>
            <div className="sc-c">Assumption-sensitive modeled output under the active saved set</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Current 10Y Input</div>
            <div className="sc-v">{loadingSummary ? '--' : $pct(data?.treasury_10y)}</div>
            <div className="sc-c">Shown only as a model driver, not a primary market view</div>
          </div>
        </div>
      </div>
    </div>

    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Starter Screens</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Use these as strong starting points, then edit filters, columns, and assumptions inside Screener and save your own view.</div>
        </div>
        <button className="btn btn-sm" onClick={() => nav(PG.SCREENS_MGR)}>Open Saved Views</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
        {starterCards.map((card) => <div key={card.key} className="sc" style={{ margin: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem' }}>{card.title}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)', minHeight: '52px' }}>{card.body}</div>
          <div style={{ marginTop: '.7rem' }}>
            <button className="btn btn-sm btn-p" onClick={() => openPreset(card.key)}>Launch in Screener</button>
          </div>
        </div>)}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.9rem', marginBottom: '.9rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <h3 style={{ fontSize: '.95rem' }}>Recent Work in This Playbook</h3>
          <button className="btn btn-sm" onClick={() => nav(PG.RESEARCH, { playbookKey: activePlaybookKey })}>Open Workspace</button>
        </div>
        {loadingContext ? <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Loading recent work...</div>
          : research.length === 0 ? <div className="empty"><p>No recent research records yet.</p></div>
            : <div style={{ display: 'grid', gap: '.55rem' }}>
              {research.map((record) => <div key={record.geo_key} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.RESEARCH, { fips: record.geo_key, playbookKey: activePlaybookKey })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.18rem' }}>
                  <div style={{ fontWeight: 600 }}>{record.county_name ? `${record.county_name}, ${record.state}` : record.geo_key}</div>
                  <span className="badge badge-b">{record.status || 'exploring'}</span>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{record.thesis || 'No thesis written yet.'}</div>
              </div>)}
            </div>}
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <h3 style={{ fontSize: '.95rem' }}>Saved Views for This Playbook</h3>
          <button className="btn btn-sm" onClick={() => nav(PG.SCREENS_MGR)}>Manage Saved Views</button>
        </div>
        {loadingContext ? <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Loading saved views...</div>
          : savedViews.length === 0 ? <div className="empty"><p>No saved views yet. Launch a starter screen, tune it, and save it for reuse.</p></div>
            : <div style={{ display: 'grid', gap: '.55rem' }}>
              {savedViews.map((view) => <div key={view.id} className="sc" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.18rem' }}>
                  <div style={{ fontWeight: 600 }}>{view.name}</div>
                  <span className="badge badge-b">v{view.version}</span>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{view.notes || `${(view.filters || []).length} reusable filters`}</div>
              </div>)}
            </div>}
      </div>
    </div>

    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Supporting Market Context</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>These panels support the playbook story. They are context and diagnostics, not the primary decision path.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.9rem' }}>
        <LineChart title="Median Cash Rent / ac" series={charts.cash_rent_median_by_year || []} color="var(--accent)" unitFormatter={(v) => $$(v)} />
        <LineChart title="Median Implied Cap Rate" series={charts.cap_rate_median_by_year || []} color="var(--accent-2)" unitFormatter={(v) => $pct(v)} />
        <LineChart title="Median Fair Value / ac" series={charts.fair_value_median_by_year || []} color="var(--accent)" unitFormatter={(v) => $$(v)} />
        <LineChart title="Treasury 10Y Model Driver" series={charts.treasury_10y_by_year || []} color="var(--line-strong)" unitFormatter={(v) => $pct(v)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.9rem' }}>
        <div>
          <h4 style={{ fontSize: '.86rem', marginBottom: '.45rem' }}>Modeled County Coverage by State</h4>
          <STable
            cols={[
              { key: 'state', label: 'State' },
              { key: 'counties', label: 'Counties', num: true },
              { key: 'avg_cap', label: 'Avg Cap', num: true, fmt: (value) => $pct(value) },
              { key: 'avg_value', label: 'Avg Benchmark', num: true, fmt: (value) => $$(value) },
            ]}
            rows={stateRows}
            stickyHeader
          />
        </div>
        <div>
          <h4 style={{ fontSize: '.86rem', marginBottom: '.45rem' }}>Cap Rate Distribution</h4>
          {capBuckets.length === 0 ? <div className="empty"><p>No distribution data yet.</p></div> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {capBuckets.map((bucket) => <div key={bucket.label} className="sc" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="sc-l" style={{ marginBottom: 0 }}>{bucket.label}</div>
              <div className="sc-v" style={{ fontSize: '.88rem', marginBottom: 0 }}>{$int(bucket.count ?? bucket.value ?? 0)}</div>
            </div>)}
          </div>}
        </div>
      </div>
    </div>
  </div>;
}
