import type { D1Database } from '@cloudflare/workers-types';
import type { SeriesLineageLevel, SeriesSnapshot } from '../db/queries';

export type IndustrialUseCase = 'data_center';
export type IndustrialConfidence = 'high' | 'medium' | 'low';
export type IndustrialComponentKey =
  | 'power_readiness'
  | 'water_readiness'
  | 'connectivity_access'
  | 'physical_suitability'
  | 'entitlement_market';
export type IndustrialLineage = SeriesLineageLevel | 'mixed' | 'missing';

interface IndustrialDataSourceDef {
  name: string;
  cadence: string;
  notes: string;
}

interface IndustrialSeriesDef {
  seriesKey: string;
  geoLevels: Array<'county' | 'state' | 'national'>;
  frequency: string;
  unit: string;
  sourceName: string;
  label: string;
  description: string;
}

interface IndustrialEvidenceItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  lineage: IndustrialLineage;
  as_of: string | null;
}

interface IndustrialComponentScore {
  key: IndustrialComponentKey;
  label: string;
  score: number | null;
  lineage: IndustrialLineage;
  status: 'ready' | 'partial' | 'missing';
  explanation: string;
  missing_fields: string[];
  evidence: IndustrialEvidenceItem[];
}

export interface IndustrialScorecard {
  geo_key: string;
  county_name: string;
  state: string;
  use_case: IndustrialUseCase;
  as_of: string;
  overall_score: number | null;
  confidence: IndustrialConfidence;
  summary: string;
  component_scores: Record<IndustrialComponentKey, number | null>;
  components: Record<IndustrialComponentKey, IndustrialComponentScore>;
  disqualifiers: string[];
  missing_critical_data: string[];
  evidence: Record<string, IndustrialEvidenceItem>;
  lineage: Record<IndustrialComponentKey, IndustrialLineage>;
}

const INDUSTRIAL_DATA_SOURCES: IndustrialDataSourceDef[] = [
  {
    name: 'EIA',
    cadence: 'annual',
    notes: 'Power pricing and electric system context for industrial / data-center screening.',
  },
  {
    name: 'HIFLD',
    cadence: 'periodic',
    notes: 'Critical infrastructure layers including electric infrastructure proxies.',
  },
  {
    name: 'FEMA',
    cadence: 'periodic',
    notes: 'Flood hazard data used for screening and exclusion logic.',
  },
  {
    name: 'USGS',
    cadence: 'periodic',
    notes: 'Physical terrain and water-stress related geographic evidence.',
  },
  {
    name: 'FCC',
    cadence: 'periodic',
    notes: 'Connectivity and broadband proxy layers.',
  },
  {
    name: 'OpenStreetMap / DOT',
    cadence: 'periodic',
    notes: 'Transport and market-access proxy layers.',
  },
  {
    name: 'Atlas Derived',
    cadence: 'derived',
    notes: 'Atlas-normalized industrial screening scores derived from public source layers.',
  },
] as const;

