import { PG } from '../config.js';
import { api } from '../auth.js';
import {
  AssumptionContextBar,
  buildVersionedAssumptionParams,
  STORED_ONLY_ASSUMPTION_FIELDS,
  WIRED_ASSUMPTION_FIELDS,
  assumptionSetLabel,
} from '../shared/assumptions-ui.jsx';
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

export function AssumptionsMgr({ addToast, nav, assumptionSets, activeAssumptionSetId, activeAssumptionSet, setActiveAssumptionSetId, reloadAssumptionSets }) {
  const [loading, setLoading] = React.useState(assumptionSets.length === 0);
  const [editorBaseId, setEditorBaseId] = React.useState('');
  const [draftName, setDraftName] = React.useState('');
  const [draftValues, setDraftValues] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (assumptionSets.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    reloadAssumptionSets?.().catch(() => {}).finally(() => setLoading(false));
  }, [assumptionSets.length, reloadAssumptionSets]);

  const baseSet = React.useMemo(
    () => assumptionSets.find((set) => String(set.id) === String(editorBaseId)) || null,
    [assumptionSets, editorBaseId],
  );

  const openEditor = (set) => {
    setEditorBaseId(String(set.id));
    setDraftName(set.name);
    setDraftValues(
      Object.fromEntries(
        WIRED_ASSUMPTION_FIELDS.map((field) => [field.key, set.params?.[field.key] ?? ''])
      )
    );
  };

  const saveVersion = async () => {
    if (!baseSet) return;
    setSaving(true);
    try {
      const created = await api('/assumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName.trim() || baseSet.name,
          params: buildVersionedAssumptionParams(baseSet.params, draftValues),
        }),
      });
      await reloadAssumptionSets?.();
      setActiveAssumptionSetId(String(created.id));
      addToast?.({ id: Date.now() + Math.random(), msg: `Saved ${created.name} v${created.version}`, type: 'ok', dur: 3000 });
      setEditorBaseId('');
    } catch (e) {
      addToast?.({ id: Date.now() + Math.random(), msg: 'Failed to save assumption version', type: 'err', dur: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const applyAndNav = (setId, page, params = {}) => {
    setActiveAssumptionSetId(String(setId));
    nav?.(page, params);
  };

  if (loading) return <Loading/>;

  return <div>
    <AssumptionContextBar
      assumptionSets={assumptionSets}
      activeAssumptionSetId={activeAssumptionSetId}
      activeAssumptionSet={activeAssumptionSet}
      onChange={setActiveAssumptionSetId}
      title="Active Global Assumption Set"
      description="Dashboard, Screener, County Detail, Compare, Backtest, and Scenario Lab all use this active saved set unless Scenario Lab applies temporary overrides."
    />

    <div className="card" style={{marginBottom:'1rem'}}>
      <h3 style={{fontSize:'1rem',marginBottom:'.65rem'}}>What These Sets Actually Drive</h3>
      <div style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.7rem'}}>
        These saved sets are real model inputs. They affect fair value, required return, NOI, break-even rent, DSCR, sensitivity analysis, dashboard rankings, screener outputs, compare results, and backtests.
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Wired Now</div>
          <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',marginTop:'.5rem'}}>
            {WIRED_ASSUMPTION_FIELDS.map((field) => <span key={field.key} className="badge badge-g">{field.label}</span>)}
          </div>
        </div>
        <div className="sc" style={{margin:0}}>
          <div className="sc-l">Stored, Not Yet Wired</div>
          <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',marginTop:'.5rem'}}>
            {STORED_ONLY_ASSUMPTION_FIELDS.map((field) => <span key={field.key} className="badge badge-a">{field.label}</span>)}
          </div>
        </div>
      </div>
    </div>

    {baseSet && <div className="card" style={{marginBottom:'1rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',marginBottom:'.75rem',flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:'1rem',marginBottom:'.2rem'}}>Versioned Edit</h3>
          <div style={{fontSize:'.78rem',color:'var(--text2)'}}>Editing creates a new version. Existing sets remain immutable for reproducibility.</div>
        </div>
        <span className="badge badge-b">FROM {assumptionSetLabel(baseSet)}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(220px,1fr) 1fr',gap:'.75rem',marginBottom:'.75rem'}}>
        <div className="fg" style={{margin:0}}>
          <label>Version Name</label>
          <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Assumption set name"/>
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text2)',alignSelf:'end'}}>Use the same name to create the next version in that set family, or change the name to fork it into a separate assumption set.</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'.75rem'}}>
        {WIRED_ASSUMPTION_FIELDS.map((field) => <div key={field.key} className="fg" style={{margin:0}}>
          <label>{field.label}</label>
          <input
            type="number"
            step={field.step}
            value={draftValues[field.key] ?? ''}
            onChange={(e) => setDraftValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
          <div style={{fontSize:'.72rem',color:'var(--text2)',marginTop:'.25rem'}}>{field.note}</div>
        </div>)}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',flexWrap:'wrap',marginTop:'.9rem'}}>
        <div style={{fontSize:'.76rem',color:'var(--text2)'}}>Stored-only fields such as base rate series, vacancy, and capex reserve are preserved from the base set but are not editable here until they are wired into the live model.</div>
        <div style={{display:'flex',gap:'.45rem',flexWrap:'wrap'}}>
          <button className="btn btn-sm" onClick={() => setEditorBaseId('')}>Cancel</button>
          <button className="btn btn-sm btn-p" onClick={saveVersion} disabled={saving}>{saving ? 'Saving...' : 'Save New Version'}</button>
        </div>
      </div>
    </div>}

    <div className="card">
      <h3 style={{fontSize:'1rem',marginBottom:'1rem'}}>Assumption Sets</h3>
      {assumptionSets.length === 0 ? <div className="empty"><p>No assumption sets defined</p></div>
       : <div style={{display:'grid',gap:'.75rem'}}>
          {assumptionSets.map(s => {
            const storedOnlyActive = STORED_ONLY_ASSUMPTION_FIELDS.filter((field) => s.params && s.params[field.key] != null);
            return <div key={s.id} className="sc">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'.75rem',flexWrap:'wrap'}}>
                <div>
                  <div style={{fontWeight:600,marginBottom:'.25rem'}}>
                    {s.name} <span className="badge badge-b">v{s.version}</span>
                    {String(activeAssumptionSetId) === String(s.id) && <span className="badge badge-g" style={{marginLeft:'.35rem'}}>ACTIVE</span>}
                  </div>
                  <div style={{fontSize:'.76rem',color:'var(--text2)',marginBottom:'.45rem'}}>Created {s.created_at || '--'} | Wired fields drive modeled outputs across Atlas.</div>
                </div>
                <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap',justifyContent:'flex-end'}}>
                  <button className="btn btn-sm" onClick={() => setActiveAssumptionSetId(String(s.id))}>Use</button>
                  <button className="btn btn-sm" onClick={() => applyAndNav(s.id, PG.DASH)}>Dashboard</button>
                  <button className="btn btn-sm" onClick={() => applyAndNav(s.id, PG.SCREEN)}>Screener</button>
                  <button className="btn btn-sm" onClick={() => applyAndNav(s.id, PG.BACKTEST)}>Backtest</button>
                  <button className="btn btn-sm" onClick={() => applyAndNav(s.id, PG.SCENARIO)}>Scenario</button>
                  <button className="btn btn-sm btn-p" onClick={() => openEditor(s)}>Duplicate / Edit</button>
                </div>
              </div>
              {s.params && <div style={{fontSize:'.8rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
                {Object.entries(s.params).map(([k, v]) => <div key={k}>
                  {k}: {typeof v === 'number' ? v.toFixed(4) : String(v)}
                  {WIRED_ASSUMPTION_FIELDS.some((field) => field.key === k)
                    ? <span className="badge badge-g" style={{marginLeft:'.35rem'}}>WIRED</span>
                    : STORED_ONLY_ASSUMPTION_FIELDS.some((field) => field.key === k)
                      ? <span className="badge badge-a" style={{marginLeft:'.35rem'}}>STORED ONLY</span>
                      : null}
                </div>)}
              </div>}
              {storedOnlyActive.length > 0 && <div style={{fontSize:'.74rem',color:'var(--text2)',marginTop:'.55rem'}}>Stored-only fields present: {storedOnlyActive.map((field) => field.label).join(', ')}.</div>}
            </div>;
          })}
        </div>}
    </div>
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
