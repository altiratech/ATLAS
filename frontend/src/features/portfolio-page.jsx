import {
  $,
  $$,
  $chg,
  $int,
  $pct,
  toast,
} from '../formatting.js';
import { PORTFOLIO_GRID_VIEW_KEY } from '../config.js';
import { api } from '../auth.js';
import { ErrBox, Loading } from '../shared/system.jsx';
import { CountyPicker, DataGrid } from '../shared/data-ui.jsx';
import { appendAssumptionParam, AssumptionContextBar } from '../shared/assumptions-ui.jsx';
import { evaluateAtlasCountyRead } from '../shared/atlas-read.js';
import { persistGridViewState, readStoredGridViewState } from '../shared/grid-view-state.js';
import {
  getDefaultPortfolioViewState,
  getPortfolioColumns,
  getPortfolioRowAccent,
  hydratePortfolioRows,
  PortfolioRecordPanel,
} from '../shared/portfolio-grid.jsx';

function metricLabel(key) {
  switch (key) {
    case 'cash_rent': return 'Cash Rent';
    case 'benchmark_value': return 'Benchmark Value';
    case 'noi_per_acre': return 'NOI / ac';
    case 'implied_cap_rate': return 'Cap Rate';
    case 'fair_value': return 'Fair Value';
    case 'rent_multiple': return 'Rent Multiple';
    case 'access_score': return 'Access Score';
    case 'dscr': return 'DSCR';
    default: return key.replace(/_/g, ' ');
  }
}

function metricValue(key, value) {
  if (value == null) return 'N/A';
  switch (key) {
    case 'cash_rent':
    case 'benchmark_value':
    case 'noi_per_acre':
    case 'fair_value':
      return $$(value);
    case 'implied_cap_rate':
      return $pct(value);
    case 'rent_multiple':
    case 'dscr':
      return Number(value).toFixed(2);
    case 'access_score':
      return Number(value).toFixed(1);
    default:
      return $(value, 2);
  }
}

function toneForRisk(value, { inverse = false, warnAt = 60, dangerAt = 80 } = {}) {
  if (value == null) return 'var(--text)';
  if (inverse) {
    if (value >= dangerAt) return 'var(--green)';
    if (value >= warnAt) return 'var(--amber)';
    return 'var(--red)';
  }
  if (value >= dangerAt) return 'var(--red)';
  if (value >= warnAt) return 'var(--amber)';
  return 'var(--green)';
}

function RiskSummaryCard({ label, value, detail, color }) {
  return <div className="card">
    <div className="sc-l">{label}</div>
    <div className="sc-v" style={{color}}>{value}</div>
    <div style={{fontSize:'.78rem',color:'var(--text2)'}}>{detail}</div>
  </div>;
}

