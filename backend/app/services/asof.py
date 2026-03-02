"""Dynamic as-of year resolver with coverage metadata."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

DEFAULT_REQUIRED_SERIES = [
    "usda.cash_rent.county",
    "usda.land_value.county",
    "usda.corn_yield.county",
    "rates.treasury.10y",
    "grain.corn.price",
]
HIGH_COVERAGE_THRESHOLD = 0.7


@dataclass
class County:
    fips: str
    state: str


@dataclass
class Coverage:
    year: str
    counties_total: int
    counties_complete: int
    complete_pct: float
    avg_series_coverage_pct: float
    series_coverage_pct: dict[str, float]


def _clamp_pct(value: float) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(1.0, float(value)))


def _normalize_requested_as_of(raw: str | None) -> str:
    normalized = (raw or "latest").strip().lower()
    if normalized == "latest":
        return "latest"
    if len(normalized) == 4 and normalized.isdigit():
        return normalized
    return "latest"


def _in_clause_params(values: list[str], prefix: str) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {}
    tokens: list[str] = []
    for idx, value in enumerate(values):
        key = f"{prefix}{idx}"
        tokens.append(f":{key}")
        params[key] = value
    return ", ".join(tokens), params


def _load_counties(db: Session, state: str | None = None) -> list[County]:
    normalized = (state or "").strip().upper()
    if normalized:
        rows = db.execute(
            text("SELECT fips, state FROM geo_county WHERE state = :state ORDER BY fips"),
            {"state": normalized},
        ).fetchall()
    else:
        rows = db.execute(text("SELECT fips, state FROM geo_county ORDER BY fips")).fetchall()
    return [County(fips=row[0], state=row[1]) for row in rows]


def _list_candidate_years(db: Session, required_series: list[str]) -> list[str]:
    if not required_series:
        return []
    in_clause, params = _in_clause_params(required_series, "series")
    rows = db.execute(
        text(
            f"""
            SELECT DISTINCT dp.as_of_date
            FROM data_points dp
            JOIN data_series ds ON ds.id = dp.series_id
            WHERE ds.series_key IN ({in_clause})
            ORDER BY CAST(dp.as_of_date AS INTEGER) DESC
            """
        ),
        params,
    ).fetchall()
    return [row[0] for row in rows if isinstance(row[0], str) and len(row[0]) == 4 and row[0].isdigit()]


def _compute_coverage(
    db: Session,
    year: str,
    counties: list[County],
    required_series: list[str],
) -> Coverage:
    counties_total = len(counties)
    if counties_total == 0 or not required_series:
        return Coverage(
            year=year,
            counties_total=counties_total,
            counties_complete=0,
            complete_pct=0.0,
            avg_series_coverage_pct=0.0,
            series_coverage_pct={},
        )

    in_clause, params = _in_clause_params(required_series, "series")
    params["year"] = year
    rows = db.execute(
        text(
            f"""
            SELECT ds.series_key, dp.geo_key
            FROM data_points dp
            JOIN data_series ds ON ds.id = dp.series_id
            WHERE dp.as_of_date = :year
              AND ds.series_key IN ({in_clause})
            """
        ),
        params,
    ).fetchall()

    series_geo: dict[str, set[str]] = {series: set() for series in required_series}
    for series_key, geo_key in rows:
        if series_key in series_geo and isinstance(geo_key, str):
            series_geo[series_key].add(geo_key)

    series_covered_counts = {series: 0 for series in required_series}
    counties_complete = 0

    for county in counties:
        complete = True
        for series in required_series:
            geo_keys = series_geo.get(series, set())
            covered = county.fips in geo_keys or county.state in geo_keys or "US" in geo_keys
            if covered:
                series_covered_counts[series] += 1
            else:
                complete = False
        if complete:
            counties_complete += 1

    series_coverage_pct = {
        series: _clamp_pct(series_covered_counts[series] / counties_total)
        for series in required_series
    }
    avg_series_coverage_pct = _clamp_pct(
        sum(series_coverage_pct.values()) / len(required_series)
    )

    return Coverage(
        year=year,
        counties_total=counties_total,
        counties_complete=counties_complete,
        complete_pct=_clamp_pct(counties_complete / counties_total),
        avg_series_coverage_pct=avg_series_coverage_pct,
        series_coverage_pct=series_coverage_pct,
    )


def _build_meta(
    requested_as_of: str,
    resolved: Coverage,
    required_series: list[str],
    strategy: str,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "requested_as_of": requested_as_of,
        "resolved_as_of": resolved.year,
        "strategy": strategy,
        "required_series": required_series,
        "counties_total": resolved.counties_total,
        "counties_complete": resolved.counties_complete,
        "coverage_pct": resolved.complete_pct,
        "series_coverage_pct": resolved.series_coverage_pct,
        "warnings": warnings,
    }


def resolve_as_of(
    db: Session,
    requested_as_of: str | None = None,
    state: str | None = None,
    required_series: list[str] | None = None,
) -> dict[str, Any]:
    """Resolve the as_of year and return metadata describing coverage quality."""
    series = list(dict.fromkeys(required_series or DEFAULT_REQUIRED_SERIES))
    requested = _normalize_requested_as_of(requested_as_of)
    counties = _load_counties(db, state)
    candidate_years = _list_candidate_years(db, series)

    if not candidate_years:
        fallback = str(datetime.utcnow().year)
        empty_coverage = Coverage(
            year=fallback,
            counties_total=len(counties),
            counties_complete=0,
            complete_pct=0.0,
            avg_series_coverage_pct=0.0,
            series_coverage_pct={series_key: 0.0 for series_key in series},
        )
        return {
            "as_of": fallback,
            "meta": _build_meta(
                requested,
                empty_coverage,
                series,
                "latest_fallback",
                ["No matching data years found for required series; using current year fallback."],
            ),
        }

    if requested != "latest":
        explicit = _compute_coverage(db, requested, counties, series)
        warnings: list[str] = []
        if explicit.counties_total > 0 and explicit.complete_pct < HIGH_COVERAGE_THRESHOLD:
            warnings.append(
                f"Coverage for explicit as_of {requested} is low ({round(explicit.complete_pct * 100)}%)."
            )
        return {
            "as_of": requested,
            "meta": _build_meta(requested, explicit, series, "explicit", warnings),
        }

    years_to_eval = candidate_years[:20]
    coverage_rows = [_compute_coverage(db, year, counties, series) for year in years_to_eval]

    ranked = sorted(
        coverage_rows,
        key=lambda row: (
            row.complete_pct,
            row.avg_series_coverage_pct,
            int(row.year),
        ),
        reverse=True,
    )

    best = ranked[0]
    latest_year = years_to_eval[0]
    latest = next((row for row in coverage_rows if row.year == latest_year), best)

    if best.complete_pct >= HIGH_COVERAGE_THRESHOLD:
        return {
            "as_of": best.year,
            "meta": _build_meta(requested, best, series, "latest_best_coverage", []),
        }

    return {
        "as_of": latest.year,
        "meta": _build_meta(
            requested,
            latest,
            series,
            "latest_fallback",
            [
                f"No high-coverage year reached {round(HIGH_COVERAGE_THRESHOLD * 100)}% completeness; using latest available year {latest.year}."
            ],
        ),
    }
