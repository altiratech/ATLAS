import { ACTIVE_ASSUMPTION_SET_KEY, ACTIVE_PLAYBOOK_KEY, ACTIVE_THESIS_KEY, PG, PLAYBOOK_KEYS } from './config.js';
import {
  toast,
} from './formatting.js';
import {
  api,
  bootstrapAuth,
  clearAuthState,
  logoutAuth,
} from './auth.js';
import { AccessGate, ErrBox, Loading } from './shared/system.jsx';
import { AppShell } from './app/shell.jsx';
import { Backtest, Comparison, Watchlist } from './features/analysis-pages.jsx';
import { CountyPage } from './features/county-page.jsx';
import { Dashboard } from './features/dashboard.jsx';
import { AssumptionsMgr, ScreensMgr, SourcesPage } from './features/admin-pages.jsx';
import { PortfolioPage } from './features/portfolio-page.jsx';
import { ResearchWorkspace } from './features/research-workspace.jsx';
import { ScenarioLab } from './features/scenario-lab.jsx';
import { Screener } from './features/screener.jsx';
import { AboutPage, AtlasHomePage, MissionPage } from './features/start-pages.jsx';
import { getPlaybook } from './shared/playbooks.js';
import { getDefaultThesisLensKey, getThesisLens, getThesisLensesForPlaybook } from './shared/thesis-lenses.js';

