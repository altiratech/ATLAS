export function readStoredGridViewState(storageKey, getDefaultState) {
  const fallback = getDefaultState();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      ...fallback,
      visibleColumns: Array.isArray(parsed.visibleColumns) && parsed.visibleColumns.length
        ? parsed.visibleColumns
        : fallback.visibleColumns,
      columnOrder: Array.isArray(parsed.columnOrder) && parsed.columnOrder.length
        ? parsed.columnOrder
        : null,
      groupBy: typeof parsed.groupBy === 'string' ? parsed.groupBy : fallback.groupBy || '',
      rowColoring: typeof parsed.rowColoring === 'string' && parsed.rowColoring
        ? parsed.rowColoring
        : fallback.rowColoring || 'none',
    };
  } catch {
    return fallback;
  }
}

export function persistGridViewState(storageKey, viewState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      visibleColumns: Array.isArray(viewState?.visibleColumns) ? viewState.visibleColumns : [],
      columnOrder: Array.isArray(viewState?.columnOrder) ? viewState.columnOrder : null,
      groupBy: typeof viewState?.groupBy === 'string' ? viewState.groupBy : '',
      rowColoring: typeof viewState?.rowColoring === 'string' ? viewState.rowColoring : 'none',
    }));
  } catch {}
}
