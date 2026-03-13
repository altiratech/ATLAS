import {
  $,
  $$,
  $chg,
  $pct,
  toast,
} from '../formatting.js';
import { PG } from '../config.js';
import { api } from '../auth.js';
import { ErrBox, Loading } from '../shared/system.jsx';
import { CountyPicker, STable } from '../shared/data-ui.jsx';

export function PortfolioPage({addToast, nav}) {
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

  const loadPortfolios = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/portfolios');
      setPortfolios(d);
      setSelId((current) => {
        if (current && d.some((p) => String(p.id) === String(current))) return current;
        return d.length > 0 ? d[0].id : null;
      });
    } catch (e) {
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
      const d = await api(`/portfolios/${portfolioId}`);
      setDetail(d);
    } catch (e) {
      setDetail(null);
      setDetailErr(e.message || 'Failed to load portfolio detail');
    } finally {
      setDetailLd(false);
    }
  }, []);

  React.useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  React.useEffect(() => {
    if (!selId) return;
    loadDetail(selId);
  }, [selId, loadDetail]);

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
    } catch (e) {
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
        {portfolios.map(p => <button key={p.id} className={`btn ${selId === p.id ? 'btn-p' : ''}`} onClick={()=>setSelId(p.id)}>
          {p.name} ({p.holdings_count || 0} holdings)
        </button>)}
      </div>
      {portfolios.length === 0 && <div style={{fontSize:'.78rem',color:'var(--text2)',marginTop:'.75rem'}}>No portfolios yet. Create one above to start adding county holdings.</div>}
    </div>

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
        <div className="sc"><div className="sc-l">Total Acres</div><div className="sc-v">{Number(detail.total_acres || 0).toLocaleString()}</div></div>
        <div className="sc"><div className="sc-l">Current Value</div><div className="sc-v">{$$(detail.total_current_value)}</div></div>
        <div className="sc"><div className="sc-l">Fair Value</div><div className="sc-v">{$$(detail.total_fair_value)}</div></div>
        <div className="sc"><div className="sc-l">Annual NOI</div><div className="sc-v">{$$(detail.total_annual_noi)}</div></div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Portfolio Yield</div><div className="sc-v">{$pct(detail.portfolio_yield_pct)}</div></div>
        <div className="sc"><div className="sc-l">Unrealized Gain</div><div className="sc-v" style={{color:detail.unrealized_gain_pct == null ? 'var(--text2)' : (detail.unrealized_gain_pct >= 0 ? 'var(--green)' : 'var(--red)')}}>{detail.unrealized_gain_pct == null ? 'N/A' : `${$chg(detail.unrealized_gain_pct)} (${detail.total_purchase_value != null ? $$(detail.total_current_value - detail.total_purchase_value) : 'partial cost basis'})`}</div></div>
        <div className="sc"><div className="sc-l">Diversification</div><div className="sc-v">{detail.diversification_rating}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>HHI: {detail.hhi} | {detail.num_states} states, {detail.num_counties} counties</div></div>
        <div className="sc"><div className="sc-l">Purchase Basis</div><div className="sc-v">{detail.total_purchase_value != null ? $$(detail.total_purchase_value) : 'PARTIAL'}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>{detail.total_purchase_value != null ? 'Tracked from entered holdings' : 'Missing purchase values on one or more holdings'}</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'1.5rem'}}>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap',marginBottom:'.5rem'}}>
            <h3 style={{fontSize:'1rem'}}>Holdings</h3>
            <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Click a row to open county detail or remove a holding inline.</div>
          </div>
          <STable
            cols={[
              {key:'county_name',label:'County'},
              {key:'state',label:'ST'},
              {key:'acres',label:'Acres',num:true},
              {key:'purchase_price_per_acre',label:'Cost $/ac',num:true,fmt:v=>$$(v)},
              {key:'weight_pct',label:'Weight',num:true,fmt:v=>v+'%'},
              {key:'current_value_acre',label:'Curr $/ac',num:true,fmt:v=>$$(v)},
              {key:'fair_value_acre',label:'FV $/ac',num:true,fmt:v=>$$(v)},
              {key:'noi_acre',label:'NOI/ac',num:true,fmt:v=>$$(v)},
              {key:'implied_cap',label:'Cap',num:true,fmt:v=>$pct(v)},
              {key:'unrealized_gain_pct',label:'Gain',num:true,fmt:v=>v == null ? 'N/A' : <span className={v >= 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
              {key:'_workflow',label:'Workflow',sortable:false,fmt:(_,r)=><div style={{display:'flex',gap:'.35rem',justifyContent:'flex-end',flexWrap:'wrap'}}>
                <button className="btn btn-sm" onClick={e => { e.stopPropagation(); nav?.(PG.COUNTY, {fips:r.geo_key}); }}>County</button>
                <button className="btn btn-sm btn-d" onClick={e => { e.stopPropagation(); removeHolding(r.geo_key); }}>Remove</button>
              </div>},
            ]}
            rows={(detail.holdings || []).map((holding) => ({
              ...holding,
              current_value_acre: holding.acres > 0 ? holding.current_value / holding.acres : null,
              fair_value_acre: holding.acres > 0 ? holding.fair_value / holding.acres : null,
              noi_acre: holding.acres > 0 ? holding.annual_noi / holding.acres : null,
              implied_cap: holding.implied_cap_rate,
              _workflow: holding.geo_key,
            }))}
            onRow={(r) => nav?.(PG.COUNTY, {fips:r.geo_key})}
          />
        </div>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>State Exposure</h3>
          {detail.state_exposure && Object.keys(detail.state_exposure).length > 0 ? <div>
            {Object.entries(detail.state_exposure).sort((a,b)=>b[1]-a[1]).map(([st,pct]) => <div key={st} style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
              <span style={{width:'30px',fontWeight:600,fontSize:'.85rem'}}>{st}</span>
              <div style={{flex:1,background:'var(--bg2)',height:'20px',overflow:'hidden'}}>
                <div style={{width:`${pct}%`,height:'100%',background:'var(--accent-2)',transition:'width .3s'}}></div>
              </div>
              <span style={{fontSize:'.8rem',fontFamily:"'IBM Plex Mono',monospace",color:'var(--text2)',width:'45px',textAlign:'right'}}>{pct}%</span>
            </div>)}
          </div> : <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Add holdings to see state exposure.</div>}
          <div style={{marginTop:'1rem'}}>
            <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem'}}>Weighted Metrics</h4>
            {detail.weighted_metrics && Object.keys(detail.weighted_metrics).length > 0 ? <div style={{fontSize:'.8rem'}}>
              {Object.entries(detail.weighted_metrics).slice(0, 6).map(([k,v]) => <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'.25rem 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text2)',textTransform:'capitalize'}}>{k.replace(/_/g,' ')}</span>
                <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{$(v,2)}</span>
              </div>)}
            </div> : <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Weighted metrics will populate once the portfolio has holdings.</div>}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