function App() {
  const [pg, setPg] = React.useState(PG.HOME);
  const [pp, setPp] = React.useState({});
  const [toasts, setToasts] = React.useState([]);
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const [legacyRedirectNote, setLegacyRedirectNote] = React.useState(false);
  const [authReady, setAuthReady] = React.useState(false);
  const [authState, setAuthState] = React.useState(null);
  const [authErr, setAuthErr] = React.useState('');
  const [authRequiresLogin, setAuthRequiresLogin] = React.useState(false);
  const [assumptionSets, setAssumptionSets] = React.useState([]);
  const [activeAssumptionSetId, setActiveAssumptionSetId] = React.useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_ASSUMPTION_SET_KEY) || '';
    } catch {
      return '';
    }
  });
  const [activePlaybookKey, setActivePlaybookKey] = React.useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_PLAYBOOK_KEY) || PLAYBOOK_KEYS.FARMLAND_INCOME;
    } catch {
      return PLAYBOOK_KEYS.FARMLAND_INCOME;
    }
  });
  const [activeThesisKey, setActiveThesisKey] = React.useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_THESIS_KEY) || getDefaultThesisLensKey(PLAYBOOK_KEYS.FARMLAND_INCOME);
    } catch {
      return getDefaultThesisLensKey(PLAYBOOK_KEYS.FARMLAND_INCOME);
    }
  });

  const runAuthBootstrap = React.useCallback(async (force = false) => {
    setAuthReady(false);
    setAuthErr('');
    setAuthRequiresLogin(false);
    try {
      const data = await bootstrapAuth(force);
      setAuthState(data || null);
      return data;
    } catch (e) {
      setAuthState(null);
      if (e?.authRequired) {
        setAuthRequiresLogin(true);
      } else {
        setAuthErr(e?.message || 'Authentication bootstrap failed');
      }
      throw e;
    } finally {
      setAuthReady(true);
    }
  }, []);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('legacy_redirect') !== '1') return;
    setLegacyRedirectNote(true);
    url.searchParams.delete('legacy_redirect');
    const q = url.searchParams.toString();
    const cleaned = `${url.pathname}${q ? `?${q}` : ''}${url.hash || ''}`;
    window.history.replaceState({}, '', cleaned);
  }, []);

  React.useEffect(() => {
    const h = e => { if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setCmdOpen(o=>!o);} };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  }, []);

  React.useEffect(() => {
    if (toasts.length===0) return;
    const t = setTimeout(()=>setToasts(ts=>ts.slice(1)), toasts[0].dur);
    return ()=>clearTimeout(t);
  }, [toasts]);

  React.useEffect(() => {
    runAuthBootstrap().catch(() => {});
  }, [runAuthBootstrap]);

  const reloadAssumptionSets = React.useCallback(async () => {
    const sets = await api('/assumptions');
    setAssumptionSets(sets);
    const activeExists = sets.some((set) => String(set.id) === String(activeAssumptionSetId));
    if (activeExists) return sets;
    const defaultSet = sets.find((set) => set.name === 'Default') || sets[0] || null;
    if (defaultSet) {
      setActiveAssumptionSetId(String(defaultSet.id));
    }
    return sets;
  }, [activeAssumptionSetId]);

  React.useEffect(() => {
    if (!authReady || authRequiresLogin || authErr) return;
    reloadAssumptionSets().catch(() => {});
  }, [authReady, authErr, authRequiresLogin, reloadAssumptionSets]);

  React.useEffect(() => {
    try {
      if (activeAssumptionSetId) window.localStorage.setItem(ACTIVE_ASSUMPTION_SET_KEY, String(activeAssumptionSetId));
    } catch {}
  }, [activeAssumptionSetId]);
  React.useEffect(() => {
    try {
      if (activePlaybookKey) window.localStorage.setItem(ACTIVE_PLAYBOOK_KEY, String(activePlaybookKey));
    } catch {}
  }, [activePlaybookKey]);
  React.useEffect(() => {
    try {
      if (activeThesisKey) window.localStorage.setItem(ACTIVE_THESIS_KEY, String(activeThesisKey));
    } catch {}
  }, [activeThesisKey]);

  React.useEffect(() => {
    const available = getThesisLensesForPlaybook(activePlaybookKey);
    if (!available.some((lens) => lens.key === activeThesisKey)) {
      setActiveThesisKey(getDefaultThesisLensKey(activePlaybookKey));
    }
  }, [activePlaybookKey, activeThesisKey]);

  const addToast = t => setToasts(ts=>[...ts,t]);
  const nav = (p,params={}) => {
    if (params?.playbookKey) setActivePlaybookKey(params.playbookKey);
    if (params?.thesisKey) setActiveThesisKey(params.thesisKey);
    setPg(p);
    setPp(params);
    setCmdOpen(false);
  };
  const researchUser = authState?.user_key || '';
  const authSource = authState?.source || '--';
  const activeAssumptionSet = assumptionSets.find((set) => String(set.id) === String(activeAssumptionSetId)) || null;
  const activePlaybook = getPlaybook(activePlaybookKey);
  const activeThesis = getThesisLens(activeThesisKey, activePlaybookKey);
  const assumptionProps = {
    assumptionSets,
    activeAssumptionSetId,
    activeAssumptionSet,
    setActiveAssumptionSetId,
    reloadAssumptionSets,
  };
  const playbookProps = {
    activePlaybookKey,
    activePlaybook,
    setActivePlaybookKey,
  };
  const thesisProps = {
    activeThesisKey,
    activeThesis,
    setActiveThesisKey,
  };

  const resetSession = async () => {
    await logoutAuth();
    try {
      await runAuthBootstrap(true);
      addToast(toast('Session reset', 'ok'));
    } catch {
      addToast(toast('Session reset failed', 'err'));
    }
  };

  const render = () => {
    if (!authReady) return <Loading/>;
    if (authRequiresLogin) return (
      <AccessGate onRetry={() => { clearAuthState(); runAuthBootstrap(true).catch(() => {}); }} />
    );
    if (authErr) return (
      <ErrBox
        title="Authentication Error"
        msg={`${authErr}. Retry to continue.`}
        onRetry={() => runAuthBootstrap(true).catch(() => {})}
      />
    );
    switch(pg) {
      case PG.HOME: return <AtlasHomePage nav={nav} researchUser={researchUser} {...playbookProps} {...thesisProps}/>;
      case PG.MISSION: return <MissionPage nav={nav} {...playbookProps} {...thesisProps}/>;
      case PG.ABOUT: return <AboutPage/>;
      case PG.RESEARCH: return <ResearchWorkspace addToast={addToast} nav={nav} params={pp} researchUser={researchUser} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.DASH: return <Dashboard addToast={addToast} nav={nav} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.SCREEN: return <Screener addToast={addToast} nav={nav} params={pp} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.COUNTY: return <CountyPage addToast={addToast} params={pp} nav={nav} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.WATCH: return <Watchlist addToast={addToast} nav={nav}/>;
      case PG.COMPARE: return <Comparison addToast={addToast} params={pp} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.SCENARIO: return <ScenarioLab addToast={addToast} nav={nav} params={pp} researchUser={researchUser} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.BACKTEST: return <Backtest addToast={addToast} nav={nav} params={pp} {...assumptionProps}/>;
      case PG.PORTFOLIO: return <PortfolioPage addToast={addToast} nav={nav} {...assumptionProps} {...playbookProps} {...thesisProps}/>;
      case PG.SCREENS_MGR: return <ScreensMgr addToast={addToast} nav={nav} params={pp} {...playbookProps} {...thesisProps}/>;
      case PG.ASSUME: return <AssumptionsMgr addToast={addToast} nav={nav} {...assumptionProps}/>;
      case PG.SOURCES: return <SourcesPage addToast={addToast}/>;
      default: return <AtlasHomePage nav={nav} researchUser={researchUser} {...playbookProps} {...thesisProps}/>;
    }
  };

  return <AppShell
    currentPage={pg}
    nav={nav}
    content={render()}
    authSource={authSource}
    researchUser={researchUser}
    activePlaybook={activePlaybook}
    activeThesis={activeThesis}
    authReady={authReady}
    resetSession={resetSession}
    legacyRedirectNote={legacyRedirectNote}
    dismissLegacy={() => setLegacyRedirectNote(false)}
    cmdOpen={cmdOpen}
    setCmdOpen={setCmdOpen}
    toasts={toasts}
    dismissToast={(id) => setToasts(ts => ts.filter(x => x.id !== id))}
  />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
