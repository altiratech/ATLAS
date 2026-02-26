"""
Access Score computation — straight-line distances + density scoring.
Upgrade path: swap haversine for cached drive-time lookups.
"""
import math
from dataclasses import dataclass


FACILITY_WEIGHTS = {
    "elevator": 0.35,
    "ethanol": 0.20,
    "processor": 0.20,
    "rail": 0.15,
    "river": 0.10,
}

# Distance thresholds (miles) for scoring
DIST_THRESHOLDS = {"excellent": 10, "good": 25, "fair": 50, "poor": 100}


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@dataclass
class FacilityResult:
    type: str
    nearest_distance: float | None
    count_25mi: int
    count_50mi: int
    sub_score: float  # 0-100


def score_distance(dist: float | None) -> float:
    if dist is None:
        return 0
    if dist <= DIST_THRESHOLDS["excellent"]:
        return 100
    if dist <= DIST_THRESHOLDS["good"]:
        return 80 - (dist - 10) * (30 / 15)
    if dist <= DIST_THRESHOLDS["fair"]:
        return 50 - (dist - 25) * (25 / 25)
    if dist <= DIST_THRESHOLDS["poor"]:
        return 25 - (dist - 50) * (20 / 50)
    return max(0, 5 - (dist - 100) * 0.05)


def score_density(count_25: int, count_50: int) -> float:
    """Bonus for facility density (0-20 points)."""
    return min(20, count_25 * 5 + count_50 * 1.5)


def compute_access_score(
    county_lat: float,
    county_lon: float,
    facilities: list[dict],  # [{type, lat, lon, name, ...}]
    weights: dict[str, float] | None = None,
) -> dict:
    """Compute the 0-100 access score for a county centroid."""
    w = weights or FACILITY_WEIGHTS

    by_type: dict[str, list[float]] = {}
    for f in facilities:
        t = f["type"]
        d = haversine_miles(county_lat, county_lon, f["lat"], f["lon"])
        by_type.setdefault(t, []).append(d)

    results: dict[str, FacilityResult] = {}
    total_score = 0.0
    total_weight = 0.0

    for ftype, weight in w.items():
        distances = sorted(by_type.get(ftype, []))
        nearest = distances[0] if distances else None
        count_25 = sum(1 for d in distances if d <= 25)
        count_50 = sum(1 for d in distances if d <= 50)

        dist_score = score_distance(nearest)
        dens_bonus = score_density(count_25, count_50)
        sub = min(100, dist_score * 0.8 + dens_bonus)

        results[ftype] = FacilityResult(
            type=ftype,
            nearest_distance=round(nearest, 1) if nearest else None,
            count_25mi=count_25,
            count_50mi=count_50,
            sub_score=round(sub, 1),
        )
        total_score += sub * weight
        total_weight += weight

    composite = round(total_score / total_weight, 1) if total_weight > 0 else 0

    return {
        "access_score": composite,
        "details": {k: vars(v) for k, v in results.items()},
        "distances_json": {
            k: v.nearest_distance for k, v in results.items()
        },
        "density_json": {
            f"{k}_25mi": v.count_25mi for k, v in results.items()
        } | {
            f"{k}_50mi": v.count_50mi for k, v in results.items()
        },
    }
