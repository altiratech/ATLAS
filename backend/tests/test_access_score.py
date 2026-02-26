"""Tests for access score computation."""
import sys
sys.path.insert(0, '.')
from app.services.access_score import compute_access_score, haversine_miles


def test_haversine():
    # Des Moines to Cedar Rapids ~130 miles
    d = haversine_miles(41.59, -93.62, 42.01, -91.64)
    assert 95 < d < 115, f"Expected ~106mi, got {d:.1f}"
    print(f"✓ Haversine: Des Moines→Cedar Rapids = {d:.1f} mi")


def test_access_score_high():
    """County surrounded by facilities should score high."""
    facilities = [
        {"type": "elevator", "lat": 42.00, "lon": -91.60},
        {"type": "elevator", "lat": 42.05, "lon": -91.65},
        {"type": "elevator", "lat": 41.95, "lon": -91.55},
        {"type": "ethanol", "lat": 42.01, "lon": -91.70},
        {"type": "processor", "lat": 42.00, "lon": -91.50},
        {"type": "rail", "lat": 42.02, "lon": -91.62},
        {"type": "river", "lat": 41.98, "lon": -91.58},
    ]
    result = compute_access_score(42.01, -91.60, facilities)
    assert result["access_score"] > 60
    print(f"✓ High access: {result['access_score']}")


def test_access_score_low():
    """County far from everything should score low."""
    facilities = [
        {"type": "elevator", "lat": 45.0, "lon": -85.0},  # Very far
    ]
    result = compute_access_score(42.01, -91.60, facilities)
    assert result["access_score"] < 20
    print(f"✓ Low access: {result['access_score']}")


def test_access_details():
    """Should return distance and density details."""
    facilities = [
        {"type": "elevator", "lat": 42.05, "lon": -91.65},
        {"type": "elevator", "lat": 42.10, "lon": -91.50},
    ]
    result = compute_access_score(42.01, -91.60, facilities)
    assert "distances_json" in result
    assert "density_json" in result
    assert "details" in result
    print(f"✓ Access details present: {list(result['details'].keys())}")


if __name__ == "__main__":
    for t in [test_haversine, test_access_score_high, test_access_score_low, test_access_details]:
        try:
            t()
        except Exception as e:
            print(f"✗ {t.__name__}: {e}")
