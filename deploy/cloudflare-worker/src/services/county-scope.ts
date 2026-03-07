export interface CountyScopeRow {
  fips?: string | null;
  name?: string | null;
}

function normalizeName(name?: string | null): string {
  return (name ?? '').trim().toUpperCase();
}

function isAggregateCountyFips(fips?: string | null): boolean {
  const normalized = (fips ?? '').trim();
  return /^\d{2}(998|999)$/.test(normalized);
}

export function isAnalyticCountyRow<T extends CountyScopeRow>(county: T): boolean {
  const name = normalizeName(county.name);
  if (!county?.fips) return false;
  if (isAggregateCountyFips(county.fips)) return false;
  if (!name) return false;
  if (name.includes('OTHER COUNTIES')) return false;
  if (name.includes('OTHER (COMBINED) COUNTIES')) return false;
  return true;
}

export function filterAnalyticCountyRows<T extends CountyScopeRow>(counties: T[]): T[] {
  return counties.filter(isAnalyticCountyRow);
}
