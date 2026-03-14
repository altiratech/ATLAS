export const $ = (n, d=2) => n != null ? Number(n).toFixed(d) : 'N/A';
export const $$ = (n) => n != null ? '$' + Number(n).toLocaleString('en-US',{maximumFractionDigits:0}) : 'N/A';
export const $p = (n) => n != null ? (Number(n)*100).toFixed(2) + '%' : 'N/A';
export const $pct = (n) => n != null ? Number(n).toFixed(2) + '%' : 'N/A';
export const $chg = (n) => n != null ? (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%' : '--';
export const $z = (n) => n != null ? Number(n).toFixed(2) + 'σ' : 'N/A';
export const $x = (n) => n != null ? Number(n).toFixed(2) + 'x' : 'N/A';

export function toast(msg, type='info') { return {id: Date.now()+Math.random(), msg, type, dur: 3000}; }
export const parseTags = (raw) => raw.split(',').map(t => t.trim()).filter(Boolean);

export function zBand(stats) {
  const z = stats?.zscore;
  if (z == null) return {label:'N/A', className:'badge-a'};
  if (z <= -0.5) return {label:`CHEAP ${$z(z)}`, className:'badge-g'};
  if (z >= 0.5) return {label:`EXPENSIVE ${$z(z)}`, className:'badge-r'};
  return {label:`NORMAL ${$z(z)}`, className:'badge-a'};
}

export function sourceBand(sourceQuality) {
  switch (sourceQuality) {
    case 'county': return {label:'COUNTY', className:'badge-g'};
    case 'proxy': return {label:'PROXY', className:'badge-b'};
    case 'mixed': return {label:'MIXED', className:'badge-a'};
    case 'state': return {label:'STATE', className:'badge-b'};
    case 'national': return {label:'NATIONAL', className:'badge-r'};
    default: return {label:'UNKNOWN', className:'badge-a'};
  }
}

export function benchmarkMethodBand(method) {
  switch (method) {
    case 'county_observed': return {label:'COUNTY OBS', className:'badge-g'};
    case 'rent_multiple_proxy': return {label:'RENT PROXY', className:'badge-b'};
    case 'mixed_fallback': return {label:'MIXED', className:'badge-a'};
    case 'state_fallback': return {label:'STATE', className:'badge-b'};
    case 'national_fallback': return {label:'NATIONAL', className:'badge-r'};
    default: return {label:'UNKNOWN', className:'badge-a'};
  }
}

export function sourceText(level) {
  switch (level) {
    case 'county': return 'county source';
    case 'state': return 'state fallback';
    case 'national': return 'national fallback';
    default: return 'source unavailable';
  }
}

export function productivityBand(active) {
  if (active === true) return {label:'ACTIVE', className:'badge-g'};
  if (active === false) return {label:'INACTIVE', className:'badge-r'};
  return {label:'UNKNOWN', className:'badge-a'};
}

export function productivitySummaryBand(summary) {
  const pct = summary?.active_pct;
  if (pct == null) return {label:'PROD N/A', className:'badge-a'};
  if (pct >= 70) return {label:`PROD ${Math.round(pct)}% ACTIVE`, className:'badge-g'};
  if (pct >= 30) return {label:`PROD ${Math.round(pct)}% ACTIVE`, className:'badge-a'};
  return {label:`PROD ${Math.round(pct)}% ACTIVE`, className:'badge-r'};
}

export function industrialConfidenceBand(level) {
  switch (level) {
    case 'high': return {label:'HIGH CONFIDENCE', className:'badge-g'};
    case 'medium': return {label:'MEDIUM CONFIDENCE', className:'badge-a'};
    case 'low': return {label:'LOW CONFIDENCE', className:'badge-r'};
    default: return {label:'CONFIDENCE N/A', className:'badge-a'};
  }
}

export function industrialLineageBand(level) {
  switch (level) {
    case 'state': return {label:'STATE PWR', className:'badge-b'};
    case 'national': return {label:'US PWR', className:'badge-a'};
    default: return {label:'NO PWR', className:'badge-r'};
  }
}

export function industrialPowerSummaryBand(summary) {
  const pct = summary?.power_loaded_pct;
  if (pct == null) return {label:'POWER N/A', className:'badge-a'};
  if (pct >= 0.9) return {label:`POWER ${Math.round(pct * 100)}% LOADED`, className:'badge-g'};
  if (pct >= 0.5) return {label:`POWER ${Math.round(pct * 100)}% LOADED`, className:'badge-a'};
  return {label:`POWER ${Math.round(pct * 100)}% LOADED`, className:'badge-r'};
}

export function droughtRiskBand(drought) {
  const score = drought?.risk_score;
  const label = String(drought?.risk_rating_label || '').trim().toLowerCase();
  if (score == null) return {label:'DROUGHT N/A', className:'badge-a'};
  if (label === 'very low') return {label:`VERY LOW ${$(score,0)}`, className:'badge-g'};
  if (label === 'relatively low') return {label:`LOW ${$(score,0)}`, className:'badge-g'};
  if (label === 'relatively moderate') return {label:`MOD ${$(score,0)}`, className:'badge-a'};
  if (label === 'relatively high') return {label:`HIGH ${$(score,0)}`, className:'badge-r'};
  if (label === 'very high') return {label:`VERY HIGH ${$(score,0)}`, className:'badge-r'};
  if (score >= 80) return {label:`HIGH ${$(score,0)}`, className:'badge-r'};
  if (score >= 60) return {label:`MOD ${$(score,0)}`, className:'badge-a'};
  return {label:`LOW ${$(score,0)}`, className:'badge-g'};
}
