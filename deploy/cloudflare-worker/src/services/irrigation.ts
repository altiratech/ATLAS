import type { SeriesData } from './metric-engine';

type SeriesLineageLevel = 'county' | 'state' | 'national';
type SeriesLineage = Record<string, SeriesLineageLevel>;

export const IRRIGATION_SERIES_KEYS = [
  'irrigated_ag_land_acres',
] as const;

export interface IrrigationEvidence {
  irrigated_acres: number | null;
  lineage: SeriesLineageLevel | 'mixed' | 'missing';
  summary: string;
  notes: string[];
}

function asFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null, decimals = 0): number | null {
  if (value == null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function deriveLineage(lineage: SeriesLineage | null | undefined): IrrigationEvidence['lineage'] {
  const values = Array.from(new Set(IRRIGATION_SERIES_KEYS.map((key) => lineage?.[key]).filter(Boolean)));
  if (!values.length) return 'missing';
  if (values.length === 1) return values[0] as SeriesLineageLevel;
  return 'mixed';
}

export function computeIrrigationEvidence(
  series: SeriesData,
  lineage?: SeriesLineage | null,
): IrrigationEvidence | null {
  const irrigatedAcres = round(asFiniteNumber(series.irrigated_ag_land_acres), 0);
  if (irrigatedAcres == null) return null;

  const resolvedLineage = deriveLineage(lineage);
  const notes = [
    'USDA NASS Census reports county-level irrigated agricultural land acreage.',
    'Atlas carries the latest available census baseline forward between census years so this stays visible in current underwriting views.',
    'Treat this as irrigation footprint context, not as a direct annual water-stress score.',
  ];

  const formattedAcres = Number(irrigatedAcres).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const summary = irrigatedAcres > 0
    ? `USDA Census reports ${formattedAcres} irrigated agricultural acres in Atlas\'s current carried-forward baseline.`
    : 'USDA Census reports no irrigated agricultural acres in Atlas\'s current carried-forward baseline.';

  return {
    irrigated_acres: irrigatedAcres,
    lineage: resolvedLineage,
    summary,
    notes,
  };
}
