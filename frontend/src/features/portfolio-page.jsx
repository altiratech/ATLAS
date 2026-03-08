import {
  $,
  $$,
  $chg,
  $pct,
  toast,
} from '../formatting.js';
import { api } from '../auth.js';
import { Loading } from '../shared/system.jsx';
import { STable } from '../shared/data-ui.jsx';

export function PortfolioPage({addToast}) {
  const [portfolios, setPortfolios] = React.useState([]);
  const [selId, setSelId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLd, setDetailLd] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  React.useEffect(() => {
    api('/portfolios')
      .then((d) => {
        setPortfolios(d);
        if (d.length > 0) setSelId(d[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!selId) return;
    setDetailLd(true);
    api(`/portfolios/${selId}`)
      .then((d) => setDetail(d))
      .catch(() => {})
      .finally(() => setDetailLd(false));
  }, [selId]);

  const createPortfolio = async () => {
    if (!newName.trim()) return;
    try {
      const p = await api('/portfolios', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name:newName}),
      });
      setPortfolios([...portfolios, {...p, holdings_count:0, total_acres:0}]);
      setSelId(p.id);
      setNewName('');
      addToast(toast('Portfolio created', 'ok'));
    } catch (e) {
      addToast(toast('Error creating portfolio', 'err'));
    }
  };

  if (loading) return <Loading/>;

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
        <h3 style={{fontSize:'1rem'}}>Portfolios</h3>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New portfolio name..." style={{width:'200px'}}/>
          <button className="btn btn-sm btn-p" onClick={createPortfolio}>Create</button>
        </div>
      </div>
      <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap'}}>
        {portfolios.map(p => <button key={p.id} className={`btn ${selId === p.id ? 'btn-p' : ''}`} onClick={()=>setSelId(p.id)}>
          {p.name} ({p.holdings_count || 0} holdings)
        </button>)}
      </div>
    </div>

    {detailLd && <Loading/>}

    {detail && !detailLd && <div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Total Acres</div><div className="sc-v">{Number(detail.total_acres || 0).toLocaleString()}</div></div>
        <div className="sc"><div className="sc-l">Current Value</div><div className="sc-v">{$$(detail.total_current_value)}</div></div>
        <div className="sc"><div className="sc-l">Fair Value</div><div className="sc-v">{$$(detail.total_fair_value)}</div></div>
        <div className="sc"><div className="sc-l">Annual NOI</div><div className="sc-v">{$$(detail.total_annual_noi)}</div></div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Portfolio Yield</div><div className="sc-v">{$pct(detail.portfolio_yield_pct)}</div></div>
        <div className="sc"><div className="sc-l">Unrealized Gain</div><div className="sc-v" style={{color:detail.unrealized_gain >= 0 ? 'var(--green)' : 'var(--red)'}}>{$$(detail.unrealized_gain)} ({$chg(detail.unrealized_gain_pct)})</div></div>
        <div className="sc"><div className="sc-l">Diversification</div><div className="sc-v">{detail.diversification_rating}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>HHI: {detail.hhi} | {detail.num_states} states, {detail.num_counties} counties</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'1.5rem'}}>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>Holdings</h3>
          <STable
            cols={[
              {key:'county_name',label:'County'},
              {key:'state',label:'ST'},
              {key:'acres',label:'Acres',num:true},
              {key:'weight_pct',label:'Weight',num:true,fmt:v=>v+'%'},
              {key:'current_value_acre',label:'Curr $/ac',num:true,fmt:v=>$$(v)},
              {key:'fair_value_acre',label:'FV $/ac',num:true,fmt:v=>$$(v)},
              {key:'noi_acre',label:'NOI/ac',num:true,fmt:v=>$$(v)},
              {key:'implied_cap',label:'Cap',num:true,fmt:v=>$pct(v)},
              {key:'unrealized_gain_pct',label:'Gain',num:true,fmt:v=><span className={v >= 0 ? 'pos' : 'neg'}>{$chg(v)}</span>},
            ]}
            rows={detail.holdings || []}
          />
        </div>
        <div className="card">
          <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>State Exposure</h3>
          {detail.state_exposure && <div>
            {Object.entries(detail.state_exposure).sort((a,b)=>b[1]-a[1]).map(([st,pct]) => <div key={st} style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
              <span style={{width:'30px',fontWeight:600,fontSize:'.85rem'}}>{st}</span>
              <div style={{flex:1,background:'var(--bg2)',height:'20px',overflow:'hidden'}}>
                <div style={{width:`${pct}%`,height:'100%',background:'var(--accent-2)',transition:'width .3s'}}></div>
              </div>
              <span style={{fontSize:'.8rem',fontFamily:"'IBM Plex Mono',monospace",color:'var(--text2)',width:'45px',textAlign:'right'}}>{pct}%</span>
            </div>)}
          </div>}
          <div style={{marginTop:'1rem'}}>
            <h4 style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.375rem'}}>Weighted Metrics</h4>
            {detail.weighted_metrics && <div style={{fontSize:'.8rem'}}>
              {Object.entries(detail.weighted_metrics).slice(0, 6).map(([k,v]) => <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'.25rem 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text2)',textTransform:'capitalize'}}>{k.replace(/_/g,' ')}</span>
                <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{$(v,2)}</span>
              </div>)}
            </div>}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
