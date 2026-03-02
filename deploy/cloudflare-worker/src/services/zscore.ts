export interface ZScoreMetricStats {
  value: number | null;
  mean: number | null;
  stddev: number | null;
  zscore: number | null;
  percentile: number | null;
  window_n: number;
  window_start: string | null;
  window_end: string | null;
}

export type ZScoreBand = 'cheap' | 'normal' | 'expensive' | 'na';

function round(value: number, precision = 4): number {
  const scale = Math.pow(10, precision);
  return Math.round(value * scale) / scale;
}

export function zscoreBand(z: number | null): ZScoreBand {
  if (z == null || Number.isNaN(z)) return 'na';
  if (z <= -0.5) return 'cheap';
  if (z >= 0.5) return 'expensive';
  return 'normal';
}

export function computeZScoreStats(
  currentValue: number | null,
  windowValues: number[],
  years: string[] = [],
): ZScoreMetricStats {
  const cleanWindow = windowValues.filter((value) => Number.isFinite(value));
  if (!cleanWindow.length) {
    return {
      value: currentValue,
      mean: null,
      stddev: null,
      zscore: null,
      percentile: null,
      window_n: 0,
      window_start: years.length ? years[0] : null,
      window_end: years.length ? years[years.length - 1] : null,
    };
  }

  const n = cleanWindow.length;
  const mean = cleanWindow.reduce((sum, value) => sum + value, 0) / n;
  const variance = cleanWindow.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  let zscore: number | null = null;
  let percentile: number | null = null;
  if (currentValue != null && Number.isFinite(currentValue)) {
    zscore = stddev > 0 ? (currentValue - mean) / stddev : 0;
    const sorted = [...cleanWindow].sort((a, b) => a - b);
    let belowOrEqual = 0;
    for (const value of sorted) {
      if (value <= currentValue) belowOrEqual += 1;
    }
    percentile = (belowOrEqual / sorted.length) * 100;
  }

  return {
    value: currentValue,
    mean: round(mean),
    stddev: round(stddev),
    zscore: zscore == null ? null : round(zscore),
    percentile: percentile == null ? null : round(percentile, 2),
    window_n: n,
    window_start: years.length ? years[0] : null,
    window_end: years.length ? years[years.length - 1] : null,
  };
}
