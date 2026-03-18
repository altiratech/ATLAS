import { APP_NAME, APP_TAGLINE, PG } from '../config.js';
import { api, fetchResearchWorkspaces } from '../auth.js';
import { getPlaybook, PLAYBOOKS, playbookBadgeClass } from '../shared/playbooks.js';
import { getThesisLens, getThesisLensesForPlaybook, thesisBadgeClass } from '../shared/thesis-lenses.js';
import { Loading } from '../shared/system.jsx';

function recentDate(value) {
  if (!value) return '--';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function AtlasHomePage({ nav, activePlaybook, activePlaybookKey, setActivePlaybookKey, activeThesis, activeThesisKey, setActiveThesisKey }) {
  const [loading, setLoading] = React.useState(true);
  const [research, setResearch] = React.useState([]);
  const [savedViews, setSavedViews] = React.useState([]);
  const [portfolios, setPortfolios] = React.useState([]);
  const [scenarioRuns, setScenarioRuns] = React.useState([]);
  const perspectivesRef = React.useRef(null);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchResearchWorkspaces().then((store) => Object.values(store || {})).catch(() => []),
      api('/screens').catch(() => []),
      api('/portfolios').catch(() => []),
      api('/research/scenario-runs/recent?limit=6').catch(() => []),
    ]).then(([researchRows, screenRows, portfolioRows, runRows]) => {
      setResearch((Array.isArray(researchRows) ? researchRows : []).slice(0, 6));
      setSavedViews((Array.isArray(screenRows) ? screenRows : []).slice(0, 6));
      setPortfolios((Array.isArray(portfolioRows) ? portfolioRows : []).slice(0, 6));
      setScenarioRuns((Array.isArray(runRows) ? runRows : []).slice(0, 6));
    }).finally(() => setLoading(false));
  }, []);

  const availableLenses = React.useMemo(
    () => getThesisLensesForPlaybook(activePlaybookKey),
    [activePlaybookKey],
  );

  const openPlaybook = (playbookKey) => {
    setActivePlaybookKey?.(playbookKey);
    nav(PG.DASH, { playbookKey });
  };

  const openLens = (lensKey, playbookKey = activePlaybookKey) => {
    setActivePlaybookKey?.(playbookKey);
    setActiveThesisKey?.(lensKey);
    nav(PG.DASH, { playbookKey, thesisKey: lensKey });
  };

  const openSavedView = (view) => {
    const playbookKey = view?.playbook_key || activePlaybookKey || PLAYBOOKS[0].key;
    const thesisKey = view?.view_state?.thesisKey || activeThesisKey || getThesisLensesForPlaybook(playbookKey)?.[0]?.key;
    setActivePlaybookKey?.(playbookKey);
    if (thesisKey) setActiveThesisKey?.(thesisKey);
    nav(PG.SCREEN, {
      playbookKey,
      thesisKey,
      screen_id: String(view.id),
      screen_name: view.name,
      sourcePage: 'atlas_home',
    });
  };

  return <div>
    <div className="card hero-card" style={{ marginBottom: '.9rem' }}>
      <div className="hero-k">Atlas Home</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">{APP_TAGLINE}. Atlas is one geo/opportunity platform organized around perspectives and thesis lenses, with shared tools for screening, underwriting, research, and portfolio work.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => perspectivesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Explore Perspectives</button>
        <button className="btn" onClick={() => nav(PG.ABOUT)}>About Atlas</button>
      </div>
    </div>

    <div ref={perspectivesRef} className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '.98rem', marginBottom: '.2rem' }}>Perspectives</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Choose the default universe and workflow you want Atlas to optimize around. Perspectives provide strong defaults, but the shared tools remain editable and reusable.</div>
        </div>
        {activePlaybook && <span className={`badge ${playbookBadgeClass(activePlaybook.status)}`}>CURRENT {activePlaybook.label}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
        {PLAYBOOKS.map((playbook) => {
          const isActive = playbook.key === activePlaybookKey;
          const isLive = playbook.status === 'live';
          return <div key={playbook.key} className="sc" style={{ margin: 0, borderColor: isActive ? 'var(--line-strong)' : 'var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.45rem' }}>
              <div style={{ fontSize: '.9rem', fontWeight: 600 }}>{playbook.label}</div>
              <span className={`badge ${playbookBadgeClass(playbook.status)}`}>{playbook.statusLabel}</span>
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--text2)', minHeight: '54px' }}>{playbook.description}</div>
            {playbook.universeLabel && <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: '.5rem' }}>
              <strong style={{ color: 'var(--text1)' }}>Universe:</strong> {playbook.universeLabel}
            </div>}
            {playbook.unitsLabel && <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: '.18rem' }}>
              <strong style={{ color: 'var(--text1)' }}>Units:</strong> {playbook.unitsLabel}
            </div>}
            <div style={{ display: 'flex', gap: '.45rem', marginTop: '.7rem', flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${isLive ? 'btn-p' : ''}`} onClick={() => isLive && openPlaybook(playbook.key)} disabled={!isLive}>
                {isLive ? (isActive ? 'Open Active' : 'Open Perspective') : 'Not Live Yet'}
              </button>
            </div>
          </div>;
        })}
      </div>
    </div>

    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '.98rem', marginBottom: '.2rem' }}>Thesis Lenses</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>A thesis lens is the investment question Atlas applies to the current perspective. It changes how we frame the workflow without pretending the underlying data is broader than it is.</div>
        </div>
        {activeThesis && <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>CURRENT {activeThesis.label}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
        {availableLenses.map((lens) => {
          const isActive = lens.key === activeThesisKey;
          return <div key={lens.key} className="sc" style={{ margin: 0, borderColor: isActive ? 'var(--line-strong)' : 'var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.45rem' }}>
              <div style={{ fontSize: '.9rem', fontWeight: 600 }}>{lens.label}</div>
              <span className={`badge ${thesisBadgeClass(lens.status)}`}>{lens.statusLabel}</span>
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginBottom: '.45rem' }}>{lens.description}</div>
            <div style={{ fontSize: '.74rem', color: 'var(--text2)', marginBottom: '.35rem' }}>
              <strong style={{ color: 'var(--text1)' }}>Question:</strong> {lens.question}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginBottom: '.28rem' }}>
              <strong style={{ color: 'var(--text1)' }}>Atlas uses now:</strong> {lens.nowSignals.join(', ')}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text2)' }}>
              <strong style={{ color: 'var(--text1)' }}>Still missing:</strong> {lens.gapSignals.join(', ')}
            </div>
            <div style={{ display: 'flex', gap: '.45rem', marginTop: '.7rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-p" onClick={() => openLens(lens.key)}>
                {isActive ? 'Open Active Lens' : 'Activate Lens'}
              </button>
            </div>
          </div>;
        })}
      </div>
    </div>

    {loading ? <Loading/> : <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '.9rem' }}>
      <div style={{ display: 'grid', gap: '.9rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <h3 style={{ fontSize: '.95rem' }}>Recent Research</h3>
            <button className="btn btn-sm" onClick={() => nav(PG.RESEARCH)}>Open Workspace</button>
          </div>
          {research.length === 0 ? <div className="empty"><p>No research records yet. Start from a perspective or the Screener and save a county into Research Workspace.</p></div> : <div style={{ display: 'grid', gap: '.55rem' }}>
            {research.map((record) => <div key={record.geo_key} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.RESEARCH, { fips: record.geo_key, playbookKey: record.playbook_key || activePlaybookKey, thesisKey: record.analysis?.thesis_lens_key || activeThesisKey })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.2rem' }}>
                <div style={{ fontWeight: 600 }}>{record.county_name ? `${record.county_name}, ${record.state}` : record.geo_key}</div>
                <span className="badge badge-b">{record.status || 'exploring'}</span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}>{record.thesis || 'No written thesis yet.'}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--text3)', marginTop: '.3rem' }}>Updated {recentDate(record.updated_at)}</div>
            </div>)}
          </div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <h3 style={{ fontSize: '.95rem' }}>Recent Scenario Runs</h3>
            <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, { playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>Open Scenario Lab</button>
          </div>
          {scenarioRuns.length === 0 ? <div className="empty"><p>No saved scenario runs yet.</p></div> : <div style={{ display: 'grid', gap: '.55rem' }}>
            {scenarioRuns.map((run) => <div key={run.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.SCENARIO, { fips: run.geo_key, countyName: run.county_name, state: run.state, playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.2rem' }}>
                <div style={{ fontWeight: 600 }}>{run.county_name ? `${run.county_name}, ${run.state}` : run.geo_key}</div>
                <span className="badge badge-a">{run.scenario_name || 'Scenario'}</span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text2)' }}>As of {run.as_of_date} • Saved {recentDate(run.created_at)}</div>
            </div>)}
          </div>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '.9rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <h3 style={{ fontSize: '.95rem' }}>Saved Views</h3>
            <button className="btn btn-sm" onClick={() => nav(PG.SCREENS_MGR)}>Open Saved Views</button>
          </div>
          {savedViews.length === 0 ? <div className="empty"><p>No saved views yet. Build one from Screener and keep the perspective and lens context attached.</p></div> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {savedViews.map((view) => {
              const viewPlaybook = getPlaybook(view.playbook_key || PLAYBOOKS[0].key);
              const viewThesis = getThesisLens(view.view_state?.thesisKey || activeThesisKey, view.playbook_key || activePlaybookKey);
              return <div key={view.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => openSavedView(view)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.2rem' }}>
                  <div style={{ fontWeight: 600 }}>{view.name}</div>
                  <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className={`badge ${playbookBadgeClass(viewPlaybook.status)}`}>{viewPlaybook.shortLabel}</span>
                    {viewThesis && <span className={`badge ${thesisBadgeClass(viewThesis.status)}`}>{viewThesis.shortLabel}</span>}
                  </div>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{view.notes || `${(view.filters || []).length} reusable filters`}</div>
              </div>;
            })}
          </div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <h3 style={{ fontSize: '.95rem' }}>Portfolio Resume</h3>
            <button className="btn btn-sm" onClick={() => nav(PG.PORTFOLIO, { playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>Open Portfolio</button>
          </div>
          {portfolios.length === 0 ? <div className="empty"><p>No portfolios yet. Create one once you want Atlas to aggregate risk and value across holdings.</p></div> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {portfolios.map((portfolio) => <div key={portfolio.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.PORTFOLIO, { portfolioId: portfolio.id, playbookKey: activePlaybookKey, thesisKey: activeThesisKey })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.2rem' }}>
                <div style={{ fontWeight: 600 }}>{portfolio.name}</div>
                <span className="badge badge-b">{portfolio.holdings_count} holdings</span>
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{portfolio.total_acres?.toLocaleString('en-US') || 0} total acres • {portfolio.owner_scope === 'private' ? 'Private' : 'Legacy shared'}</div>
            </div>)}
          </div>}
        </div>
      </div>
    </div>}
  </div>;
}

export function AboutPage({ nav, activePlaybook, activeThesis }) {
  const roadmap = [
    { phase: 'Now', body: 'Atlas Home, the live Farmland Income perspective, and the shared underwriting/research spine define the current product.' },
    { phase: 'Next', body: 'Additional land perspectives should be added only when they have real evidence stacks, real model packs, and reusable value inside the shared tools.' },
    { phase: 'Later', body: 'Open sync, export, API, and AI layers should operate on structured Atlas objects rather than forcing Atlas to become a generic workspace tool.' },
  ];
  const workflow = [
    { id: '01', title: 'Choose a perspective', body: 'Start with the opportunity universe that matches the job you are trying to do, then let Atlas preload the right evidence and workflow defaults.' },
    { id: '02', title: 'Apply a thesis lens', body: 'Use a lens to tell Atlas what question you are asking of that universe, so the workflow can stay honest about what the current evidence does and does not support.' },
    { id: '03', title: 'Underwrite and pressure test', body: 'Run scenario, credit, acquisition, and refinancing logic before moving anything into a higher-conviction decision state.' },
    { id: '04', title: 'Capture research and aggregation', body: 'Save conviction, compare alternatives, and carry risk and valuation context into portfolio-level views.' },
  ];
  return <div>
    <div className="card hero-card" style={{ marginBottom: '.8rem' }}>
      <div className="hero-k">About</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">Altira Atlas is a land intelligence and underwriting platform built to connect perspective-driven discovery, site and county analysis, underwriting, and decision workflow support inside one shared product.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => nav?.(PG.HOME)}>Open Atlas Home</button>
      </div>
    </div>

    {(activePlaybook || activeThesis) && <div className="card" style={{ marginBottom: '.8rem' }}>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {activePlaybook && <span className={`badge ${playbookBadgeClass(activePlaybook.status)}`}>CURRENT PERSPECTIVE {activePlaybook.label}</span>}
        {activeThesis && <span className={`badge ${thesisBadgeClass(activeThesis.status)}`}>CURRENT LENS {activeThesis.label}</span>}
      </div>
    </div>}

    <div className="about-grid">
      <div className="about-block">
        <div className="about-h">Why This Product</div>
        <div className="about-p">Important land and real-assets decisions still require pulling fragmented market, geography, hazard, and underwriting context into one place. Atlas exists to reduce that friction while keeping the evidence chain explicit.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Product Shape</div>
        <div className="about-p">Atlas is one product with perspective homes at the top and shared tools underneath. Thesis lenses sit on top of those perspectives so investors can investigate transition questions without rebuilding the product around a single asset bucket.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Current Live Perspective</div>
        <div className="about-p">The first live perspective is Farmland Income. It uses county valuation, agronomic evidence, hazard context, and underwriting models to help users discover, pressure test, and track land opportunities, including thesis-driven work around agricultural transition.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Open-by-Design</div>
        <div className="about-p">Atlas should stay native and specialized, but its core objects need to remain structured enough for future exports, sync adapters, API access, MCP integration, and AI-assisted workflows.</div>
      </div>
    </div>

    <div className="workflow-grid" style={{ marginBottom: '.8rem' }}>
      {workflow.map((step) => <div key={step.id} className="workflow-card">
        <div className="workflow-step">Step {step.id}</div>
        <div className="workflow-h">{step.title}</div>
        <div className="workflow-p">{step.body}</div>
      </div>)}
    </div>

    <div className="card">
      <h3 style={{ fontSize: '.94rem', marginBottom: '.45rem' }}>Build Sequence</h3>
      <div className="why-grid">
        {roadmap.map((item) => <div key={item.phase} className="why-row">
          <div className="why-tool">{item.phase}</div>
          <div className="why-next">{item.body}</div>
        </div>)}
      </div>
    </div>
  </div>;
}
