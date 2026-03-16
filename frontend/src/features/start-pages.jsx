import { APP_NAME, APP_TAGLINE, PG } from '../config.js';

export function MissionPage({nav}) {
  const workflow = [
    {id:'01', title:'Discover the market', body:'Scan county-level signals and recent movers to see where valuation and rent trends are diverging.'},
    {id:'02', title:'Test assumptions', body:'Run scenario and backtest modules before making commitments, so decisions are based on modeled outcomes.'},
    {id:'03', title:'Focus your research', body:'Build watchlists, notes, and screens that keep attention on the highest-conviction locations.'},
    {id:'04', title:'Build portfolio context', body:'Track exposure, risk concentration, and fair-value gaps across target holdings and active assets.'},
  ];

  const toolGuide = [
    {tool:'Dashboard', why:'Find where market conditions are shifting right now.', next:'Review top movers and open 2-3 counties.'},
    {tool:'Screener', why:'Filter opportunities instead of reviewing every county manually.', next:'Set minimum cap rate and access score.'},
    {tool:'County Detail', why:'Inspect valuation logic, history, sensitivity, and notes in one place.', next:'Open one county and record your thesis.'},
    {tool:'Watchlist', why:'Monitor high-priority counties over time.', next:'Track valuation and rent changes week to week.'},
    {tool:'Comparison', why:'Evaluate counties side by side before committing capital.', next:'Compare at least 3 target counties.'},
    {tool:'Research Workspace', why:'Capture thesis, status, conviction, and notes in one research system.', next:'Create workspace records for top 10 counties.'},
    {tool:'Scenario Lab', why:'Test upside/downside by changing growth, risk, and rent assumptions.', next:'Run best/base/worst-case scenarios.'},
    {tool:'Backtest', why:'Check whether your screening logic would have worked historically.', next:'Backtest your screen over 3-5 years.'},
    {tool:'Portfolio', why:'Quantify concentration risk and unrealized value gaps.', next:'Create one model portfolio and assess HHI.'},
    {tool:'Data Sources', why:'Verify where every input comes from and how often it updates.', next:'Confirm cadence before presenting outputs.'},
  ];
  const buildout = [
    {status:'Live', title:'Farmland Discovery + Modeling', body:'Dashboard, Screener, County Detail, Research Workspace, Scenario Lab, and Backtest now run on real Atlas data and model logic.'},
    {status:'In Build', title:'Workflow Closure', body:'Atlas is actively being tightened so counties can move cleanly from discovery into research, scenarios, underwriting, and historical testing without manual context resets.'},
    {status:'Partial', title:'Location-Sensitive Real Assets Expansion', body:'Industrial and data-center screening are starting with live power and hazard evidence. More logistics, site-readiness, and infrastructure layers are still missing and remain clearly marked as such.'},
    {status:'Planned', title:'Selected Commercial Real Estate Workflows', body:'Later expansion should focus on commercial real estate workflows where site, infrastructure, and location drive value. Broad lease-roll, tenant-credit, and asset-management systems are out of scope for now.'},
  ];

  return <div>
    <div className="card hero-card">
      <div className="hero-k">Atlas</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">{APP_TAGLINE}. Atlas is a real-assets intelligence and underwriting platform that starts with farmland, then expands into industrial, logistics, data-center, energy, and development-oriented land use cases as the same workflow spine proves itself.</p>
      <div className="hero-actions">
        <button className="btn btn-p" onClick={() => nav(PG.DASH)}>Open Market Dashboard</button>
        <button className="btn" onClick={() => nav(PG.ABOUT)}>Read About</button>
      </div>
    </div>

    <div className="workflow-grid">
      {workflow.map(step => <div key={step.id} className="workflow-card">
        <div className="workflow-step">Step {step.id}</div>
        <div className="workflow-h">{step.title}</div>
        <div className="workflow-p">{step.body}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:'.8rem'}}>
      <h3 style={{fontSize:'.94rem',marginBottom:'.55rem'}}>Why Each Tool Exists</h3>
      <div className="why-grid">
        {toolGuide.map(item => <div key={item.tool} className="why-row">
          <div className="why-tool">{item.tool}</div>
          <div className="why-why">{item.why}</div>
          <div className="why-next">{item.next}</div>
        </div>)}
      </div>
    </div>

    <div className="card">
      <h3 style={{fontSize:'.94rem',marginBottom:'.55rem'}}>Current Buildout</h3>
      <div className="why-grid">
        {buildout.map(item => <div key={item.title} className="why-row">
          <div className="why-tool"><span className={`badge ${item.status === 'Live' ? 'badge-g' : item.status === 'In Build' ? 'badge-b' : item.status === 'Partial' ? 'badge-a' : 'badge-r'}`}>{item.status}</span></div>
          <div className="why-why" style={{fontWeight:600,color:'var(--text1)'}}>{item.title}</div>
          <div className="why-next">{item.body}</div>
        </div>)}
      </div>
    </div>
  </div>;
}

