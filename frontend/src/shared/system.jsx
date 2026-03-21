export function Loading() {
  return <div className="ld"><div className="sp"></div><span>Loading data...</span></div>;
}

export function ErrBox({title, msg, onRetry}) {
  return <div className="err-box">
    <div style={{fontWeight:600,marginBottom:'.375rem'}}>{title||'Error'}</div>
    <div style={{fontSize:'.85rem'}}>{msg||'Something went wrong'}</div>
    {onRetry && <button className="btn btn-sm" style={{marginTop:'.625rem'}} onClick={onRetry}>Retry</button>}
  </div>;
}

export function ActionEmptyState({ title, body, detail, actions = [] }) {
  return <div className="empty" style={{ alignItems:'flex-start', textAlign:'left', border:'1px solid var(--line)', background:'var(--bg1)' }}>
    <div style={{ width:'100%' }}>
      <div style={{ fontSize:'.78rem', letterSpacing:'.12em', textTransform:'uppercase', color:'var(--text3)', marginBottom:'.4rem' }}>
        {title}
      </div>
      <div style={{ fontSize:'.88rem', color:'var(--text1)', lineHeight:1.55, marginBottom:'.35rem' }}>
        {body}
      </div>
      {detail && <div style={{ fontSize:'.78rem', color:'var(--text2)', lineHeight:1.55, marginBottom:'.8rem' }}>
        {detail}
      </div>}
      {actions.length > 0 && <div style={{ display:'flex', gap:'.45rem', flexWrap:'wrap' }}>
        {actions.map((action) => <button
          key={action.label}
          className={`btn btn-sm ${action.primary ? 'btn-p' : ''}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>)}
      </div>}
    </div>
  </div>;
}

export function AccessGate({onRetry}) {
  return <div style={{
    display:'flex', alignItems:'center', justifyContent:'center',
    width:'100%', height:'100vh',
    background:'var(--bg0)',
    backgroundImage:'radial-gradient(circle at 10% -10%, rgba(255,177,0,.07), transparent 45%), repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 12px), linear-gradient(180deg, var(--bg1), var(--bg0))',
  }}>
    <div style={{
      maxWidth:'460px', width:'90%', textAlign:'center',
    }}>
      <div style={{
        fontFamily:"'IBM Plex Mono',monospace",
        fontSize:'1.1rem', fontWeight:700,
        color:'var(--accent)',
        letterSpacing:'.16em',
        textTransform:'uppercase',
        marginBottom:'1.5rem',
      }}>ALTIRA ATLAS</div>
      <div style={{
        border:'1px solid var(--line-strong)',
        background:'rgba(6,8,10,.94)',
        padding:'2rem 1.75rem',
      }}>
        <div style={{
          fontSize:'.72rem', fontWeight:600,
          textTransform:'uppercase', letterSpacing:'.18em',
          color:'var(--text3)', marginBottom:'1.25rem',
        }}>ACCESS REQUIRED</div>
        <div style={{
          fontSize:'.88rem', color:'var(--text2)',
          lineHeight:'1.55', marginBottom:'1.5rem',
        }}>
          Altira Atlas is an agriculture intelligence platform for institutional investors, farmland funds, and ag lenders. Access is restricted to authorized users.
        </div>
        <div style={{
          fontSize:'.78rem', color:'var(--text3)',
          lineHeight:'1.5', marginBottom:'1.75rem',
          borderTop:'1px solid var(--line)', paddingTop:'1rem',
        }}>
          If you have been granted access through your organization, your credentials will be verified automatically. If you believe you should have access, contact your administrator.
        </div>
        <button className="btn" style={{
          width:'100%', padding:'.6rem 1rem',
          fontWeight:600, letterSpacing:'.06em',
        }} onClick={onRetry}>
          RETRY AUTHENTICATION
        </button>
      </div>
      <div style={{
        marginTop:'1.25rem',
        fontSize:'.68rem', color:'var(--text3)',
        letterSpacing:'.04em',
      }}>
        atlas.altiratech.com
      </div>
    </div>
  </div>;
}
