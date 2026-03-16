import type { SeriesData } from './metric-engine';

type SeriesLineageLevel = 'county' | 'state' | 'national';
type SeriesLineage = Record<string, SeriesLineageLevel>;

export const FLOOD_SERIES_KEYS = [
  'flood_hazard_score',
  'flood_hazard_rating_code',
  'flood_ag_loss_rate_pct',
] as const;

export interface FloodEvidence {
  hazard_score: number | null;
  hazard_rating_code: number | null;
  hazard_rating_label: string | null;
  ag_loss_rate_pct: number | null;
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

export function floodRatingLabel(code: number | null | undefined): string | null {
  switch (Math.round(code ?? NaN)) {
    case 1:
      return 'Very Low';
    case 2:
      return 'Relatively Low';
    case 3:
      return 'Relatively Moderate';
    case 4:
      return 'Relatively High';
    case 5:
      return 'Very High';
    default:
      return null;
  }
}

function deriveLineage(lineage: SeriesLineage | null | undefined): FloodEvidence['lineage'] {
  const values = Array.from(new Set(FLOOD_SERIES_KEYS.map((key) => lineage?.[key]).filter(Boolean)));
  if (!values.length) return 'missing';
  if (values.length === 1) return values[0] as SeriesLineageLevel;
  return 'mixed';
}

export function computeFloodEvidence(
  series: SeriesData,
  lineage?: SeriesLineage | null,
): FloodEvidence | null {
  const hazardScore = round(asFiniteNumber(series.flood_hazard_score), 1);
  const hazardRatingCode = round(asFiniteNumber(series.flood_hazard_rating_code), 0);
  const agLossRatePct = round(asFiniteNumber(series.flood_ag_loss_rate_pct), 2);

  if (hazardScore == null && hazardRatingCode == null && agLossRatePct == null) return null;

  const hazardRatingLabel = floodRatingLabel(hazardRatingCode);
  const resolvedLineage = deriveLineage(lineage);
  const notes = [
    'FEMA National Risk Index flood hazard score on a 0-100 scale where higher indicates higher flood risk.',
    'Atlas uses the official FEMA flood hazard signal directly in farmland/risk views and keeps any industrial flood suitability transform separate.',
  ];

  if (agLossRatePct != null) {
    notes.push('Expected annual agriculture loss rate reflects FEMA inland flooding agriculture loss where FEMA provides that field.');
    notes.push(`Expected annual agriculture loss rate is ${agLossRatePct.toFixed(2)}% of agriculture value.`);
  } else {
    notes.push('Agriculture loss rate is unavailable when FEMA only exposes non-ag flood burden for the selected county.');
  }

  const summary = hazardRatingLabel
    ? `FEMA flood risk is ${hazardRatingLabel.toLowerCase()}${hazardScore != null ? ` (${hazardScore.toFixed(1)}/100)` : ''}.`
    : hazardScore != null
      ? `FEMA flood risk score is ${hazardScore.toFixed(1)} / 100.`
      : 'FEMA flood evidence is partially loaded.';

  return {
    hazard_score: hazardScore,
    hazard_rating_code: hazardRatingCode,
    hazard_rating_label: hazardRatingLabel,
    ag_loss_rate_pct: agLossRatePct,
    lineage: resolvedLineage,
    summary,
    notes,
  };
}