export const INDUSTRIAL_SERIES_DEFS: IndustrialSeriesDef[] = [
  {
    seriesKey: 'industrial_power_price',
    geoLevels: ['state', 'national'],
    frequency: 'annual',
    unit: 'cents_per_kwh',
    sourceName: 'EIA',
    label: 'Industrial Power Price',
    description: 'Industrial electricity pricing context for power-sensitive uses.',
  },
  {
    seriesKey: 'power_cost_index',
    geoLevels: ['county', 'state', 'national'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'Atlas Derived',
    label: 'Power Cost Index',
    description: 'Normalized score where higher is more favorable from a power-cost perspective.',
  },
  {
    seriesKey: 'substation_proximity_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'HIFLD',
    label: 'Substation Proximity Score',
    description: 'Proximity-based readiness proxy for nearby substations.',
  },
  {
    seriesKey: 'transmission_proximity_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'HIFLD',
    label: 'Transmission Proximity Score',
    description: 'Proximity-based readiness proxy for transmission infrastructure.',
  },
  {
    seriesKey: 'water_stress_score',
    geoLevels: ['county', 'state', 'national'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'USGS',
    label: 'Water Stress Score',
    description: 'Normalized score where higher indicates lower water-stress burden.',
  },
  {
    seriesKey: 'flood_risk_score',
    geoLevels: ['county', 'state', 'national'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'FEMA',
    label: 'Flood Risk Score',
    description: 'Normalized score where higher indicates lower flood-risk burden.',
  },
  {
    seriesKey: 'slope_buildability_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'USGS',
    label: 'Slope Buildability Score',
    description: 'Normalized score where higher indicates more buildable terrain.',
  },
  {
    seriesKey: 'connectivity_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'FCC',
    label: 'Connectivity Score',
    description: 'Connectivity proxy score using public broadband and network-adjacent evidence.',
  },
  {
    seriesKey: 'highway_access_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'OpenStreetMap / DOT',
    label: 'Highway Access Score',
    description: 'Normalized score where higher indicates stronger highway accessibility.',
  },
  {
    seriesKey: 'metro_access_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'OpenStreetMap / DOT',
    label: 'Metro Access Score',
    description: 'Normalized score where higher indicates stronger metro / market adjacency.',
  },
  {
    seriesKey: 'industrial_land_cost_index',
    geoLevels: ['county', 'state', 'national'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'Atlas Derived',
    label: 'Industrial Land Cost Index',
    description: 'Normalized score where higher indicates more favorable land-cost positioning.',
  },
  {
    seriesKey: 'entitlement_friction_score',
    geoLevels: ['county', 'state'],
    frequency: 'annual',
    unit: 'score_0_100',
    sourceName: 'Atlas Derived',
    label: 'Entitlement Friction Score',
    description: 'Normalized score where higher indicates lower entitlement and planning friction.',
  },
] as const;

export const INDUSTRIAL_REQUIRED_SERIES = Array.from(new Set(INDUSTRIAL_SERIES_DEFS.map((item) => item.seriesKey)));

const SERIES_LOOKUP = new Map(INDUSTRIAL_SERIES_DEFS.map((item) => [item.seriesKey, item]));

const COMPONENT_DEFS: Array<{
  key: IndustrialComponentKey;
  label: string;
  weight: number;
  seriesKeys: string[];
  missingFields: string[];
  explanation: string;
}> = [
  {
    key: 'power_readiness',
    label: 'Power Readiness',
    weight: 0.30,
    seriesKeys: ['power_cost_index', 'industrial_power_price', 'substation_proximity_score', 'transmission_proximity_score'],
    missingFields: ['Power cost context', 'Substation proximity', 'Transmission proximity'],
    explanation: 'Combines cost and grid-adjacency proxies to estimate whether the geography is plausibly power-ready.',
  },
  {
    key: 'water_readiness',
    label: 'Water Readiness',
    weight: 0.20,
    seriesKeys: ['water_stress_score'],
    missingFields: ['Water stress context'],
    explanation: 'Assesses whether water stress is likely to create a cooling or operating burden.',
  },
  {
    key: 'connectivity_access',
    label: 'Connectivity & Access',
    weight: 0.20,
    seriesKeys: ['connectivity_score', 'highway_access_score', 'metro_access_score'],
    missingFields: ['Connectivity proxy', 'Highway access', 'Metro access'],
    explanation: 'Estimates network and transport plausibility using public connectivity and access proxies.',
  },
  {
    key: 'physical_suitability',
    label: 'Physical Suitability',
    weight: 0.20,
    seriesKeys: ['flood_risk_score', 'slope_buildability_score'],
    missingFields: ['Flood-risk context', 'Slope/buildability context'],
    explanation: 'Screens for obvious physical constraints that can derail data-center or industrial viability.',
  },
  {
    key: 'entitlement_market',
    label: 'Entitlement & Market',
    weight: 0.10,
    seriesKeys: ['industrial_land_cost_index', 'entitlement_friction_score'],
    missingFields: ['Industrial land cost positioning', 'Entitlement friction'],
    explanation: 'Captures whether development friction and land-cost competitiveness are directionally favorable.',
  },
] as const;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function asFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getLineageYear(snapshot: SeriesSnapshot, lineage: SeriesLineageLevel, key: string): string | null {
  return snapshot.levelYears?.[lineage]?.[key] ?? null;
}

function buildEvidenceItem(snapshot: SeriesSnapshot, key: string): IndustrialEvidenceItem | null {
  const def = SERIES_LOOKUP.get(key);
  if (!def) return null;
  const value = asFiniteNumber(snapshot.series[key]);
  const lineage = snapshot.lineage[key];
  if (value == null || !lineage) return null;
  return {
    key,
    label: def.label,
    value: round1(value),
    unit: def.unit,
    source: def.sourceName,
    lineage,
    as_of: getLineageYear(snapshot, lineage, key),
  };
}

function summarizeLineage(lineages: IndustrialLineage[]): IndustrialLineage {
  const compact = lineages.filter((item) => item && item !== 'missing');
  if (!compact.length) return 'missing';
  const first = compact[0];
  if (compact.every((item) => item === first)) return first;
  return 'mixed';
}

function computeComponent(snapshot: SeriesSnapshot, definition: (typeof COMPONENT_DEFS)[number]): IndustrialComponentScore {
  const evidence = definition.seriesKeys
    .map((key) => buildEvidenceItem(snapshot, key))
    .filter((item): item is IndustrialEvidenceItem => !!item);

  const score = evidence.length
    ? round1(evidence.reduce((sum, item) => sum + item.value, 0) / evidence.length)
    : null;

  const lineage = summarizeLineage(evidence.map((item) => item.lineage));
  const missingFields = definition.missingFields.filter((_, index) => !evidence[index]);
  const status = score == null ? 'missing' : missingFields.length ? 'partial' : 'ready';

  return {
    key: definition.key,
    label: definition.label,
    score,
    lineage,
    status,
    explanation: definition.explanation,
    missing_fields: missingFields,
    evidence,
  };
}

function buildDisqualifiers(components: Record<IndustrialComponentKey, IndustrialComponentScore>): string[] {
  const results: string[] = [];
  const flood = asFiniteNumber(components.physical_suitability.evidence.find((item) => item.key === 'flood_risk_score')?.value);
  const water = asFiniteNumber(components.water_readiness.evidence.find((item) => item.key === 'water_stress_score')?.value);
  const power = asFiniteNumber(components.power_readiness.score);

  if (flood != null && flood < 35) results.push('Flood-risk profile is currently unfavorable');
  if (water != null && water < 35) results.push('Water-stress profile is currently unfavorable');
  if (power != null && power < 35) results.push('Power-readiness evidence is currently weak');

  return results;
}

function buildMissingCriticalData(components: Record<IndustrialComponentKey, IndustrialComponentScore>): string[] {
  const results: string[] = [];
  for (const component of Object.values(components)) {
    if (component.score == null) {
      results.push(...component.missing_fields);
    }
  }
  return Array.from(new Set(results));
}

function computeOverallScore(components: Record<IndustrialComponentKey, IndustrialComponentScore>): number | null {
  let weighted = 0;
  let weightTotal = 0;
  for (const definition of COMPONENT_DEFS) {
    const score = components[definition.key].score;
    if (score == null) continue;
    weighted += score * definition.weight;
    weightTotal += definition.weight;
  }
  if (weightTotal <= 0) return null;
  const populatedCount = COMPONENT_DEFS.filter((item) => components[item.key].score != null).length;
  if (populatedCount < 3) return null;
  return round1(weighted / weightTotal);
}

function computeConfidence(
  overallScore: number | null,
  components: Record<IndustrialComponentKey, IndustrialComponentScore>,
  missingCriticalData: string[],
): IndustrialConfidence {
  if (overallScore == null) return 'low';
  const readyCount = Object.values(components).filter((component) => component.status === 'ready').length;
  const countyCount = Object.values(components).filter((component) => component.lineage === 'county').length;
  if (readyCount >= 4 && countyCount >= 3 && missingCriticalData.length <= 2) return 'high';
  if (readyCount >= 2) return 'medium';
  return 'low';
}

function buildSummary(
  overallScore: number | null,
  components: Record<IndustrialComponentKey, IndustrialComponentScore>,
  disqualifiers: string[],
  missingCriticalData: string[],
): string {
  if (overallScore == null) {
    return 'Industrial scorecard is not yet populated for this geography because first-wave industrial infrastructure and risk series are still missing or too sparse.';
  }

  const strengths = Object.values(components)
    .filter((component) => typeof component.score === 'number' && component.score >= 70)
    .map((component) => component.label.toLowerCase());
  const weak = Object.values(components)
    .filter((component) => typeof component.score === 'number' && component.score < 45)
    .map((component) => component.label.toLowerCase());

  const parts: string[] = [];
  if (strengths.length) {
    parts.push(`Relative strengths: ${strengths.slice(0, 2).join(' and ')}.`);
  }
  if (weak.length) {
    parts.push(`Weakest areas: ${weak.slice(0, 2).join(' and ')}.`);
  }
  if (disqualifiers.length) {
    parts.push(`Main caution: ${disqualifiers[0]}.`);
  } else if (missingCriticalData.length) {
    parts.push(`Key diligence gap: ${missingCriticalData.slice(0, 2).join(' and ')}.`);
  }

  return parts.join(' ') || 'Industrial screening evidence is present but still mixed; deeper diligence is needed before forming a strong conclusion.';
}

export async function ensureIndustrialSeriesCatalog(db: D1Database): Promise<void> {
  for (const source of INDUSTRIAL_DATA_SOURCES) {
    await db
      .prepare('INSERT OR IGNORE INTO data_sources (name, cadence, notes) VALUES (?, ?, ?)')
      .bind(source.name, source.cadence, source.notes)
      .run();
  }

  const sourceRows = await db
    .prepare('SELECT id, name FROM data_sources WHERE name IN (' + INDUSTRIAL_DATA_SOURCES.map(() => '?').join(',') + ')')
    .bind(...INDUSTRIAL_DATA_SOURCES.map((item) => item.name))
    .all<{ id: number; name: string }>();

  const sourceIdByName = new Map<string, number>();
  for (const row of sourceRows.results ?? []) {
    sourceIdByName.set(row.name, row.id);
  }

  for (const series of INDUSTRIAL_SERIES_DEFS) {
    const sourceId = sourceIdByName.get(series.sourceName) ?? null;
    for (const geoLevel of series.geoLevels) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(series.seriesKey, geoLevel, series.frequency, series.unit, sourceId)
        .run();
    }
  }
}

export function computeIndustrialScorecard(
  geoKey: string,
  countyName: string,
  state: string,
  asOf: string,
  useCase: IndustrialUseCase,
  snapshot: SeriesSnapshot,
): IndustrialScorecard {
  const components = Object.fromEntries(
    COMPONENT_DEFS.map((definition) => [definition.key, computeComponent(snapshot, definition)]),
  ) as Record<IndustrialComponentKey, IndustrialComponentScore>;

  const overallScore = computeOverallScore(components);
  const disqualifiers = buildDisqualifiers(components);
  const missingCriticalData = buildMissingCriticalData(components);
  const confidence = computeConfidence(overallScore, components, missingCriticalData);
  const summary = buildSummary(overallScore, components, disqualifiers, missingCriticalData);

  const componentScores = Object.fromEntries(
    Object.entries(components).map(([key, component]) => [key, component.score]),
  ) as Record<IndustrialComponentKey, number | null>;

  const evidence = Object.fromEntries(
    Object.values(components)
      .flatMap((component) => component.evidence)
      .map((item) => [item.key, item]),
  );

  const lineage = Object.fromEntries(
    Object.entries(components).map(([key, component]) => [key, component.lineage]),
  ) as Record<IndustrialComponentKey, IndustrialLineage>;

  return {
    geo_key: geoKey,
    county_name: countyName,
    state,
    use_case: useCase,
    as_of: asOf,
    overall_score: overallScore,
    confidence,
    summary,
    component_scores: componentScores,
    components,
    disqualifiers,
    missing_critical_data: missingCriticalData,
    evidence,
    lineage,
  };
}
