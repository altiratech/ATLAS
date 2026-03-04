# Codex Implementation Spec: Composable Metric System (D-057)

**Created:** 2026-03-03 (ET)
**Author:** Claude (Cowork), approved by Ryan
**Decision ref:** D-057 in `SYSTEM/DECISIONS.md`
**Vision ref:** `docs/ATLAS_FULL_VISION_AND_PRIORITIZED_ROADMAP.md`, section "UI Architecture: Composable Metric System"
**Priority:** Tier 3 (item 3.3) — execute after current sprint data foundation + research workflow are stable
**Estimated effort:** Phase A (release-safe) 2-3 days, Phase B (full dynamic engine) 4-6 additional days

---

## 1. Problem Statement

The current screener and dashboard are hardcoded to farmland-specific metrics (`minCap`, `maxRentMult`, `zCapMin`, `zFairMin`, `zRentMin`, etc. in `frontend/index.html`). With the alternative land intelligence pivot (D-051), Atlas needs to support metrics across multiple asset domains without forcing users into rigid asset-class subtabs.

The approved solution: a composable metric pool where users toggle metrics on/off from domain-grouped categories, with the screener/dashboard/watchlist rendering dynamically from the selected set.

---

## 2. Backend: Metric Registry

### 2.1 New endpoint: `GET /api/v1/metrics/registry`

Returns the full catalog of available metrics with metadata.

**Response shape:**

```json
{
  "metrics": [
    {
      "key": "implied_cap_rate",
      "display_name": "Cap Rate",
      "domain": "land_valuation",
      "unit": "percent",
      "supports_zscore": true,
      "sort_default": "desc",
      "description": "NOI per acre divided by benchmark land value",
      "coverage": {
        "states_available": 3,
        "states_total": 20,
        "status": "partial"
      }
    }
  ],
  "domains": [
    {
      "key": "land_valuation",
      "display_name": "Land & Valuation",
      "order": 1
    },
    {
      "key": "crop_agriculture",
      "display_name": "Crop & Agriculture",
      "order": 2
    },
    {
      "key": "energy_power",
      "display_name": "Energy & Power",
      "order": 3
    },
    {
      "key": "infrastructure",
      "display_name": "Infrastructure",
      "order": 4
    },
    {
      "key": "environmental_climate",
      "display_name": "Environmental & Climate",
      "order": 5
    },
    {
      "key": "water_carbon",
      "display_name": "Water & Carbon",
      "order": 6
    }
  ]
}
```

**Coverage status enum:** `"available"` (>80% of tracked counties), `"partial"` (1-80%), `"coming_soon"` (0%, planned).

### 2.2 Where to define the registry

Option A (recommended for v1): Static config object in `src/services/metrics.ts` or similar. No D1 table needed yet — the metric catalog changes infrequently and adding a table adds migration overhead for no immediate benefit.

Option B (later): `metric_definitions` table in D1 if we need admin-editable metric metadata.

### 2.3 Initial metric catalog (aligned to current code keys)

Populate the registry with all metrics that currently exist in the codebase, mapped to their domain:

| Key | Display Name | Domain | Unit | Z-Score | Status |
|-----|-------------|--------|------|---------|--------|
| `implied_cap_rate` | Cap Rate | land_valuation | percent | yes | partial |
| `fair_value` | Fair Value/Acre | land_valuation | dollar | yes | partial |
| `cash_rent` | Cash Rent | land_valuation | dollar_per_acre | yes | partial |
| `benchmark_value` | Land Value/Acre | land_valuation | dollar_per_acre | yes | partial |
| `rent_multiple` | Rent Multiple | land_valuation | ratio | yes | partial |
| `noi_per_acre` | NOI/Acre | land_valuation | dollar_per_acre | yes | partial |
| `corn_yield` | Corn Yield | crop_agriculture | bushels_per_acre | yes | partial |
| `soybean_yield` | Soybean Yield | crop_agriculture | bushels_per_acre | yes | partial |
| `wheat_yield` | Wheat Yield | crop_agriculture | bushels_per_acre | yes | partial |
| `access_score` | Access Score | land_valuation | score | no | partial |

Implementation note:
- Keep a backward-compat alias map in the registry for UI labels (`cap_rate` -> `implied_cap_rate`, `fair_value_acre` -> `fair_value`, `land_value` -> `benchmark_value`, `noi_acre` -> `noi_per_acre`) so old references do not break.

Future metrics (register as `coming_soon` with no data backing):

| Key | Display Name | Domain | Status |
|-----|-------------|--------|--------|
| `solar_irradiance` | Solar Irradiance | energy_power | coming_soon |
| `wind_capacity_factor` | Wind Capacity Factor | energy_power | coming_soon |
| `fiber_proximity` | Fiber Proximity Score | infrastructure | coming_soon |
| `substation_distance` | Substation Distance | infrastructure | coming_soon |
| `water_access_score` | Water Access Score | water_carbon | coming_soon |
| `wholesale_elec_price` | Wholesale Electricity | energy_power | coming_soon |

### 2.4 Refactor screener API

