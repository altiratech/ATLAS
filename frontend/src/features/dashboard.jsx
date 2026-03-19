import { api, fetchResearchWorkspaces } from '../auth.js';
import { $$, $int, $pct } from '../formatting.js';
import { appendAssumptionParam, AssumptionContextBar } from '../shared/assumptions-ui.jsx';
import { LineChart, STable } from '../shared/data-ui.jsx';
import { ErrBox } from '../shared/system.jsx';
import { PG } from '../config.js';
import { thesisBadgeClass } from '../shared/thesis-lenses.js';

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
  activeThesis,
  activeThesisKey,
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
        if (!cancelled) setErr(e.message || 'Failed to load perspective home');
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

  const starterCards = activeThesis?.starterCards?.length ? activeThesis.starterCards : [
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
      thesisKey: activeThesisKey,
      sourcePage: 'playbook_home',
      assetType: activeThesis?.assetType || activePlaybook?.assetType,
      targetUseCase: activeThesis?.targetUseCase || activePlaybook?.targetUseCase,
    });
  };

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Active Model Basis"
      description={`${activePlaybook?.label || 'This perspective'} uses this saved assumption set for modeled context, scenario defaults, and any saved view launched from this page.`}
    />

    <div className="card hero-card" style={{ marginBottom: '.9rem' }}>
      <div className="hero-k">Perspective Home</div>
      <h2 className="hero-h">{activePlaybook?.label || 'Farmland Income'}</h2>
      <p className="hero-p">Use this page to start fresh or reopen live work quickly. The goal is to get you into a strong screen, a saved view, or a memo without having to decode the whole reference stack first.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.55rem', marginBottom: '.85rem' }}>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Active Lens</div>
          <div style={{ fontSize: '.92rem', fontWeight: 600 }}>{activeThesis?.label || '--'}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: '.22rem' }}>
            {activeThesis?.question || 'Choose the investment question you want this perspective to frame.'}
          </div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Universe</div>
          <div className="sc-v" style={{ fontSize: '.95rem' }}>{loadingSummary ? '--' : playbookStat($int(data?.county_count))}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)' }}>
            {activePlaybook?.unitsLabel || 'Per-acre values and rent'} • Coverage {summarizeCoverage(coverage)}
          </div>
        </div>
        <div className="sc" style={{ margin: 0 }}>
          <div className="sc-l">Best Next Move</div>
          <div style={{ fontSize: '.82rem', color: 'var(--text1)', lineHeight: 1.35 }}>
            Start from a starter screen if you are exploring. Open Workspace if you are resuming memo work.
          </div>
        </div>
      </div>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => nav(PG.SCREEN, { playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>Open Screener</button>
        <button className="btn" onClick={() => nav(PG.RESEARCH, { playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>Open Workspace</button>
        <button className="btn" onClick={() => nav(PG.SCREENS_MGR)}>Manage Saved Views</button>
      </div>
    </div>

    {err && <ErrBox title="Perspective Home Error" msg={err}/>}

    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '.2rem' }}>Start Here</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>If you are starting fresh, launch one of these opinionated screens and then refine it inside Screener.</div>
        </div>
        <button className="btn btn-sm" onClick={() => nav(PG.SCREEN, { playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>Open Screener</button>
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

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.9rem', marginBottom: '.9rem', alignItems: 'start' }}>
      <div className="card">
        <div style={{ marginBottom: '.7rem' }}>
          <h3 style={{ fontSize: '.98rem', marginBottom: '.2rem' }}>Active Thesis Lens</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>This is the question Atlas is using when it routes you into screening, research, and scenario work from this perspective.</div>
        </div>
        {activeThesis && <div style={{ display: 'grid', gap: '.55rem' }}>
          <div className="sc" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', marginBottom: '.3rem', flexWrap: 'wrap' }}>
              <div className="sc-l" style={{ marginBottom: 0 }}>Question</div>
              <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>{activeThesis.statusLabel}</span>
            </div>
            <div className="sc-v" style={{ fontSize: '.9rem' }}>{activeThesis.question}</div>
            <div className="sc-c">{activeThesis.description}</div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Atlas Uses Now</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
              {activeThesis.nowSignals.map((signal) => <div key={signal}>• {signal}</div>)}
            </div>
          </div>
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Do Not Overread</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
              {activeThesis.gapSignals.map((signal) => <div key={signal}>• {signal}</div>)}
            </div>
          </div>
        </div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <h3 style={{ fontSize: '.95rem' }}>Resume / Reopen</h3>
          <button className="btn btn-sm" onClick={() => nav(PG.SCREENS_MGR)}>Manage Saved Views</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
          <div>
            <div className="sc-l" style={{ marginBottom: '.35rem' }}>Recent Research</div>
            {loadingContext ? <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Loading recent work...</div>
              : research.length === 0 ? <div className="empty"><p>No recent research records yet.</p></div>
                : <div style={{ display: 'grid', gap: '.55rem' }}>
                  {research.map((record) => <div key={record.geo_key} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.RESEARCH, { fips: record.geo_key, playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.18rem' }}>
                      <div style={{ fontWeight: 600 }}>{record.county_name ? `${record.county_name}, ${record.state}` : record.geo_key}</div>
                      <span className="badge badge-b">{record.status || 'exploring'}</span>
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{record.thesis || 'No thesis written yet.'}</div>
                  </div>)}
                </div>}
          </div>
          <div>
            <div className="sc-l" style={{ marginBottom: '.35rem' }}>Saved Views</div>
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
      </div>
    </div>

    <details className="card" style={{ marginBottom: '.9rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: '.96rem', fontWeight: 600, marginBottom: '.75rem' }}>Perspective Reference Context</summary>
      <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginBottom: '.75rem' }}>
        Keep this below the fold. It exists to define the universe and remind the user what is observed, proxied, and modeled inside the current perspective.
      </div>
      <div style={{ marginBottom: '.75rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--text2)', maxWidth: '980px', marginBottom: '.75rem' }}>
          Current universe: modeled U.S. counties with farmland-style valuation inputs. Current units: benchmark value, fair value, NOI, and cash rent are shown per acre. Benchmark value is Atlas&apos;s farmland underwriting anchor, not a whole-county appraisal of every land use.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.55rem' }}>
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
          <div className="sc" style={{ margin: 0 }}>
            <div className="sc-l">Coverage Freshness</div>
            <div className="sc-v" style={{ fontSize: '.88rem' }}>{loadingContext ? '--' : recentDate(coverage?.freshness?.[0]?.last_updated)}</div>
            <div className="sc-c">Latest data freshness row from Atlas coverage tracking</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.9rem', alignItems: 'start' }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '.95rem', marginBottom: '.55rem' }}>Observed / Basis-Quality Context</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.55rem' }}>
            <div className="sc" style={{ margin: 0 }}>
              <div className="sc-l">Median Cash Rent / ac</div>
              <div className="sc-v">{loadingSummary ? '--' : $$(rent.median)}</div>
              <div className="sc-c">Modeled county universe • per acre</div>
            </div>
            <div className="sc" style={{ margin: 0 }}>
              <div className="sc-l">County Source Quality</div>
              <div className="sc-v">{loadingSummary ? '--' : $int(sourceQualitySummary.county || 0)}</div>
              <div className="sc-c">Rows where source lineage remains county-anchored</div>
            </div>
            <div className="sc" style={{ margin: 0 }}>
              <div className="sc-l">Proxy Source Quality</div>
              <div className="sc-v">{loadingSummary ? '--' : $int(sourceQualitySummary.proxy || 0)}</div>
              <div className="sc-c">Rows still useful for triage but requiring more interpretation care</div>
            </div>
            <div className="sc" style={{ margin: 0 }}>
              <div className="sc-l">Modeled Counties</div>
              <div className="sc-v">{loadingSummary ? '--' : playbookStat($int(data?.county_count))}</div>
              <div className="sc-c">Current farmland-style modeled universe</div>
            </div>
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginTop: '.65rem' }}>
            Atlas uses benchmark value as its farmland underwriting anchor. When county land value is unavailable, Atlas derives the benchmark from county cash rent multiplied by the state land-value rent multiple. Treat this perspective as farmland-oriented underwriting context, not a full appraisal of every county land use.
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '.95rem', marginBottom: '.55rem' }}>Modeled Interpretation</h3>
          <div style={{ display: 'grid', gap: '.55rem' }}>
            <div className="sc" style={{ margin: 0 }}>
              <div className="sc-l">Median Implied Cap Rate</div>
              <div className="sc-v">{loadingSummary ? '--' : $pct(cap.median)}</div>
              <div className="sc-c">Atlas-modeled median across the farmland perspective universe</div>
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
    </details>

    <details className="card">
      <summary style={{ cursor: 'pointer', fontSize: '.96rem', fontWeight: 600, marginBottom: '.75rem' }}>Supporting Market Context</summary>
      <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginBottom: '.75rem' }}>These panels support the perspective story. They are context and diagnostics, not the primary decision path.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.75rem', marginBottom: '.9rem', alignItems: 'start' }}>
        <LineChart title="Median Cash Rent / ac" series={charts.cash_rent_median_by_year || []} color="var(--accent)" unitFormatter={(v) => $$(v)} />
        <LineChart title="Median Implied Cap Rate" series={charts.cap_rate_median_by_year || []} color="var(--accent-2)" unitFormatter={(v) => $pct(v)} />
        <LineChart title="Median Fair Value / ac" series={charts.fair_value_median_by_year || []} color="var(--accent)" unitFormatter={(v) => $$(v)} />
        <LineChart title="Treasury 10Y Model Driver" series={charts.treasury_10y_by_year || []} color="var(--line-strong)" unitFormatter={(v) => $pct(v)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.9rem', alignItems: 'start' }}>
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
    </details>
  </div>;
}
