# Adding New Datasets and Metrics

## Adding a New Dataset (No UI Changes Required)

### Step 1: Register the Data Source
Add a new row to `data_sources` table:
```python
# In seed.py or via API
src = DataSource(
    name="USDA-WASDE",
    url="https://usda.library.cornell.edu/concern/publications/3t945q76s",
    cadence="monthly",
    notes="World supply/demand estimates"
)
```

### Step 2: Create a DataSeries Definition
```python
series = DataSeries(
    series_key="usda.stocks_to_use.corn",
    geo_level="national",
    frequency="monthly",
    unit="ratio",
    source_id=src.id,
)
```

### Step 3: Write an Ingestion Adapter
Create `backend/app/ingestion/wasde_adapter.py`:
```python
from app.models.schema import DataPoint

class WASDEAdapter:
    """Adapter for USDA WASDE data."""

    def fetch(self) -> list[dict]:
        # Fetch from API/file/partnership
        pass

    def transform(self, raw_data) -> list[DataPoint]:
        # Normalize to DataPoint format
        return [
            DataPoint(
                series_id=series_id,
                geo_key="US",
                as_of_date="2025-01",
                value=0.145,
                quality_json={"source": "wasde", "imputed": False}
            )
        ]

    def ingest(self, db):
        raw = self.fetch()
        points = self.transform(raw)
        db.add_all(points)
        db.commit()
```

### Step 4: The Metric Engine Sees It Automatically
Any metric that references `usda.stocks_to_use.corn` in its dependencies will pick it up via `ctx.get_series("usda.stocks_to_use.corn")`.

---

## Adding a New Metric (No UI Changes Required)

### Step 1: Register in the Metric Engine
Add to `backend/app/services/metric_engine.py`:

```python
register(MetricSpec(
    key="stocks_to_use_signal",
    label="Stocks-to-Use Signal",
    description="Grain tightness indicator from WASDE",
    unit="score",
    category="forecasting",
    dependencies=["usda.stocks_to_use.corn"],
    formula="signal = 1 - normalize(stocks_to_use, 0.08, 0.25)",
    compute=lambda ctx: _compute_stu_signal(ctx),
))

def _compute_stu_signal(ctx):
    stu = ctx.get_series("usda.stocks_to_use.corn")
    if stu is None:
        return None
    # Normalize: 0.08 = very tight (score=1), 0.25 = loose (score=0)
    return max(0, min(1, (0.25 - stu) / (0.25 - 0.08))) * 100
```

### Step 2: It's Immediately Available
- The API `/api/v1/metrics` catalog will include it
- The screener can filter on it
- County pages will compute and display it
- The explain drawer will show its formula

### Step 3: Optional — Add to Default Screens
```python
# Add to screen filters/columns
screen = ScreenDefinition(
    name="Grain Cycle Favored",
    filters_json=[
        {"metric": "stocks_to_use_signal", "op": ">", "value": 60},
        {"metric": "implied_cap_rate", "op": ">", "value": 3.0},
    ],
    columns_json=["cash_rent", "benchmark_value", "implied_cap_rate",
                   "fair_value", "stocks_to_use_signal"],
)
```

---

## Architecture Notes

### Why No UI Changes?
1. **Metrics are self-describing**: The engine returns label, unit, formula, dependencies
2. **The UI uses generic components**: MetricCard, DataTable, etc. consume any metric
3. **Screeners/screens are data-driven**: Filter definitions reference metric keys dynamically

### Dependency Resolution
The engine uses topological sort. If your new metric depends on other metrics, they'll compute first automatically.

### Fallback Policy
Use `ctx.get_series("key", "fallback_key")` to implement state→county fallbacks. All fallbacks are logged and visible in the Explain drawer.

### Version Control
- Increment MetricSpec.version when changing formulas
- Create new AssumptionSet versions (immutable snapshots)
- RunContext records all versions for reproducibility
