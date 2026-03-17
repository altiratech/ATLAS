import { APP_NAME, APP_TAGLINE, PG } from '../config.js';
import { api, fetchResearchWorkspaces } from '../auth.js';
import { getPlaybook, PLAYBOOKS, playbookBadgeClass } from '../shared/playbooks.js';
import { Loading } from '../shared/system.jsx';

function recentDate(value) {
  if (!value) return '--';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function AtlasHomePage({ nav, activePlaybook, activePlaybookKey, setActivePlaybookKey }) {
  const [loading, setLoading] = React.useState(true);
  const [research, setResearch] = React.useState([]);
  const [savedViews, setSavedViews] = React.useState([]);
  const [portfolios, setPortfolios] = React.useState([]);
  const [scenarioRuns, setScenarioRuns] = React.useState([]);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchResearchWorkspaces().then((store) => Object.values(store || {})).catch(() => []),
      api('/screens').catch(() => []),
      api('/portfolios').catch(() => []),
      api('/research/scenario-runs/recent?limit=6').catch(() => []),
    ]).then(([researchRows, screenRows, portfolioRows, runRows]) => {
      setResearch((researchRows || []).slice(0, 6));
      setSavedViews((screenRows || []).slice(0, 6));
      setPortfolios((portfolioRows || []).slice(0, 6));
      setScenarioRuns((runRows || []).slice(0, 6));
    }).finally(() => setLoading(false));
  }, []);

  const openPlaybook = (playbookKey) => {
    setActivePlaybookKey?.(playbookKey);
    nav(PG.DASH, { playbookKey });
  };

  const openSavedView = (view) => {
    const playbookKey = view?.playbook_key || activePlaybookKey || PLAYBOOKS[0].key;
    setActivePlaybookKey?.(playbookKey);
    nav(PG.SCREEN, {
      playbookKey,
      screen_id: String(view.id),
      screen_name: view.name,
      sourcePage: 'atlas_home',
    });
  };

  return <div>
    <div className="card hero-card" style={{ marginBottom: '.9rem' }}>
      <div className="hero-k">Atlas Home</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">{APP_TAGLINE}. Atlas is one land intelligence product organized around investment playbooks, with shared tools for screening, underwriting, research, and portfolio work.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => openPlaybook(activePlaybookKey || PLAYBOOKS[0].key)}>Open {activePlaybook?.label || 'Playbook'}</button>
        <button className="btn" onClick={() => nav(PG.MISSION)}>Read Mission</button>
      </div>
    </div>

    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '.98rem', marginBottom: '.2rem' }}>Playbooks</h3>
          <div style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Choose the investment perspective you want Atlas to optimize around. Playbooks provide strong defaults, but the shared tools remain editable and reusable.</div>
        </div>
        {activePlaybook && <span className={`badge ${playbookBadgeClass(activePlaybook.status)}`}>ACTIVE {activePlaybook.label}</span>}
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
                {isLive ? (isActive ? 'Open Active' : 'Open Playbook') : 'Not Live Yet'}
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
          {research.length === 0 ? <div className="empty"><p>No research records yet. Start from a playbook or the Screener and save a county into Research Workspace.</p></div> : <div style={{ display: 'grid', gap: '.55rem' }}>
            {research.map((record) => <div key={record.geo_key} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.RESEARCH, { fips: record.geo_key, playbookKey: activePlaybookKey })}>
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
            <button className="btn btn-sm" onClick={() => nav(PG.SCENARIO, { playbookKey: activePlaybookKey })}>Open Scenario Lab</button>
          </div>
          {scenarioRuns.length === 0 ? <div className="empty"><p>No saved scenario runs yet.</p></div> : <div style={{ display: 'grid', gap: '.55rem' }}>
            {scenarioRuns.map((run) => <div key={run.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.SCENARIO, { fips: run.geo_key, countyName: run.county_name, state: run.state, playbookKey: activePlaybookKey })}>
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
          {savedViews.length === 0 ? <div className="empty"><p>No saved views yet. Build one from Screener and keep the playbook context attached.</p></div> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {savedViews.map((view) => {
              const viewPlaybook = getPlaybook(view.playbook_key || PLAYBOOKS[0].key);
              return <div key={view.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => openSavedView(view)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.2rem' }}>
                  <div style={{ fontWeight: 600 }}>{view.name}</div>
                  <span className={`badge ${playbookBadgeClass(viewPlaybook.status)}`}>{viewPlaybook.shortLabel}</span>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{view.notes || `${(view.filters || []).length} reusable filters`}</div>
              </div>;
            })}
          </div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <h3 style={{ fontSize: '.95rem' }}>Portfolio Resume</h3>
            <button className="btn btn-sm" onClick={() => nav(PG.PORTFOLIO, { playbookKey: activePlaybookKey })}>Open Portfolio</button>
          </div>
          {portfolios.length === 0 ? <div className="empty"><p>No portfolios yet. Create one once you want Atlas to aggregate risk and value across holdings.</p></div> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {portfolios.map((portfolio) => <div key={portfolio.id} className="sc" style={{ margin: 0, cursor: 'pointer' }} onClick={() => nav(PG.PORTFOLIO, { portfolioId: portfolio.id, playbookKey: activePlaybookKey })}>
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

export function MissionPage({ nav }) {
  const workflow = [
    { id: '01', title: 'Choose a playbook', body: 'Start with the land use case or investment perspective that matches the job you are trying to do, then let Atlas preload the right evidence and workflow defaults.' },
    { id: '02', title: 'Explore the land universe', body: 'Use saved views and shared tools to narrow counties or sites without rebuilding your workflow from scratch each time.' },
    { id: '03', title: 'Underwrite and pressure test', body: 'Run scenario, credit, acquisition, and refinancing logic before moving anything into a higher-conviction decision state.' },
    { id: '04', title: 'Capture research and aggregation', body: 'Save conviction, compare alternatives, and carry risk and valuation context into portfolio-level views.' },
  ];

  const toolGuide = [
    { tool: 'Atlas Home', why: 'Choose a playbook, reopen recent work, and route into the right workflow quickly.', next: 'Open the live Farmland Income playbook.' },
    { tool: 'Farmland Income', why: 'Defines the current live universe, evidence stack, and starter screens for farmland investing.', next: 'Launch a starter strategy into Screener.' },
    { tool: 'Screener', why: 'Filter land opportunities instead of reviewing every county manually.', next: 'Use a preset, then tune filters and save the resulting view.' },
    { tool: 'County Detail', why: 'Inspect valuation logic, physical evidence, underwriting, and decision signals in one place.', next: 'Open a county and decide whether it belongs in research.' },
    { tool: 'Research Workspace', why: 'Capture thesis, status, conviction, and decision record context.', next: 'Save a top county and turn it into a defendable investment view.' },
    { tool: 'Scenario Lab', why: 'Test upside/downside and deal structure assumptions before acting.', next: 'Run a base, downside, and refinancing case.' },
    { tool: 'Portfolio', why: 'Quantify concentration, hazard, and value gaps across holdings.', next: 'Add a model portfolio and review weighted risk context.' },
    { tool: 'Data Sources', why: 'Verify where every input comes from and how often it updates.', next: 'Confirm source lineage before presenting outputs.' },
  ];
  const buildout = [
    { status: 'Live', title: 'Farmland Income Playbook', body: 'Atlas now has a real farmland entry point with shared tools for screening, county analysis, underwriting, research, and portfolio synthesis.' },
    { status: 'In Build', title: 'Additional Land Playbooks', body: 'Industrial, powered-site, and development-oriented playbooks should reuse the same workflow spine once their evidence layers and model packs are real enough.' },
    { status: 'Live', title: 'Shared Tool Spine', body: 'Screener, County Detail, Scenario Lab, Research Workspace, and Portfolio remain shared tools rather than separate mini-products.' },
    { status: 'Planned', title: 'Open Sync Layer', body: 'Saved views, research records, scenario runs, and portfolio summaries should become cleaner sync/export objects for future integrations and AI workflows.' },
  ];

  return <div>
    <div className="card hero-card">
      <div className="hero-k">Mission</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">{APP_TAGLINE}. Atlas is a native land intelligence and underwriting product with shared tools, editable playbooks, and a structure designed to support future sync, API, and AI layers without turning into a generic database app.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => nav(PG.HOME)}>Open Atlas Home</button>
        <button className="btn" onClick={() => nav(PG.ABOUT)}>Read About</button>
      </div>
    </div>

    <div className="workflow-grid">
      {workflow.map((step) => <div key={step.id} className="workflow-card">
        <div className="workflow-step">Step {step.id}</div>
        <div className="workflow-h">{step.title}</div>
        <div className="workflow-p">{step.body}</div>
      </div>)}
    </div>

    <div className="card" style={{ marginBottom: '.8rem' }}>
      <h3 style={{ fontSize: '.94rem', marginBottom: '.55rem' }}>Why Each Tool Exists</h3>
      <div className="why-grid">
        {toolGuide.map((item) => <div key={item.tool} className="why-row">
          <div className="why-tool">{item.tool}</div>
          <div className="why-why">{item.why}</div>
          <div className="why-next">{item.next}</div>
        </div>)}
      </div>
    </div>

    <div className="card">
      <h3 style={{ fontSize: '.94rem', marginBottom: '.55rem' }}>Current Buildout</h3>
      <div className="why-grid">
        {buildout.map((item) => <div key={item.title} className="why-row">
          <div className="why-tool"><span className={`badge ${item.status === 'Live' ? 'badge-g' : item.status === 'In Build' ? 'badge-b' : item.status === 'Partial' ? 'badge-a' : 'badge-r'}`}>{item.status}</span></div>
          <div className="why-why" style={{ fontWeight: 600, color: 'var(--text1)' }}>{item.title}</div>
          <div className="why-next">{item.body}</div>
        </div>)}
      </div>
    </div>
  </div>;
}

export function AboutPage() {
  const roadmap = [
    { phase: 'Now', body: 'Atlas Home, the live Farmland Income playbook, and the shared underwriting/research spine define the current product.' },
    { phase: 'Next', body: 'Additional land playbooks should be added only when they have real evidence stacks, real model packs, and reusable value inside the shared tools.' },
    { phase: 'Later', body: 'Open sync, export, API, and AI layers should operate on structured Atlas objects rather than forcing Atlas to become a generic workspace tool.' },
  ];
  return <div>
    <div className="card hero-card" style={{ marginBottom: '.8rem' }}>
      <div className="hero-k">About</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">Altira Atlas is a land intelligence and underwriting platform built to connect playbook-driven discovery, site and county analysis, underwriting, and decision workflow support inside one shared product.</p>
    </div>

    <div className="about-grid">
      <div className="about-block">
        <div className="about-h">Why This Product</div>
        <div className="about-p">Important land and real-assets decisions still require pulling fragmented market, geography, hazard, and underwriting context into one place. Atlas exists to reduce that friction while keeping the evidence chain explicit.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Product Shape</div>
        <div className="about-p">Atlas is one product with playbook homes at the top and shared tools underneath. That keeps the workflow flexible for land that can matter across multiple monetization angles without forcing users into hard silos.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Current Live Playbook</div>
        <div className="about-p">The first live playbook is Farmland Income. It uses county valuation, agronomic evidence, hazard context, and underwriting models to help users discover, pressure test, and track land opportunities.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Open-by-Design</div>
        <div className="about-p">Atlas should stay native and specialized, but its core objects need to remain structured enough for future exports, sync adapters, API access, MCP integration, and AI-assisted workflows.</div>
      </div>
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
