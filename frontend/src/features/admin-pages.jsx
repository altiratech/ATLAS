import { PG } from '../config.js';
import { api } from '../auth.js';
import { Loading } from '../shared/system.jsx';
import { STable } from '../shared/data-ui.jsx';

export function ScreensMgr({ nav, params }) {
  const [screens, setScreens] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api('/screens')
      .then((d) => setScreens(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading/>;

  return <div className="card">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.6rem',flexWrap:'wrap',marginBottom:'1rem'}}>
      <div>
        <h3 style={{fontSize:'1rem',marginBottom:'.2rem'}}>Saved Screens</h3>
        <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Reusable screen definitions for Screener and Backtest.</div>
      </div>
      <div style={{display:'flex',gap:'.45rem',flexWrap:'wrap'}}>
        <button className="btn btn-sm" onClick={() => nav(PG.SCREEN)}>Open Screener</button>
        <button className="btn btn-sm" onClick={() => nav(PG.BACKTEST, params?.screen_id ? { screen_id: params.screen_id, sourcePage: 'screens_mgr' } : {})}>Open Backtest</button>
      </div>
    </div>
    {screens.length === 0 ? <div className="empty"><p>No screens saved. Create one from the Screener page.</p></div>
     : <div style={{display:'grid',gap:'.75rem'}}>
        {screens.map(s => <div key={s.id} className="sc">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:600,marginBottom:'.125rem'}}>{s.name}</div>
              <div style={{fontSize:'.75rem',color:'var(--text2)'}}>v{s.version} | {(s.filters || []).length} reusable filters</div>
            </div>
            <div style={{display:'flex',gap:'.35rem',alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
              <span className="badge badge-b">ID: {s.id}</span>
              <button className="btn btn-sm" onClick={() => nav(PG.BACKTEST, { screen_id: String(s.id), screen_name: s.name, sourcePage: 'screens_mgr' })}>Backtest</button>
            </div>
          </div>
          {s.filters && s.filters.length > 0 && <div style={{marginTop:'.5rem',fontSize:'.8rem',color:'var(--text2)'}}>
            {s.filters.map((f, i) => <span key={i} className="badge badge-a" style={{marginRight:'.375rem'}}>{f.metric} {f.op} {f.value}</span>)}
          </div>}
        </div>)}
      </div>}
  </div>;
}

export function AssumptionsMgr() {
  const [sets, setSets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api('/assumptions')
      .then((d) => setSets(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading/>;

  return <div className="card">
    <h3 style={{fontSize:'1rem',marginBottom:'1rem'}}>Assumption Sets</h3>
    {sets.length === 0 ? <div className="empty"><p>No assumption sets defined</p></div>
     : <div style={{display:'grid',gap:'.75rem'}}>
        {sets.map(s => <div key={s.id} className="sc">
          <div style={{fontWeight:600,marginBottom:'.25rem'}}>{s.name} <span className="badge badge-b">v{s.version}</span></div>
          {s.params && <div style={{fontSize:'.8rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
            {Object.entries(s.params).map(([k, v]) => <div key={k}>{k}: {typeof v === 'number' ? v.toFixed(4) : String(v)}</div>)}
          </div>}
        </div>)}
      </div>}
  </div>;
}

export function SourcesPage() {
  const [sources, setSources] = React.useState([]);
  const [metrics, setMetrics] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([api('/sources'), api('/metrics')])
      .then(([s, m]) => {
        setSources(s);
        setMetrics(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading/>;

  return <div>
    <div className="card" style={{marginBottom:'1.5rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Data Sources</h3>
      <STable
        cols={[
          {key:'name',label:'Source'},
          {key:'cadence',label:'Cadence'},
          {key:'url',label:'URL',fmt:v => v ? <span style={{fontSize:'.75rem',color:'var(--accent)'}}>{v}</span> : '--'},
          {key:'notes',label:'Notes',fmt:v => v || '--'},
        ]}
        rows={sources}
      />
    </div>
    <div className="card">
      <h3 style={{fontSize:'1rem',marginBottom:'.75rem'}}>Metric Catalog ({metrics.length} metrics)</h3>
      <div style={{display:'grid',gap:'.5rem'}}>
        {metrics.map(m => <div key={m.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.625rem',background:'var(--bg2)'}}>
          <div><div style={{fontWeight:500,fontSize:'.85rem'}}>{m.label}</div><div style={{fontSize:'.75rem',color:'var(--text2)'}}>{m.description}</div></div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <span className="badge badge-b">{m.unit || '--'}</span>
            {m.category && <span className="badge badge-a" style={{marginLeft:'.375rem'}}>{m.category}</span>}
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}