export function AboutPage() {
  const roadmap = [
    {phase:'Now', body:'Farmland discovery, underwriting, scenario modeling, and workflow closure remain the active proving wedge.'},
    {phase:'Next', body:'Industrial, logistics, data-center, energy, and development-oriented land expand through real site, power, hazard, and infrastructure evidence.'},
    {phase:'Later', body:'Selected commercial real estate workflows can follow where site, infrastructure, and location drive value. Broad lease-roll, tenant-credit, and asset-management systems remain out of scope for now.'},
  ];
  return <div>
    <div className="card hero-card" style={{marginBottom:'.8rem'}}>
      <div className="hero-k">About</div>
      <h2 className="hero-h">{APP_NAME}</h2>
      <p className="hero-p">Altira Atlas is a real-assets intelligence and underwriting platform built to connect site discovery, market research, underwriting, and investment workflows. The current live lane starts with farmland, with broader location-sensitive real-assets coverage planned in later phases.</p>
    </div>

    <div className="about-grid">
      <div className="about-block">
        <div className="about-h">Why This Project</div>
        <div className="about-p">Important real-assets decisions still require pulling fragmented market data, geography, hazard context, and manual models into one place. Atlas exists to reduce that friction and make analysis repeatable, starting with farmland where the workflow is already strong enough to prove the system.</div>
      </div>
      <div className="about-block">
        <div className="about-h">What It Merges</div>
        <div className="about-p">The platform blends geographic intelligence, underwriting, market research, and decision workflow support into one operating system so users can move from discovery to diligence without context switching.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Who It Serves</div>
        <div className="about-p">Investors, lenders, advisors, operators, and analysts who need a rigorous way to research counties, test assumptions, and track conviction across location-sensitive real-assets decisions.</div>
      </div>
      <div className="about-block">
        <div className="about-h">Current Product Scope</div>
        <div className="about-p">Current releases prioritize farmland research and underwriting workflows first: market scanning, county deep dives, scenarios, backtests, and investment research. Near-term expansion stays focused on industrial, logistics, data-center, energy, and development-oriented land. Selected commercial real estate workflows come later.</div>
      </div>
    </div>

    <div className="card">
      <h3 style={{fontSize:'.94rem',marginBottom:'.45rem'}}>Product Description</h3>
      <p className="about-p">Altira Atlas helps users answer three practical questions: where should we focus, what could happen under different conditions, and which opportunities are strong enough to act on. The design emphasizes data density, traceability, and fast iteration without pretending to be a full-spectrum commercial real estate operating system.</p>
    </div>

    <div className="card" style={{marginTop:'.8rem'}}>
      <h3 style={{fontSize:'.94rem',marginBottom:'.45rem'}}>Build Sequence</h3>
      <div className="why-grid">
        {roadmap.map(item => <div key={item.phase} className="why-row">
          <div className="why-tool">{item.phase}</div>
          <div className="why-next">{item.body}</div>
        </div>)}
      </div>
    </div>
  </div>;
}
