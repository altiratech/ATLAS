import { api } from '../auth.js';
import { $, $$, $int, $pct } from '../formatting.js';

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

function nextSortState(currentSort, sortKey) {
  if (currentSort?.key === sortKey) {
    return { key: sortKey, dir: currentSort.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: sortKey, dir: 'desc' };
}

function moveKey(order, key, direction) {
  const current = [...order];
  const index = current.indexOf(key);
  if (index < 0) return current;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= current.length) return current;
  const [item] = current.splice(index, 1);
  current.splice(target, 0, item);
  return current;
}

function resolveOrderedColumns(columns, viewConfig) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const orderedKeys = Array.isArray(viewConfig?.columnOrder) ? viewConfig.columnOrder : [];
  const orderedColumns = [];
  for (const key of orderedKeys) {
    const column = byKey.get(key);
    if (column) {
      orderedColumns.push(column);
      byKey.delete(key);
    }
  }
  for (const column of columns) {
    if (byKey.has(column.key)) {
      orderedColumns.push(column);
      byKey.delete(column.key);
    }
  }
  return orderedColumns;
}

function resolveVisibleColumns(columns, viewConfig) {
  const visibleKeys = Array.isArray(viewConfig?.visibleColumns) && viewConfig.visibleColumns.length
    ? new Set(viewConfig.visibleColumns)
    : new Set(columns.filter((column) => column.defaultVisible !== false).map((column) => column.key));
  const visibleColumns = columns.filter((column) => visibleKeys.has(column.key));
  return visibleColumns.length > 0 ? visibleColumns : columns.slice(0, 1);
}

function formatAggregateValue(column, value) {
  if (value == null || Number.isNaN(value)) return '--';
  if (column.aggregateFormatter) return column.aggregateFormatter(value);
  if (column.type === 'currency') return $$(value);
  if (column.type === 'percent') return $pct(value);
  if (column.type === 'number') return $(value, 1);
  if (column.type === 'integer') return $int(value);
  return String(value);
}

