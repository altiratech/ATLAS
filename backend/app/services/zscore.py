"""Z-score helpers for historical valuation context."""
from __future__ import annotations

import math
from typing import Iterable, Sequence


def zscore_band(z_value: float | None) -> str:
    if z_value is None or math.isnan(z_value):
        return "na"
    if z_value <= -0.5:
        return "cheap"
    if z_value >= 0.5:
        return "expensive"
    return "normal"


def _round(value: float, precision: int = 4) -> float:
    return round(value, precision)


def compute_zscore_stats(
    current_value: float | None,
    window_values: Iterable[float],
    years: Sequence[str] | None = None,
) -> dict:
    clean = [float(v) for v in window_values if v is not None and math.isfinite(float(v))]
    years = list(years or [])

    if not clean:
        return {
            "value": current_value,
            "mean": None,
            "stddev": None,
            "zscore": None,
            "percentile": None,
            "window_n": 0,
            "window_start": years[0] if years else None,
            "window_end": years[-1] if years else None,
            "band": "na",
        }

    n = len(clean)
    mean = sum(clean) / n
    variance = sum((value - mean) ** 2 for value in clean) / n
    stddev = math.sqrt(variance)

    zscore = None
    percentile = None
    if current_value is not None and math.isfinite(float(current_value)):
        if stddev > 0:
            zscore = (float(current_value) - mean) / stddev
        else:
            zscore = 0.0
        sorted_values = sorted(clean)
        below_or_equal = sum(1 for value in sorted_values if value <= float(current_value))
        percentile = (below_or_equal / len(sorted_values)) * 100.0

    return {
        "value": current_value,
        "mean": _round(mean),
        "stddev": _round(stddev),
        "zscore": _round(zscore) if zscore is not None else None,
        "percentile": _round(percentile, 2) if percentile is not None else None,
        "window_n": n,
        "window_start": years[0] if years else None,
        "window_end": years[-1] if years else None,
        "band": zscore_band(zscore),
    }
