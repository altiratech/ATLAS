import type { SeriesData } from './metric-engine';

type SeriesLineageLevel = 'county' | 'state' | 'national';
type SeriesLineage = Record<string, SeriesLineageLevel>;

export const SOIL_SERIES_KEYS = [
  'soil_prime_farmland_share_pct',
  'soil_statewide_farmland_share_pct',
  'soil_unique_farmland_share_pct',
  'soil_local_farmland_share_pct',
  'soil_significant_farmland_share_pct',
  'soil_other_land_share_pct',
  'soil_rootzone_aws_100cm',
  'soil_rootzone_aws_150cm',
  'soil_survey_area_count',
] as const;

export interface SoilEvidence {
  prime_share_pct: number | null;
  statewide_share_pct: number | null;
  unique_share_pct: number | null;
  local_share_pct: number | null;
  significant_share_pct: number | null;
  other_share_pct: number | null;
  rootzone_aws_100cm: number | null;
  rootzone_aws_150cm: number | null;
  survey_area_count: number | null;
  lineage: SeriesLineageLevel | 'mixed' | 'missing';
  summary: string;
  notes: string[];
}

function asFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null, decimals = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function deriveLineage(lineage: SeriesLineage | null | undefined): SoilEvidence['lineage'] {
  const values = Array.from(new Set(SOIL_SERIES_KEYS.map((key) => lineage?.[key]).filter(Boolean)));
  if (!values.length) return 'missing';
  if (values.length === 1) return values[0] as SeriesLineageLevel;
  return 'mixed';
}

export function computeSoilEvidence(
  series: SeriesData,
  lineage?: SeriesLineage | null,
): SoilEvidence | null {
  const primeShare = round(asFiniteNumber(series.soil_prime_farmland_share_pct), 1);
  const statewideShare = round(asFiniteNumber(series.soil_statewide_farmland_share_pct), 1);
  const uniqueShare = round(asFiniteNumber(series.soil_unique_farmland_share_pct), 1);
  const localShare = round(asFiniteNumber(series.soil_local_farmland_share_pct), 1);
  const significantShare = round(asFiniteNumber(series.soil_significant_farmland_share_pct), 1);
  const otherShare = round(asFiniteNumber(series.soil_other_land_share_pct), 1);
  const aws100 = round(asFiniteNumber(series.soil_rootzone_aws_100cm), 1);
  const aws150 = round(asFiniteNumber(series.soil_rootzone_aws_150cm), 1);
  const surveyAreaCount = round(asFiniteNumber(series.soil_survey_area_count), 0);

  if (
    primeShare == null &&
    statewideShare == null &&
    uniqueShare == null &&
    localShare == null &&
    significantShare == null &&
    otherShare == null &&
    aws100 == null &&
    aws150 == null
  ) {
    return null;
  }

  const resolvedLineage = deriveLineage(lineage);
  const notes = [
    'USDA NRCS SSURGO soil evidence is blended from the official survey areas that overlap the county.',
    'NRCS farmland share combines acres classified as prime, statewide, unique, or local importance.',
    'Available water storage is the weighted NRCS soil-water holding capacity in the top 100 cm and 150 cm of the soil profile; higher values generally support better moisture buffering.',
  ];

  if (surveyAreaCount != null) {
    notes.push(
      surveyAreaCount > 1
        ? `This county blends ${surveyAreaCount.toFixed(0)} overlapping NRCS survey areas by acreage.`
        : 'This county resolves to one NRCS survey area.',
    );
  }

  let summary = 'NRCS soil evidence is partially loaded for this county.';
  if (significantShare != null && aws100 != null) {
    summary = `NRCS classifies ${significantShare.toFixed(1)}% of surveyed acres as farmland of prime, statewide, unique, or local importance; weighted available water storage is ${aws100.toFixed(1)} in the top 100 cm of soil.`;
  } else if (significantShare != null) {
    summary = `NRCS classifies ${significantShare.toFixed(1)}% of surveyed acres as farmland of prime, statewide, unique, or local importance.`;
  } else if (aws100 != null) {
    summary = `NRCS weighted available water storage is ${aws100.toFixed(1)} in the top 100 cm of soil.`;
  }

  return {
    prime_share_pct: primeShare,
    statewide_share_pct: statewideShare,
    unique_share_pct: uniqueShare,
    local_share_pct: localShare,
    significant_share_pct: significantShare,
    other_share_pct: otherShare,
    rootzone_aws_100cm: aws100,
    rootzone_aws_150cm: aws150,
    survey_area_count: surveyAreaCount,
    lineage: resolvedLineage,
    summary,
    notes,
  };
}
