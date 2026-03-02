/**
 * Access Score Service — facility proximity and density scoring.
 * Ported from Python backend/app/services/access_score.py
 */

export interface Facility {
  id: number;
  type: string;
  name: string;
  lat: number;
  lon: number;
}

export interface AccessResult {
  access_score: number;
  details: Record<string, FacilityTypeDetail>;
  distances_json: Record<string, number>;
  density_json: Record<string, number>;
}

interface FacilityTypeDetail {
  type: string;
  nearest_distance: number;
  count_25mi: number;
  count_50mi: number;
  sub_score: number;
}

// Facility type weights (must sum to 1.0)
const WEIGHTS: Record<string, number> = {
  elevator: 0.35,
  ethanol: 0.20,
  processor: 0.20,
  rail: 0.15,
  river: 0.10,
};

/**
 * Haversine distance between two lat/lon points in miles.
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Distance-based score (0-100) for a single facility.
 */
function distanceScore(miles: number): number {
  if (miles <= 10) return 100;
  if (miles <= 25) return 80 - ((miles - 10) / 15) * 30; // 80→50
  if (miles <= 50) return 50 - ((miles - 25) / 25) * 25; // 50→25
  if (miles <= 100) return 25 - ((miles - 50) / 50) * 20; // 25→5
  return Math.max(0, 5 * Math.exp(-(miles - 100) / 100));
}

/**
 * Density bonus (0-20 points) based on number of facilities within radius.
 */
function densityBonus(count25: number, count50: number): number {
  return Math.min(20, count25 * 5 + count50 * 2);
}

/**
 * Compute access score for a county given its centroid and all facilities.
 */
export function computeAccessScore(
  lat: number,
  lon: number,
  facilities: Facility[],
): AccessResult {
  const typeGroups: Record<string, { distance: number; count25: number; count50: number }[]> = {};

  // Group facilities by type and compute distances
  for (const f of facilities) {
    const dist = haversine(lat, lon, f.lat, f.lon);
    const type = f.type;
    if (!typeGroups[type]) typeGroups[type] = [];
    typeGroups[type].push({
      distance: dist,
      count25: dist <= 25 ? 1 : 0,
      count50: dist <= 50 ? 1 : 0,
    });
  }

  const details: Record<string, FacilityTypeDetail> = {};
  const distances: Record<string, number> = {};
  const density: Record<string, number> = {};
  let weightedScore = 0;
  let totalWeight = 0;

  for (const [type, weight] of Object.entries(WEIGHTS)) {
    const group = typeGroups[type] || [];
    if (group.length === 0) {
      details[type] = { type, nearest_distance: 999, count_25mi: 0, count_50mi: 0, sub_score: 0 };
      distances[type] = 999;
      density[`${type}_25mi`] = 0;
      density[`${type}_50mi`] = 0;
      continue;
    }

    const nearest = Math.min(...group.map((g) => g.distance));
    const count25 = group.reduce((s, g) => s + g.count25, 0);
    const count50 = group.reduce((s, g) => s + g.count50, 0);
    const subScore = Math.min(100, distanceScore(nearest) + densityBonus(count25, count50));

    details[type] = { type, nearest_distance: round1(nearest), count_25mi: count25, count_50mi: count50, sub_score: round1(subScore) };
    distances[type] = round1(nearest);
    density[`${type}_25mi`] = count25;
    density[`${type}_50mi`] = count50;

    weightedScore += subScore * weight;
    totalWeight += weight;
  }

  const finalScore = totalWeight > 0 ? round1(weightedScore / totalWeight) : 0;

  return {
    access_score: finalScore,
    details,
    distances_json: distances,
    density_json: density,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