export function PortfolioPage({
  addToast,
  nav,
  assumptionSets,
  activeAssumptionSetId,
  activeAssumptionSet,
  setActiveAssumptionSetId,
}) {
  const [portfolios, setPortfolios] = React.useState([]);
  const [selId, setSelId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLd, setDetailLd] = React.useState(false);
  const [detailErr, setDetailErr] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [holdingCounty, setHoldingCounty] = React.useState('');
  const [holdingAcres, setHoldingAcres] = React.useState('100');
  const [holdingPurchasePrice, setHoldingPurchasePrice] = React.useState('');
  const [holdingPurchaseYear, setHoldingPurchaseYear] = React.useState('');
  const [savingHolding, setSavingHolding] = React.useState(false);
  const [holdingSearch, setHoldingSearch] = React.useState('');
  const [holdingReadFilter, setHoldingReadFilter] = React.useState('');
  const [portfolioViewConfig, setPortfolioViewConfig] = React.useState(() => readStoredGridViewState(PORTFOLIO_GRID_VIEW_KEY, getDefaultPortfolioViewState));

  const loadPortfolios = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/portfolios');
      setPortfolios(d);
      setSelId((current) => {
        if (current && d.some((p) => String(p.id) === String(current))) return current;
        return d.length > 0 ? d[0].id : null;
      });
    } catch {
      setPortfolios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = React.useCallback(async (portfolioId) => {
    if (!portfolioId) return;
    setDetailLd(true);
    setDetailErr(null);
    try {
      const d = await api(appendAssumptionParam(`/portfolios/${portfolioId}`, activeAssumptionSetId));
      setDetail(d);
    } catch (e) {
      setDetail(null);
      setDetailErr(e.message || 'Failed to load portfolio detail');
    } finally {
      setDetailLd(false);
    }
  }, [activeAssumptionSetId]);

  React.useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  React.useEffect(() => {
    if (!selId) return;
    loadDetail(selId);
  }, [selId, loadDetail]);

  React.useEffect(() => {
    persistGridViewState(PORTFOLIO_GRID_VIEW_KEY, portfolioViewConfig);
  }, [portfolioViewConfig]);

  const createPortfolio = async () => {
    if (!newName.trim()) return;
    try {
      const p = await api('/portfolios', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name:newName}),
      });
      setPortfolios((prev) => [...prev, {...p, holdings_count:0, total_acres:0}]);
      setSelId(p.id);
      setNewName('');
      addToast(toast('Portfolio created', 'ok'));
    } catch {
      addToast(toast('Error creating portfolio', 'err'));
    }
  };

  const addHolding = async () => {
    if (!selId) {
      addToast(toast('Select a portfolio first', 'err'));
      return;
    }
    if (!holdingCounty) {
      addToast(toast('Select a county to add', 'err'));
      return;
    }
    const acres = Number(holdingAcres);
    if (!Number.isFinite(acres) || acres <= 0) {
      addToast(toast('Enter a valid acreage value', 'err'));
      return;
    }
    setSavingHolding(true);
    try {
      await api(`/portfolios/${selId}/holdings`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          geo_key: holdingCounty,
          acres,
          purchase_price_per_acre: holdingPurchasePrice === '' ? null : Number(holdingPurchasePrice),
          purchase_year: holdingPurchaseYear.trim() || null,
        }),
      });
      setHoldingCounty('');
      setHoldingAcres('100');
      setHoldingPurchasePrice('');
      setHoldingPurchaseYear('');
      await Promise.all([loadPortfolios(), loadDetail(selId)]);
      addToast(toast('Holding added', 'ok'));
    } catch (e) {
      addToast(toast(e.message || 'Failed to add holding', 'err'));
    } finally {
      setSavingHolding(false);
    }
  };

  const removeHolding = async (geoKey) => {
    if (!selId) return;
    try {
      await api(`/portfolios/${selId}/holdings/${geoKey}`, { method:'DELETE' });
      await Promise.all([loadPortfolios(), loadDetail(selId)]);
      addToast(toast('Holding removed', 'ok'));
    } catch (e) {
      addToast(toast(e.message || 'Failed to remove holding', 'err'));
    }
  };

  if (loading) return <Loading/>;

  const holdingsWithRead = (detail?.holdings || []).map((holding) => {
    const read = evaluateAtlasCountyRead({
      metrics: holding.metrics || {},
      sourceQuality: holding.source_quality,
      productivityActive: holding.productivity_active,
      yieldProductivityFactor: holding.yield_productivity_factor,
      soil: holding.soil,
      irrigation: holding.irrigation,
      drought: holding.drought,
      flood: holding.flood,
      credit: holding.credit,
      benchmarkMethodDetail: holding.benchmark_method_detail,
    });
    return {...holding, _read: read};
  });
  const portfolioRows = React.useMemo(
    () => hydratePortfolioRows(holdingsWithRead),
    [holdingsWithRead],
  );
  const filteredPortfolioRows = React.useMemo(() => {
    const query = holdingSearch.trim().toLowerCase();
    return portfolioRows.filter((row) => {
      if (holdingReadFilter && row._read_label !== holdingReadFilter) return false;
      if (query && !row._search_blob.includes(query)) return false;
      return true;
    });
  }, [portfolioRows, holdingReadFilter, holdingSearch]);
  const portfolioColumns = React.useMemo(() => getPortfolioColumns(), []);
  const portfolioRowColorOptions = React.useMemo(() => [
    { value: 'atlas_read', label: 'Atlas Read' },
    { value: 'hazard', label: 'Hazard' },
    { value: 'basis', label: 'Basis Quality' },
    { value: 'none', label: 'None' },
  ], []);
  const hasHoldingFilters = !!(holdingSearch.trim() || holdingReadFilter);

  const totalAcres = Number(detail?.total_acres || 0);
  const readExposure = holdingsWithRead.reduce((acc, holding) => {
    const label = holding._read?.overall?.label || 'UNKNOWN';
    const current = acc[label] || { acres: 0, className: holding._read?.overall?.className || 'badge-a' };
    current.acres += Number(holding.acres || 0);
    acc[label] = current;
    return acc;
  }, {});
  const readExposureRows = Object.entries(readExposure)
    .map(([label, info]) => ({
      label,
      acres: info.acres,
      className: info.className,
      pct: totalAcres > 0 ? (info.acres / totalAcres) * 100 : 0,
    }))
    .sort((a, b) => b.acres - a.acres);

  const riskSummary = detail?.risk_summary || {};
  const weightedMetrics = detail?.weighted_metrics || {};

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem',gap:'.75rem',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.2rem'}}>Portfolios</h3>
          <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Create a model portfolio, add county holdings, and track concentration plus value gaps using the live Atlas model stack.</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New portfolio name..." style={{width:'220px'}}/>
          <button className="btn btn-sm btn-p" onClick={createPortfolio}>Create</button>
        </div>
      </div>
      <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap'}}>
        {portfolios.map((p) => <button key={p.id} className={`btn ${selId === p.id ? 'btn-p' : ''}`} onClick={() => setSelId(p.id)}>
          {p.name} ({p.holdings_count || 0} holdings)
        </button>)}
      </div>
      {portfolios.length === 0 && <div style={{fontSize:'.78rem',color:'var(--text2)',marginTop:'.75rem'}}>No portfolios yet. Create one above to start adding county holdings.</div>}
    </div>

    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Portfolio Model Basis"
      description="Portfolio value, stress, and evidence rollups use the active assumption set so this page stays aligned with county, scenario, and research outputs."
    />

    {!!selId && <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',flexWrap:'wrap',marginBottom:'.75rem'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.2rem'}}>Add Holding</h3>
          <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Assign a county, acreage, and optional purchase basis so Atlas can calculate portfolio-level yield, fair value, and unrealized gain.</div>
        </div>
        <div className="badge badge-b">PORTFOLIO {selId}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(220px,1.5fr) repeat(3, minmax(120px, 1fr)) auto',gap:'.75rem',alignItems:'end'}}>
        <div className="fg" style={{margin:0}}>
          <label>County</label>
          <CountyPicker value={holdingCounty} onChange={setHoldingCounty}/>
        </div>
        <div className="fg" style={{margin:0}}>
          <label>Acres</label>
          <input type="number" min="1" step="1" value={holdingAcres} onChange={(e)=>setHoldingAcres(e.target.value)}/>
        </div>
        <div className="fg" style={{margin:0}}>
          <label>Purchase $/ac</label>
          <input type="number" min="0" step="1" value={holdingPurchasePrice} onChange={(e)=>setHoldingPurchasePrice(e.target.value)} placeholder="Optional"/>
        </div>
        <div className="fg" style={{margin:0}}>
          <label>Purchase Year</label>
          <input type="number" min="1900" max="2100" step="1" value={holdingPurchaseYear} onChange={(e)=>setHoldingPurchaseYear(e.target.value)} placeholder="Optional"/>
        </div>
        <button className="btn btn-sm btn-p" onClick={addHolding} disabled={savingHolding}>{savingHolding ? 'Adding...' : 'Add Holding'}</button>
      </div>
    </div>}

    {detailLd && <Loading/>}
    {detailErr && !detailLd && <ErrBox title="Portfolio Error" msg={detailErr} onRetry={() => loadDetail(selId)}/>}

    {detail && !detailLd && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Total Acres</div><div className="sc-v">{$int(detail.total_acres || 0)}</div></div>
        <div className="sc"><div className="sc-l">Current Value</div><div className="sc-v">{$$(detail.total_current_value)}</div></div>
        <div className="sc"><div className="sc-l">Fair Value</div><div className="sc-v">{$$(detail.total_fair_value)}</div></div>
        <div className="sc"><div className="sc-l">Annual NOI</div><div className="sc-v">{$$(detail.annual_noi)}</div></div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Portfolio Yield</div><div className="sc-v">{$pct(detail.portfolio_yield_pct)}</div></div>
        <div className="sc"><div className="sc-l">Unrealized Gain</div><div className="sc-v" style={{color:detail.unrealized_gain_pct == null ? 'var(--text2)' : (detail.unrealized_gain_pct >= 0 ? 'var(--green)' : 'var(--red)')}}>{detail.unrealized_gain_pct == null ? 'N/A' : `${$chg(detail.unrealized_gain_pct)} (${detail.total_purchase_value != null ? $$(detail.total_current_value - detail.total_purchase_value) : 'partial cost basis'})`}</div></div>
        <div className="sc"><div className="sc-l">Diversification</div><div className="sc-v">{detail.diversification_rating}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>HHI: {detail.hhi} | {detail.num_states} states, {detail.num_counties} counties</div></div>
        <div className="sc"><div className="sc-l">Purchase Basis</div><div className="sc-v">{detail.total_purchase_value != null ? $$(detail.total_purchase_value) : 'PARTIAL'}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>{detail.total_purchase_value != null ? 'Tracked from entered holdings' : 'Missing purchase values on one or more holdings'}</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:'.75rem',marginBottom:'1.5rem'}}>
        <RiskSummaryCard
          label="Weighted Drought Risk"
          value={riskSummary.weighted_drought_risk != null ? $(riskSummary.weighted_drought_risk, 1) : 'N/A'}
          detail={riskSummary.high_drought_acres_pct != null ? `${$pct(riskSummary.high_drought_acres_pct)} of acres are in high-drought counties.` : 'No drought evidence loaded yet.'}
          color={toneForRisk(riskSummary.weighted_drought_risk)}
        />
        <RiskSummaryCard
          label="Weighted Flood Risk"
          value={riskSummary.weighted_flood_risk != null ? $(riskSummary.weighted_flood_risk, 1) : 'N/A'}
          detail={riskSummary.high_flood_acres_pct != null ? `${$pct(riskSummary.high_flood_acres_pct)} of acres are in high-flood counties.` : 'No flood evidence loaded yet.'}
          color={toneForRisk(riskSummary.weighted_flood_risk)}
        />
        <RiskSummaryCard
          label="Weighted Soil Quality"
          value={riskSummary.weighted_soil_significant_share_pct != null ? `${$(riskSummary.weighted_soil_significant_share_pct, 1)}%` : 'N/A'}
          detail={riskSummary.strong_soil_acres_pct != null ? `${$pct(riskSummary.strong_soil_acres_pct)} of acres are in strong-soil counties.` : 'No soil evidence loaded yet.'}
          color={toneForRisk(riskSummary.weighted_soil_significant_share_pct, {inverse:true, warnAt:55, dangerAt:70})}
        />
        <RiskSummaryCard
          label="Weighted AWS 100cm"
          value={riskSummary.weighted_rootzone_aws_100cm != null ? $(riskSummary.weighted_rootzone_aws_100cm, 2) : 'N/A'}
          detail="Higher available water storage supports more resilient agronomic profiles."
          color={'var(--text)'}
        />
        <RiskSummaryCard
          label="Stress DSCR"
          value={riskSummary.weighted_combined_stress_dscr != null ? `${$(riskSummary.weighted_combined_stress_dscr, 2)}x` : 'N/A'}
          detail="Acreage-weighted combined-stress DSCR across holdings using the active assumption set."
          color={toneForRisk(riskSummary.weighted_combined_stress_dscr, {inverse:true, warnAt:1, dangerAt:1.25})}
        />
        <RiskSummaryCard
          label="Basis Quality"
          value={riskSummary.county_observed_acres_pct != null ? `${$pct(riskSummary.county_observed_acres_pct)}` : 'N/A'}
          detail={riskSummary.proxy_county_acres_pct != null ? `${$pct(riskSummary.proxy_county_acres_pct)} of acres are proxy- or fallback-driven.` : 'Benchmark lineage unavailable.'}
          color={toneForRisk(riskSummary.county_observed_acres_pct, {inverse:true, warnAt:45, dangerAt:65})}
        />
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'1.5rem',marginBottom:'1.5rem'}}>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap',marginBottom:'.5rem'}}>
            <h3 style={{fontSize:'1rem'}}>Portfolio Risk Synthesis</h3>
            <div style={{fontSize:'.78rem',color:'var(--text2)'}}>This rolls up the same county read, hazard, soil, and credit logic already used in County Detail and Research Workspace.</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:'1rem'}}>
            <div>
              <div className="workflow-step">Read Exposure</div>
              {readExposureRows.length === 0 ? <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Add holdings to see how portfolio acres distribute across Atlas county reads.</div> : readExposureRows.map((row) => <div key={row.label} style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
                <span className={`badge ${row.className}`} style={{minWidth:'148px',justifyContent:'center'}}>{row.label}</span>
                <div style={{flex:1,background:'var(--bg2)',height:'18px',overflow:'hidden'}}>
                  <div style={{width:`${row.pct}%`,height:'100%',background:'var(--accent-2)'}} />
                </div>
                <span style={{width:'58px',textAlign:'right',fontSize:'.78rem',fontFamily:"'IBM Plex Mono', monospace"}}>{row.pct.toFixed(1)}%</span>
              </div>)}
            </div>
            <div>
              <div className="workflow-step">What This Portfolio Needs</div>
              <div style={{fontSize:'.8rem',lineHeight:1.6}}>
                <div style={{marginBottom:'.28rem'}}>• {riskSummary.proxy_county_acres_pct >= 40 ? 'A large share of acreage still depends on proxy-backed benchmarks; confirm those counties before treating the portfolio as fully underwritten.' : 'Benchmark lineage is mostly county-observed or mixed, so the valuation base is relatively stronger.'}</div>
                <div style={{marginBottom:'.28rem'}}>• {riskSummary.weighted_combined_stress_dscr != null && riskSummary.weighted_combined_stress_dscr < 1 ? 'Combined-stress DSCR is below 1.0x, so downside debt resilience remains a live portfolio risk.' : 'Combined-stress DSCR is not showing an immediate broad debt squeeze across the portfolio.'}</div>
                <div style={{marginBottom:'.28rem'}}>• {riskSummary.high_drought_acres_pct >= 30 || riskSummary.high_flood_acres_pct >= 30 ? 'Hazard concentration is meaningful in part of the acreage base; the next decision step should isolate those counties and test hold-specific downside.' : 'Hazard concentration is present but not dominant at the portfolio level.'}</div>
                <div>• {riskSummary.strong_soil_acres_pct >= 50 ? 'A majority of acres sit in stronger-soil counties, which supports the land-quality baseline.' : 'Soil quality is mixed enough that county selection still matters more than broad portfolio averages.'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>State Exposure</h3>
          {detail.state_exposure && Object.keys(detail.state_exposure).length > 0 ? <div>
            {Object.entries(detail.state_exposure).sort((a,b)=>b[1]-a[1]).map(([st,pct]) => <div key={st} style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
              <span style={{width:'30px',fontWeight:600,fontSize:'.85rem'}}>{st}</span>
              <div style={{flex:1,background:'var(--bg2)',height:'20px',overflow:'hidden'}}>
                <div style={{width:`${pct}%`,height:'100%',background:'var(--accent-2)',transition:'width .3s'}}></div>
              </div>
              <span style={{fontSize:'.8rem',fontFamily:"'IBM Plex Mono', monospace",color:'var(--text2)',width:'45px',textAlign:'right'}}>{pct}%</span>
            </div>)}
          </div> : <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Add holdings to see state exposure.</div>}
          <div style={{marginTop:'1rem'}}>
            <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem'}}>Weighted Metrics</h4>
            {Object.keys(weightedMetrics).length > 0 ? <div style={{fontSize:'.8rem'}}>
              {Object.entries(weightedMetrics).map(([k,v]) => <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'.25rem 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text2)',textTransform:'capitalize'}}>{metricLabel(k)}</span>
                <span style={{fontFamily:"'IBM Plex Mono', monospace"}}>{metricValue(k, v)}</span>
              </div>)}
            </div> : <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Weighted metrics will populate once the portfolio has holdings.</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap',marginBottom:'.5rem'}}>
          <h3 style={{fontSize:'1rem'}}>Holdings</h3>
          <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Browse holdings in the same grid language Atlas now uses elsewhere, then open the side panel for county, research, scenario, or removal actions.</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(240px,1.5fr) minmax(190px,1fr) auto',gap:'.55rem',alignItems:'end',marginBottom:'.65rem'}}>
          <div className="fg" style={{margin:0}}>
            <label>Search Holdings</label>
            <input
              type="text"
              value={holdingSearch}
              onChange={(e) => setHoldingSearch(e.target.value)}
              placeholder="County, state, read, basis, hazard..."
            />
          </div>
          <div className="fg" style={{margin:0}}>
            <label>Read Filter</label>
            <select value={holdingReadFilter} onChange={(e) => setHoldingReadFilter(e.target.value)}>
              <option value="">All reads</option>
              {Array.from(new Set(portfolioRows.map((row) => row._read_label))).sort().map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'flex-end'}}>
              <button className="btn btn-sm" onClick={() => setPortfolioViewConfig(getDefaultPortfolioViewState())}>Reset Grid View</button>
              {hasHoldingFilters && <button className="btn btn-sm" onClick={() => {
                setHoldingSearch('');
                setHoldingReadFilter('');
              }}>Clear Filters</button>}
            </div>
          </div>
        </div>
        <DataGrid
          columns={portfolioColumns}
          rows={filteredPortfolioRows}
          rowKey="geo_key"
          stickyHeader
          viewConfig={portfolioViewConfig}
          onViewChange={setPortfolioViewConfig}
          rowColorFn={(row) => getPortfolioRowAccent(row, portfolioViewConfig?.rowColoring)}
          rowColorOptions={portfolioRowColorOptions}
          emptyMessage={hasHoldingFilters ? 'No holdings match the current filters.' : 'No holdings yet.'}
          renderRecordPanel={(row, closePanel) => <PortfolioRecordPanel
            row={row}
            closePanel={closePanel}
            nav={nav}
            removeHolding={removeHolding}
            portfolioName={detail?.name}
            riskSummary={riskSummary}
          />}
        />
      </div>
    </div>}
  </div>;
}