Current: `GET /api/v1/screener` accepts hardcoded filter params (`minCap`, `maxRentMult`, `zCapMin`, etc.).

Target: Accept arbitrary metric key filters.

**New query param pattern:**

```
GET /api/v1/screener?metrics=implied_cap_rate,cash_rent,corn_yield
  &filter.implied_cap_rate.min=2.5
  &filter.implied_cap_rate.max=8.0
  &filter.cash_rent.zmin=0.5
  &sort=implied_cap_rate
  &sort_dir=desc
  &states=IA,IL,IN
  &limit=50
```

**Implementation approach:**

1. Parse `metrics` param into array of requested metric keys.
2. Validate each key against the registry.
3. Build query logic from a **whitelisted metric registry map**, not raw param-driven SQL fragments.
4. Apply filter conditions from `filter.{key}.min`, `filter.{key}.max`, `filter.{key}.zmin`, `filter.{key}.zmax` params.
5. Return only the requested metric columns in the response (not all columns).

Architecture note:
- Atlas currently computes many metrics through the metric engine, not direct SQL columns. Phase A should keep current screener compute flow and dynamically filter/sort in app logic for the selected metric set. Phase B can optimize hot paths with precomputed materializations.

**Backward compatibility:** Keep the existing hardcoded params working during transition. The new dynamic path can coexist — if `metrics` param is absent, fall back to current behavior.

---

## 3. Backend: Saved Views (reuse existing screens model)

### 3.1 D1 schema

```sql
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,
  metrics TEXT NOT NULL,       -- JSON array of metric keys
  filters TEXT DEFAULT '{}',   -- JSON object of filter conditions
  sort_key TEXT,
  sort_dir TEXT DEFAULT 'desc',
  states TEXT,                 -- JSON array of state codes, null = all
  is_preset INTEGER DEFAULT 0, -- 1 for built-in presets
  source TEXT DEFAULT 'screener',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(owner_key, name)
);
```

### 3.2 Endpoints

- Prefer extending existing endpoints (`/api/v1/screens`) with optional payload fields (`metrics`, `filters`, `sort_key`, `sort_dir`, `states`) rather than introducing a second parallel "views" API.
- If a dedicated API is still desired, keep route names explicit (`/api/v1/screener/views`) to avoid naming drift.

### 3.3 Built-in presets

Seed these as rows with `is_preset=1` and `owner_key='system'`:

1. **Farmland Fundamentals** — metrics: `implied_cap_rate`, `fair_value`, `cash_rent`, `corn_yield`, `soybean_yield`
2. **Solar Siting** — metrics: `solar_irradiance`, `benchmark_value`, `substation_distance`, `water_access_score` (most will show as unavailable initially — that's fine, it demonstrates the vision)
3. **Data Center Screening** — metrics: `fiber_proximity`, `wholesale_elec_price`, `water_access_score`, `benchmark_value` (same — coming_soon indicators)

---

## 4. Frontend: Screener Refactor

### 4.1 Current state (lines ~1374-1550 in `frontend/index.html`)

The `ScreenerView` component has:
- Hardcoded state variables: `minCap`, `maxCap`, `minRentMult`, `maxRentMult`, `zCapMin`, `zFairMin`, `zRentMin`
- Fixed sort options: Cap Rate, Fair Value, Cash Rent, Land Value, Access Score, NOI/Acre, Rent Multiple
- Fixed table columns matching the above

### 4.2 Target architecture

**Replace hardcoded filters with dynamic metric toggle panel:**

1. On mount, fetch `/api/v1/metrics/registry`.
2. Render a metric selection panel grouped by domain. Each metric shows:
   - Toggle checkbox
   - Display name
   - Coverage indicator (green dot = available, yellow = partial, gray = coming_soon)
3. User selections drive:
   - Which filter inputs appear (only show min/max/z-score filters for toggled-on metrics)
   - Which columns appear in the results table
   - Which sort options are available
4. "Saved Views" dropdown at top — loads/saves metric + filter configurations.

**State management:**

```javascript
const [selectedMetrics, setSelectedMetrics] = useState(['implied_cap_rate', 'fair_value', 'cash_rent']);
const [filters, setFilters] = useState({});  // { implied_cap_rate: { min: 2.5, max: 8 }, ... }
const [sortKey, setSortKey] = useState('implied_cap_rate');
const [sortDir, setSortDir] = useState('desc');
```

### 4.3 Metric toggle panel layout

```
┌─────────────────────────────────────┐
│ Metric Selection          [Presets▾]│
├─────────────────────────────────────┤
│ Land & Valuation                    │
│  ☑ Cap Rate           ●            │
│  ☑ Fair Value/Acre    ●            │
│  ☑ Cash Rent          ●            │
│  ☐ Land Value/Acre    ●            │
│  ☐ Rent Multiple      ●            │
│  ☐ NOI/Acre           ●            │
│                                     │
│ Crop & Agriculture                  │
│  ☐ Corn Yield         ◐            │
│  ☐ Soybean Yield      ◐            │
│  ☐ Wheat Yield        ◐            │
│                                     │
│ Energy & Power                      │
│  ☐ Solar Irradiance   ○ Coming    │
│  ☐ Wind Capacity      ○ Coming    │
│  ☐ Wholesale Elec     ○ Coming    │
│                                     │
│ Infrastructure                      │
│  ☐ Fiber Proximity    ○ Coming    │
│  ☐ Substation Dist    ○ Coming    │
└─────────────────────────────────────┘
● = available  ◐ = partial  ○ = coming soon
```

### 4.4 Implementation sequence

1. **Extract screener state** — pull hardcoded filter variables into a single `screenerState` object.
2. **Fetch registry on mount** — call `/api/v1/metrics/registry`, store in component state.
3. **Build toggle panel** — render domain groups with metric checkboxes from registry data.
4. **Dynamic filter inputs** — render min/max/z-score inputs only for selected metrics.
5. **Dynamic table columns** — render only selected metric columns in results.
6. **Dynamic sort options** — sort dropdown populated from selected metrics.
7. **Saved views UI** — dropdown + save/load buttons wired to extended `/api/v1/screens` payloads (or `/api/v1/screener/views` if a dedicated route is introduced).
8. **Default to "Farmland Fundamentals" preset** on first load so existing behavior is preserved.

---

## 5. Dashboard Adaptation

Lower priority than screener. Once screener works with composable metrics:

1. Dashboard summary cards should reflect the user's active metric set (or the last-used view).
2. The "Data Coverage" panel already exists — extend it to show coverage per domain, not just overall.
3. Ag Index panel remains as-is (it's a computed aggregate, not a raw metric).

---

## 6. Scenario Lab: Model Subtabs

This is a separate workstream from the composable screener. Implementation:

1. Add a model-type selector at the top of the Scenario Lab view.
2. Each model type has its own input form, sensitivity matrix, and memo template.
3. For v1, only "Farmland Valuation (DCF)" is functional — other tabs show a "Coming Soon" state with a description of what the model will do.
4. The underlying DAG compute engine is shared; only the input/output schemas differ per model type.

**Model types:**

| Tab | Input Schema | Output | Status |
|-----|-------------|--------|--------|
| Farmland Valuation | cash rent, appreciation, discount rate, hold period | NPV, IRR, fair value/acre | Active |
| Solar/Wind Project | irradiance/capacity, PPA rate, capex, degradation | Project NPV, LCOE, land lease yield | Coming Soon |
| Data Center Site | power capacity, lease rate, build cost, PUE | Site score, lease NOI, power cost/kW | Coming Soon |
| Custom/Generic | user-defined series + growth assumptions | Projected values, sensitivity table | Coming Soon |

---

## 7. Acceptance Criteria

- [ ] `GET /api/v1/metrics/registry` returns full metric catalog with domain grouping and coverage status
- [ ] Screener accepts `metrics` query param and returns only requested columns
- [ ] Screener accepts `filter.{key}.min/max/zmin/zmax` params and applies them correctly
- [ ] Frontend metric toggle panel renders from registry, grouped by domain
- [ ] Toggling metrics on/off updates filter inputs, table columns, and sort options
- [ ] Saved views CRUD works (create, load, update, delete)
- [ ] Built-in presets load correctly and cannot be deleted
- [ ] Default behavior (no saved view) loads "Farmland Fundamentals" preset
- [ ] Coming-soon metrics show as disabled with indicator, not hidden
- [ ] Existing screener functionality is not broken during transition (backward compat)

### Release safety gate
- [ ] Phase A can ship without requiring any non-ag data feed
- [ ] Existing `/api/v1/screens` saves still load in the current UI
- [ ] No anonymous-user auth regressions on write endpoints

---

## 8. Files Expected to Change

**Backend:**
- `deploy/cloudflare-worker/src/index.ts` — new routes
- `deploy/cloudflare-worker/src/services/metrics.ts` — new file, metric registry + catalog
- `deploy/cloudflare-worker/src/services/views.ts` — new file, saved views CRUD
- `deploy/cloudflare-worker/src/services/screener.ts` — refactor to accept dynamic metric params

**Frontend:**
- `frontend/index.html` — ScreenerView refactor (largest change), Dashboard adaptation, Scenario Lab model tabs

**Schema:**
- D1 migration for `saved_views` table

---

## 9. Sequencing Note (Phase A / Phase B)

This is Tier 3 work. **Do not start until:**
1. Week 1 acceptance criteria are met (dashboard/screener show real data, not mostly N/A)
2. Historical backfill covers tracked states with usable coverage
3. Research workflow (Week 2) is stable

The composable metric system is a UX architecture upgrade, not a data prerequisite. It makes the existing data more accessible and prepares the platform for multi-asset expansion, but it depends on having data to show first.

**Phase A (release-safe):**
- Registry endpoint, metric toggle UI, dynamic columns/filters over existing agriculture metric set, backward-compatible screener API behavior.

**Phase B (post-release):**
- Full cross-domain filter grammar, saved view sharing, and non-ag metric activation as new data feeds are added.
