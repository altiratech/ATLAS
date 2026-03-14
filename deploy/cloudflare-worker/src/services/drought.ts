import type { SeriesData } from './metric-engine';

type SeriesLineageLevel = 'county' | 'state' | 'national';
type SeriesLineage = Record<string, SeriesLineageLevel>;

export const DROUGHT_SERIES_KEYS = [
  'drought_risk_score',
  'drought_risk_rating_code',
  'drought_ag_loss_rate_pct',
] as const;

export interface DroughtEvidence {
  risk_score: number | null;
  risk_rating_code: number | null;
  risk_rating_label: string | null;
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

export function droughtRatingLabel(code: number | null | undefined): string | null {
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

function deriveLineage(lineage: SeriesLineage | null | undefined): DroughtEvidence['lineage'] {
  const keys = ['drought_risk_score', 'drought_risk_rating_code', 'drought_ag_loss_rate_pct'];
  const values = Array.from(new Set(keys.map((key) => lineage?.[key]).filter(Boolean)));
  if (!values.length) return 'missing';
  if (values.length === 1) return values[0] as SeriesLineageLevel;
  return 'mixed';
}

export function computeDroughtEvidence(
  series: SeriesData,
  lineage?: SeriesLineage | null,
): DroughtEvidence | null {
  const riskScore = round(asFiniteNumber(series.drought_risk_score), 1);
  const riskRatingCode = round(asFiniteNumber(series.drought_risk_rating_code), 0);
  const agLossRatePct = round(asFiniteNumber(series.drought_ag_loss_rate_pct), 2);

  if (riskScore == null && riskRatingCode == null && agLossRatePct == null) return null;

  const riskRatingLabel = droughtRatingLabel(riskRatingCode);
  const resolvedLineage = deriveLineage(lineage);
  const notes = [
    'FEMA National Risk Index drought hazard score on a 0-100 scale where higher indicates higher risk.',
  ];

  if (agLossRatePct != null) {
    notes.push(`Expected annual agriculture loss rate is ${agLossRatePct.toFixed(2)}% of agriculture value.`);
  }

  const summary = riskRatingLabel
    ? `FEMA drought risk is ${riskRatingLabel.toLowerCase()}${riskScore != null ? ` (${riskScore.toFixed(1)}/100)` : ''}.`
    : riskScore != null
      ? `FEMA drought risk score is ${riskScore.toFixed(1)} / 100.`
      : 'FEMA drought evidence is partially loaded.';

  return {
    risk_score: riskScore,
    risk_rating_code: riskRatingCode,
    risk_rating_label: riskRatingLabel,
    ag_loss_rate_pct: agLossRatePct,
    lineage: resolvedLineage,
    summary,
    notes,
  };
}