function computeAggregate(rows, column) {
  const values = rows
    .map((row) => row?.[column.key])
    .filter((value) => value != null && Number.isFinite(Number(value)))
    .map(Number);
  if (column.aggregateFn === 'count') return rows.length;
  if (values.length === 0) return null;
  if (column.aggregateFn === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (column.aggregateFn === 'min') return Math.min(...values);
  if (column.aggregateFn === 'max') return Math.max(...values);
  if (column.aggregateFn === 'weightedAvg' && column.aggregateWeightKey) {
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
      const value = Number(row?.[column.key]);
      const weight = Number(row?.[column.aggregateWeightKey]);
      if (Number.isFinite(value) && Number.isFinite(weight) && weight > 0) {
        numerator += value * weight;
        denominator += weight;
      }
    }
    return denominator > 0 ? numerator / denominator : null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupRows(rows, groupBy) {
  if (!groupBy) return [{ key: '__all__', label: null, rows }];
  const groups = new Map();
  for (const row of rows) {
    const rawValue = row?.[groupBy];
    const key = rawValue == null || rawValue === '' ? '__empty__' : String(rawValue);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([key, groupRowsValue]) => ({
    key,
    label: key === '__empty__' ? 'Unspecified' : key,
    rows: groupRowsValue,
  }));
}

export function DataGrid({
  columns,
  rows,
  rowKey,
  stickyHeader = false,
  viewConfig,
  onViewChange,
  sort,
  onSortChange,
  rowColorFn,
  renderRecordPanel,
  rowColorOptions = [],
  emptyMessage = 'No records found.',
}) {
  const [localSort, setLocalSort] = React.useState(sort || null);
  const [showColumnsPanel, setShowColumnsPanel] = React.useState(false);
  const [expandedRow, setExpandedRow] = React.useState(null);
  const [collapsedGroups, setCollapsedGroups] = React.useState({});

  React.useEffect(() => {
    if (sort) setLocalSort(sort);
  }, [sort]);

  const orderedColumns = React.useMemo(
    () => resolveOrderedColumns(columns, viewConfig),
    [columns, viewConfig],
  );
  const visibleColumns = React.useMemo(
    () => resolveVisibleColumns(orderedColumns, viewConfig),
    [orderedColumns, viewConfig],
  );
  const visibleColumnKeys = React.useMemo(
    () => visibleColumns.map((column) => column.key),
    [visibleColumns],
  );
  const currentSort = sort || localSort;
  const dataRows = React.useMemo(() => {
    if (onSortChange || !currentSort?.key) return rows || [];
    return [...(rows || [])].sort((a, b) => {
      const av = a?.[currentSort.key];
      const bv = b?.[currentSort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return 0;
      return currentSort.dir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
  }, [currentSort, onSortChange, rows]);
  const groupedRows = React.useMemo(
    () => groupRows(dataRows, viewConfig?.groupBy || ''),
    [dataRows, viewConfig?.groupBy],
  );
  const columnDomains = React.useMemo(() => {
    const groups = new Map();
    for (const column of orderedColumns) {
      const domain = column.domain || 'Other';
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(column);
    }
    return Array.from(groups.entries());
  }, [orderedColumns]);
  const groupableColumns = React.useMemo(
    () => orderedColumns.filter((column) => column.groupable),
    [orderedColumns],
  );

  const updateViewConfig = (patch) => {
    onViewChange?.({ ...(viewConfig || {}), ...patch });
  };

  const toggleColumn = (key) => {
    const currentVisibleKeys = [...visibleColumnKeys];
    const nextVisibleKeys = currentVisibleKeys.includes(key)
      ? currentVisibleKeys.filter((value) => value !== key)
      : [...currentVisibleKeys, key];
    if (nextVisibleKeys.length === 0) return;
    const orderedKeys = orderedColumns.map((column) => column.key);
    updateViewConfig({
      visibleColumns: orderedKeys.filter((orderedKey) => nextVisibleKeys.includes(orderedKey)),
    });
  };

  const reorderColumn = (key, direction) => {
    const baseOrder = orderedColumns.map((column) => column.key);
    updateViewConfig({ columnOrder: moveKey(baseOrder, key, direction) });
  };

  const toggleSort = (column) => {
    if (column.sortable === false) return;
    const sortKey = column.sortKey || column.key;
    const nextSort = nextSortState(currentSort, sortKey);
    if (onSortChange) {
      onSortChange(nextSort);
      return;
    }
    setLocalSort(nextSort);
  };

  const renderCell = (column, row) => {
    if (column.renderCell) return column.renderCell(row?.[column.key], row);
    if (column.fmt) return column.fmt(row?.[column.key], row);
    return row?.[column.key];
  };

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.55rem' }}>
      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="badge badge-b">GRID</span>
        <span className="badge badge-a">{dataRows.length} ROWS</span>
        <span className="badge badge-a">{visibleColumns.length} COLS</span>
        {viewConfig?.groupBy && <span className="badge badge-g">GROUP {orderedColumns.find((column) => column.key === viewConfig.groupBy)?.label || viewConfig.groupBy}</span>}
      </div>
      <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {groupableColumns.length > 0 && <div className="fg" style={{ margin: 0, minWidth: '170px' }}>
          <label>Group By</label>
          <select value={viewConfig?.groupBy || ''} onChange={(e) => updateViewConfig({ groupBy: e.target.value })}>
            <option value="">None</option>
            {groupableColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
        </div>}
        {rowColorOptions.length > 0 && <div className="fg" style={{ margin: 0, minWidth: '170px' }}>
          <label>Row Coloring</label>
          <select value={viewConfig?.rowColoring || 'none'} onChange={(e) => updateViewConfig({ rowColoring: e.target.value })}>
            {rowColorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>}
        <button className="btn btn-sm" onClick={() => setShowColumnsPanel((current) => !current)}>{showColumnsPanel ? 'Hide Columns' : 'Columns'}</button>
      </div>
    </div>

    {showColumnsPanel && <div style={{ border: '1px solid var(--line)', background: 'var(--bg1)', padding: '.75rem', marginBottom: '.65rem' }}>
      <div style={{ fontSize: '.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '.6rem' }}>Column Configuration</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
        {columnDomains.map(([domain, domainColumns]) => <div key={domain} className="sc" style={{ margin: 0 }}>
          <div className="sc-l">{domain}</div>
          <div style={{ display: 'grid', gap: '.38rem' }}>
            {domainColumns.map((column) => {
              const visible = visibleColumnKeys.includes(column.key);
              return <div key={column.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.5rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', margin: 0, color: 'var(--text1)', fontSize: '.74rem', textTransform: 'none', letterSpacing: 'normal', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleColumn(column.key)}
                    style={{ width: 'auto' }}
                  />
                  <span>{column.label}</span>
                </label>
                <div style={{ display: 'flex', gap: '.2rem' }}>
                  <button className="btn btn-sm" onClick={() => reorderColumn(column.key, 'up')} title={`Move ${column.label} up`}>↑</button>
                  <button className="btn btn-sm" onClick={() => reorderColumn(column.key, 'down')} title={`Move ${column.label} down`}>↓</button>
                </div>
              </div>;
            })}
          </div>
        </div>)}
      </div>
    </div>}

    <div className={`tc${stickyHeader ? ' tc-sticky' : ''}`}><table>
      <thead><tr>{visibleColumns.map((column) => {
        const sortClass = column.sortable === false
          ? ''
          : (currentSort?.key === (column.sortKey || column.key)
            ? (currentSort?.dir === 'asc' ? 's-a' : 's-d')
            : '');
        const classes = [sortClass, column.num ? 'n' : ''].filter(Boolean).join(' ');
        return <th key={column.key} onClick={() => toggleSort(column)} className={classes}>{column.label}</th>;
      })}</tr></thead>
      <tbody>
        {dataRows.length === 0 && <tr><td colSpan={visibleColumns.length || 1} style={{ padding: '.75rem', color: 'var(--text2)' }}>{emptyMessage}</td></tr>}
        {groupedRows.map((group) => {
          const groupLabelColumn = orderedColumns.find((column) => column.key === (viewConfig?.groupBy || ''));
          const groupLabel = groupLabelColumn?.groupLabel ? groupLabelColumn.groupLabel(group.label) : group.label;
          const isCollapsed = !!collapsedGroups[group.key];
          const aggregateColumns = visibleColumns.filter((column) => column.aggregateFn).slice(0, 4);
          return <React.Fragment key={group.key}>
            {viewConfig?.groupBy && <tr>
              <td colSpan={visibleColumns.length || 1} style={{ background: 'var(--bg1)', borderBottom: '1px solid var(--line)', padding: '.42rem .48rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => setCollapsedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                    style={{ fontWeight: 600 }}
                  >
                    {isCollapsed ? '▸' : '▾'} {groupLabel} <span style={{ color: 'var(--text2)', marginLeft: '.35rem' }}>({group.rows.length})</span>
                  </button>
                  {aggregateColumns.length > 0 && <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    {aggregateColumns.map((column) => <span key={column.key} className="badge badge-a">
                      {column.label} {formatAggregateValue(column, computeAggregate(group.rows, column))}
                    </span>)}
                  </div>}
                </div>
              </td>
            </tr>}
            {!isCollapsed && group.rows.map((row, index) => {
              const accent = rowColorFn?.(row) || null;
              return <tr
                key={resolveRowKey(row, index, rowKey)}
                onClick={() => {
                  if (renderRecordPanel) setExpandedRow(row);
                }}
              >
                {visibleColumns.map((column, columnIndex) => <td
                  key={column.key}
                  className={column.num ? 'n' : ''}
                  style={columnIndex === 0 && accent ? { borderLeft: `3px solid ${accent}` } : undefined}
                >
                  {renderCell(column, row)}
                </td>)}
              </tr>;
            })}
          </React.Fragment>;
        })}
      </tbody>
    </table></div>

    {expandedRow && renderRecordPanel && <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
      onClick={() => setExpandedRow(null)}
    >
      <div
        style={{ width: 'min(640px, 46vw)', minWidth: '360px', height: '100%', background: 'var(--bg0)', borderLeft: '1px solid var(--line-strong)', overflowY: 'auto', padding: '1rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem' }}>
          <div style={{ fontSize: '.74rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>Record Panel</div>
          <button className="btn btn-sm" onClick={() => setExpandedRow(null)}>Close</button>
        </div>
        {renderRecordPanel(expandedRow, () => setExpandedRow(null))}
      </div>
    </div>}
  </div>;
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
