import { api } from '../auth.js';

export function Spark({data, color='#22d3ee'}) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((d,i) => `${(i/(data.length-1))*100},${100-((d-mn)/rng)*100}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none">
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export function MiniBar({items, height=120}) {
  if (!items || items.length === 0) return null;
  const mx = Math.max(...items.map(d => Math.abs(d.value)));
  return <div style={{display:'flex',alignItems:'flex-end',gap:'.375rem',height:`${height}px`,margin:'1rem 0'}}>
    {items.map((it,i) => <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
      <div style={{width:'100%',background:'var(--accent)',minHeight:'3px',height:`${(Math.abs(it.value)/mx)*100}%`,transition:'height .3s'}} title={`${it.label}: ${it.value}`}></div>
      <div style={{fontSize:'.65rem',marginTop:'.375rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace",textAlign:'center'}}>{it.label}</div>
    </div>)}
  </div>;
}

export function LineChart({series, color='var(--accent)', title, unitFormatter}) {
  const clean = (series || []).filter(p => p && p.value != null);
  if (clean.length < 2) return <div className="empty"><p>No chart data</p></div>;
  const values = clean.map(p => Number(p.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 640;
  const height = 180;
  const padding = 24;
  const points = clean.map((p, idx) => {
    const x = padding + (idx / (clean.length - 1)) * (width - padding * 2);
    const y = padding + ((max - Number(p.value)) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return <div style={{border:'1px solid var(--line)',background:'var(--bg1)',padding:'.65rem'}}>
    {title && <div style={{fontSize:'.72rem',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.14em',marginBottom:'.4rem'}}>{title}</div>}
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%',height:'170px',display:'block'}}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:'.68rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>
      <span>{clean[0]?.year || '--'}</span>
      <span>
        {unitFormatter ? unitFormatter(min) : min} - {unitFormatter ? unitFormatter(max) : max}
      </span>
      <span>{clean[clean.length - 1]?.year || '--'}</span>
    </div>
  </div>;
}

function resolveRowKey(row, index, rowKey) {
  if (typeof rowKey === 'function') return rowKey(row, index);
  if (typeof rowKey === 'string') {
    const keyed = row?.[rowKey];
    if (keyed != null) return String(keyed);
  }
  if (row?.geo_key != null) return String(row.geo_key);
  if (row?.fips != null) return String(row.fips);
  if (row?.id != null) return String(row.id);
  return String(index);
}

export function STable({cols, rows, onRow, initSort, stickyHeader=false, rowKey}) {
  const [sort, setSort] = React.useState(initSort || null);
  const sorted = React.useMemo(() => {
    if (!sort || !rows) return rows || [];
    const [k, dir] = sort;
    return [...rows].sort((a,b) => {
      const av = a[k], bv = b[k];
      if (av == null) return 1; if (bv == null) return -1;
      return dir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
  }, [rows, sort]);
  const toggle = (col) => {
    if (col.sortable === false) return;
    const k = col.key;
    setSort(sort && sort[0]===k ? [k, sort[1]==='asc'?'desc':'asc'] : [k,'desc']);
  };
  return <div className={`tc${stickyHeader ? ' tc-sticky' : ''}`}><table>
    <thead><tr>{cols.map(c => {
      const sortClass = c.sortable === false ? '' : (sort && sort[0]===c.key ? (sort[1]==='asc' ? 's-a' : 's-d') : '');
      const classes = [sortClass, c.num ? 'n' : ''].filter(Boolean).join(' ');
      return <th key={c.key} onClick={()=>toggle(c)} className={classes}>{c.label}</th>;
    })}</tr></thead>
    <tbody>{sorted.map((r,i) => <tr key={resolveRowKey(r, i, rowKey)} onClick={()=>onRow&&onRow(r)}>{cols.map(c => <td key={c.key} className={c.num?'n':''}>{c.fmt ? c.fmt(r[c.key],r) : r[c.key]}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function CountyPicker({value, onChange, placeholder='Select county...', selectedLabel=''}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [list, setList] = React.useState([]);
  const [ld, setLd] = React.useState(false);
  React.useEffect(() => {
    if (open && list.length === 0) {
      setLd(true);
      api('/counties').then(d => setList(d)).catch(()=>{}).finally(()=>setLd(false));
    }
  }, [open]);
  const filtered = list.filter(c => `${c.name} ${c.state} ${c.fips}`.toLowerCase().includes(q.toLowerCase()));
  const sel = list.find(c => c.fips === value);
  return <div className="dd">
    <button className="btn" onClick={()=>setOpen(!open)} style={{width:'100%',textAlign:'left'}}>
      {sel ? `${sel.name}, ${sel.state}` : (selectedLabel || placeholder)}
    </button>
    {open && <div className="dd-menu">
      <div style={{padding:'.5rem'}}><input type="text" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)} onClick={e=>e.stopPropagation()} style={{fontSize:'.85rem'}}/></div>
      {ld ? <div style={{padding:'.75rem',textAlign:'center',color:'var(--text2)',fontSize:'.85rem'}}>Loading...</div>
       : filtered.length === 0 ? <div style={{padding:'.75rem',textAlign:'center',color:'var(--text2)',fontSize:'.85rem'}}>No results</div>
       : filtered.slice(0,60).map(c => <div key={c.fips} className="dd-item" onClick={()=>{onChange(c.fips);setOpen(false);setQ('');}}>
          <span style={{color:'var(--text1)'}}>{c.name}</span>, <span style={{color:'var(--text2)'}}>{c.state}</span>
          <span style={{float:'right',fontSize:'.7rem',color:'var(--text2)',fontFamily:"'IBM Plex Mono',monospace"}}>{c.fips}</span>
        </div>)}
    </div>}
  </div>;
}
