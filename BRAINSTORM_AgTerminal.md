# Altira Atlas: Alternative Land Intelligence Platform

**Brainstorm & Strategic Vision Document**
**February 28, 2026**
**Revised: March 3, 2026 — Alternative Land Intelligence Pivot (D-051)**

> **Revision note:** Original brainstorm framed Atlas as agriculture-only. As of D-051, Atlas is an **alternative land intelligence platform** — farmland remains Module 1 and the launched product, but the vision extends to data center sites, energy project land, timberland, and industrial land. The core engine (z-scores, metric DAG, scenario lab, research workspace) is asset-class-agnostic. Dropped: AgTech Research & Intelligence (Module 5), Farm Operations Dashboard (Module 7). Reframed: Deal Flow shifted to real estate broadly. See `docs/ATLAS_FULL_VISION_AND_PRIORITIZED_ROADMAP.md` for the current canonical vision and prioritized stack.

---

## The One-Liner

**Altira Atlas** — a centralized intelligence platform that gives institutional investors, lenders, and land operators structured access to pricing, valuation, environmental risk, climate modeling, deal flow, and market research across alternative land asset classes — farmland, data center sites, energy project land, timberland, and industrial land.

Think: Bloomberg terminal for land assets under structural transition — agricultural consolidation, data center buildout, and energy deployment are repricing the same counties simultaneously, and nobody offers the unified analytical view.

---

## Why This Exists

Agriculture is a $5T+ global industry, yet the data ecosystem is absurdly fragmented. Farmland investors pull from USDA-NASS, FRED, county assessor records, and private brokers — all manually. Farmers check multiple apps for weather, soil, commodity prices, and input costs. AgTech investors have no centralized deal flow platform. Carbon credit buyers have no transparent marketplace data.

**The gap:** There is no single platform that unifies agricultural data the way Zillow unified real estate discovery for consumers.

**The opportunity:** Whoever builds the "single pane of glass" for agriculture captures an enormous, underserved market.

---

## Core Platform Modules

### Module 1: Land Intelligence (Current — Expand)

What you have today: county-level corn yields, cash rents, state land values, treasury rates, corn prices for 3 states.

**Expansion roadmap:**

- **Full US coverage** — all 50 states, all ~3,100 counties. NASS data exists for most; prioritize the top 20 ag states first (Iowa, Illinois, Indiana, Nebraska, Kansas, Minnesota, Ohio, Wisconsin, Missouri, South Dakota, North Dakota, Texas, California, Washington, Oregon, Idaho, Montana, Colorado, Michigan, Pennsylvania)
- **Multi-commodity support** — soybeans, wheat, cotton, rice, hay, cattle, dairy, specialty crops. NASS has all of this
- **Parcel-level data** — integrate county assessor/GIS data for actual parcel boundaries, ownership records, sale history. This is the "Zillow for farmland" layer
- **Comparable sales engine** — pull recent farmland transactions, calculate $/acre comps by soil type, irrigation status, and proximity
- **Rent-to-value ratios** — automated cap rate calculations by county
- **Cash flow modeling** — projected returns based on crop mix, input costs, commodity prices, and financing terms
- **Tax analysis** — 1031 exchange modeling, depreciation schedules, state tax implications for farmland investors

**Data sources:** USDA-NASS, USDA-ERS, county assessor APIs, state GIS portals, FRED, Farm Credit System reports

---

### Module 2: Commodity & Input Pricing Terminal

This is where you become indispensable to farmers AND investors.

**Spot & futures prices:**
- Real-time (or 15-min delayed) commodity prices: corn, soybeans, wheat, cotton, rice, cattle, hogs, dairy
- Futures curves from CME Group
- Basis tracking: local cash price vs. futures by elevator/region
- Historical price charts with technical indicators
- Seasonal price patterns and anomaly detection

**Input cost comparison:**
- Seed prices from major suppliers (Bayer/Monsanto, Corteva, Syngenta, BASF)
- Fertilizer pricing: urea, DAP, MAP, potash, anhydrous ammonia — by region
- Crop protection chemical pricing
- Fuel/diesel price tracking by state
- Equipment rental and purchase cost benchmarks
- Custom farming rates (planting, spraying, harvesting per acre)

**Margin calculator:**
- Plug in your crop, county, input costs, expected yield, and current commodity price
- Shows projected margin per acre
- Sensitivity analysis: what if corn drops $0.50? What if fertilizer goes up 20%?

**Data sources:** CME Group (futures), USDA-AMS (spot/cash), DTN/Progressive Farmer (basis), USDA-ERS (input costs), Green Markets (fertilizer), state extension services

---

### Module 3: Soil & Environmental Intelligence

**Soil data layer:**
- SSURGO/gSSURGO soil survey data — every mapped soil unit in the US
- Soil capability class, drainage class, organic matter, pH, CEC
- Productivity indices (CSR2 for Iowa, PI for Illinois, etc.)
- Soil health benchmarks by region

**Climate & weather integration:**
- Growing degree day (GDD) accumulation tracking
- Palmer Drought Severity Index by county
- NOAA historical climate data and trends
- Frost date probabilities
- Precipitation vs. evapotranspiration balance
- Climate projection models (30-year outlook by region)

**Planting decision engine:**
- "What should I plant?" recommendations based on:
  - Your soil type and capability
  - Local climate trends and projections
  - Current and projected commodity prices
  - Input cost structure for each crop
  - Water availability (irrigated vs. dryland)
  - Crop rotation history and soil health
- Monte Carlo simulation: run 10,000 scenarios with variable weather, prices, and yields

**Data sources:** USDA-NRCS (SSURGO), PRISM Climate Group, NOAA NCEI, NASA POWER, state mesonet networks, Copernicus Climate Data Store

---

### Module 4: Water & Mineral Rights

**Water rights intelligence:**
- Water rights registry data by state (western states use prior appropriation; eastern states use riparian)
- Aquifer depletion rates (Ogallala, Central Valley, etc.)
- Irrigation district allocation data
- Water market pricing where available (Colorado-Big Thompson, Murray-Darling)
- Drought monitor integration

**Mineral rights:**
- Oil & gas lease data by county
- Mineral rights ownership separation tracking (surface vs. mineral estates)
- Production royalty estimates based on nearby well data
- Wind and solar lease rates per acre by region
- Aggregate/sand/gravel extraction potential

**Carbon & environmental credits:**
- Voluntary carbon credit pricing (Verra, Gold Standard, ACR)
- Agricultural carbon program comparison (Indigo Ag, Nori, Bayer Carbon, CIBO)
- Credit calculation: estimated tonnes CO2e sequestered based on soil type, practice adoption (no-till, cover crops, etc.)
- Compliance market tracking (CA cap-and-trade, RGGI)
- Renewable energy credit (REC) pricing
- Wetland/habitat banking credit values

**Data sources:** State water rights databases, USGS water data, EIA (oil/gas), state oil & gas commissions, Ecosystem Marketplace, carbon registry APIs, USDA CRP data

---

### Module 5: AgTech Research & Intelligence

**Company database:**
- Comprehensive AgTech company profiles (2,000+ companies)
- Categorized by subsector: precision ag, biotech, robotics, supply chain, fintech, climate tech, alternative protein, vertical farming, etc.
- Funding history, key personnel, product descriptions
- Technology readiness level assessments

**Market research:**
- AgTech market size and growth projections by segment
- Adoption curves for key technologies (drones, AI, biologicals, gene editing)
- Patent landscape analysis
- University research output tracking (land-grant universities)
- Regulatory pipeline: EPA, USDA, FDA actions relevant to agtech

**Competitive intelligence:**
- Product comparison matrices (e.g., precision ag platforms side by side)
- Market share estimates by segment
- Partnership and M&A activity tracker
- Key conference and event calendar

**Data sources:** PitchBook/Crunchbase (funding), USPTO (patents), university research portals, USDA SBIR/STTR database, AgFunder data, trade publications

---

### Module 6: Deal Flow & Investment Platform

This is the "AngelList for Agriculture" layer.

**For investors (LPs, family offices, farmland funds):**
- Farmland deal listings with standardized data (soil quality, yield history, water access, comps)
- AgTech startup deal flow pipeline
- Fund performance benchmarks (NCREIF Farmland Index comparisons)
- Due diligence checklists and templates
- Portfolio analytics: geographic diversification, crop exposure, risk metrics

**For AgTech founders:**
- Investor directory: who's active in ag, what stages, what subsectors
- Pitch preparation tools
- Comparable deal terms database
- Warm intro request system

**For angel investors / syndicates:**
- Create and join AgTech investment syndicates
- Shared due diligence rooms
- SPV formation tools (partner with a provider like AngelList or Carta)
- Co-investment matching based on thesis, check size, and stage preference
- Deal memo templates and sharing

**Community features:**
- Investor forums (curated, not a free-for-all)
- Expert AMAs with farm managers, agronomists, fund GPs
- Quarterly market outlook discussions
- Regional meetup coordination

**Revenue model for this module:** Transaction fees on facilitated deals, premium subscription for deal flow access, SPV administration fees

---

### Module 7: Farm Operations Dashboard

For the actual farmer — not just the investor.

**Production tracking:**
- Field-by-field yield mapping
- Input application records (seed, fertilizer, chemical)
- Equipment hours and maintenance logs
- Labor tracking

**Financial management:**
- Revenue by field/crop
- Cost per acre breakdowns
- Crop insurance management (prevent plant, RP, ARC-CO, PLC comparison)
- Marketing plan: % of crop sold forward, storage decisions
- Cash flow projections by month

**Compliance & documentation:**
- USDA program enrollment tracking
- Conservation compliance records
- Organic certification documentation
- Carbon practice verification logs

**Data sources:** Integration with existing FMS (Granular/Corteva, Climate FieldView, John Deere Operations Center, Bushel), plus manual entry

---

## Revenue Model Options

| Revenue Stream | Target Customer | Pricing Concept |
|---|---|---|
| **Free tier** | Farmers, students | Basic county data, limited history |
| **Pro subscription** | Farmers, agronomists | $29-79/mo — full data, margin calculator, soil tools |
| **Investor subscription** | Farmland investors, analysts | $149-499/mo — full analytics, deal flow, portfolio tools |
| **Enterprise/API** | Funds, lenders, insurers | $1,000-5,000/mo — API access, bulk data, custom analytics |
| **Deal facilitation fees** | Investors, founders | 1-2% on facilitated transactions |
| **Data licensing** | Research institutions, government | Custom pricing |
| **Sponsored research** | AgTech companies | Pay to feature research/reports |

---

## Competitive Landscape & Differentiation

**Existing players and where they fall short:**

- **AcreTrader / FarmTogether** — farmland investment platforms but closed ecosystems, limited integrated research stack
- **Granular / Climate FieldView** — farm management software, not investment or market intelligence
- **DTN / Progressive Farmer** — commodity pricing but no land valuation or investment tools
- **AgFunder** — AgTech VC data but narrow focus, no farming tools
- **NREIF Farmland Index** — benchmark data but no tools, no granularity
- **Tillable** — farmland management/leasing but limited scope
- **Farmers Business Network (FBN)** — input price transparency but no investment layer

**Your differentiation:** Nobody is building the *unified* platform. Everyone is a point solution. Altira Atlas is the connective tissue — the platform that ties pricing, land, soil, climate, investment, and operations into one view.

---

## Technical Architecture Evolution

**Phase 1 (Current):** Cloudflare Workers + D1, NASS/FRED ingestion, basic API
**Phase 2:** Add commodity futures (WebSocket or polling), soil data (SSURGO bulk load), expand to all states
**Phase 3:** User accounts, saved portfolios, alerts. Move to Cloudflare Durable Objects for real-time features
**Phase 4:** Deal flow platform, community features. Add auth (Clerk/Auth0), payments (Stripe), file storage (R2)
**Phase 5:** Farm operations integration. Build APIs for third-party FMS connections

**Key technical decisions ahead:**
- Real-time commodity data: WebSocket feeds from CME vs. polling a data provider
- Parcel data: partner with a GIS data provider (Regrid, LightBox) vs. scrape county assessor sites
- User-generated content: moderation, trust/safety for the community layer
- Mobile: React Native app or progressive web app?
- AI layer: LLM-powered "ask me anything about this county/parcel/crop" — natural language queries over your data lake

---

## Suggested Phased Roadmap

### Phase 1: Foundation (Months 1-3)
- Expand data coverage to top 20 ag states
- Add soybeans, wheat commodity tracking
- Build proper frontend (React dashboard)
- User accounts and saved views
- Deploy historical backfill for all available NASS/FRED data

### Phase 2: Pricing Terminal (Months 4-6)
- Commodity futures data integration
- Input cost tracking (fertilizer, seed)
- Margin calculator tool
- Basis tracking by region
- Mobile-responsive design

### Phase 3: Soil & Climate (Months 7-9)
- SSURGO soil data integration
- Climate data layer (NOAA, PRISM)
- Planting decision engine MVP
- Interactive maps (Mapbox/Deck.gl)

### Phase 4: Investment Tools (Months 10-14)
- AgTech company database
- Deal flow listings (farmland + startups)
- Portfolio analytics
- Investor profiles and matching
- Premium subscription launch

### Phase 5: Community & Network (Months 15-18)
- Angel syndicate tools
- Forums and discussion
- Expert marketplace
- Events calendar
- Mobile app

### Phase 6: Farm Operations (Months 19-24)
- Field-level tracking
- FMS integrations
- Crop insurance tools
- Carbon practice verification

---

## Immediate Next Steps

1. **Name and brand** — Adopt "Altira Atlas" as the product name for launch materials and UX copy.
2. **Landing page** — before building more features, create a landing page that articulates the vision and starts collecting emails from potential users
3. **Finish the data foundation** — complete the historical backfill, expand to 20 states, add soybeans/wheat
4. **Build the frontend** — the product needs a proper UI: dark industrial theme, data-dense layout, and keyboard-navigable workflows.
5. **Talk to 20 potential users** — farmland investors, farm operators, AgTech founders. Validate which modules they'd pay for first
6. **Pick your wedge** — you can't build all 7 modules at once. The smartest entry point is probably Module 1 (Land Intelligence) + Module 2 (Pricing Terminal) because they share the most data infrastructure and serve the broadest audience

---

## Strategic Decisions (Resolved 2/28/2026)

**D-016: Go-to-market — B2B first, B2C expansion.**
Start with institutional users (farmland funds, ag lenders, farm credit associations) who have higher willingness to pay ($200-500/mo) and longer contracts. Once the data layer is solid, open a freemium tier for individual farmers and retail investors. B2B revenue funds the B2C expansion.

**D-017: Data cadence — daily updates at launch, real-time in Phase 3+.**
Farmland valuations move slowly (yields annual, cash rents yearly, land sales sporadic). Launch with daily NASS/FRED pulls and end-of-day commodity closes. Add 15-minute delayed futures when the pricing module ships. True real-time WebSocket tick data only when active trader users justify the cost.

**D-018: Investment platform — tools-first, marketplace later.**
Start as a data/tools platform where investors discover, analyze, and model deals, then close transactions through existing channels. Layer in marketplace features (listings, LOI templates, deal rooms) over time once deal flow volume and user trust are established. Follows the Zillow evolution: data → listings → transactions.

**D-019: Securities compliance — partner, don't self-register.**
For farmland fund investments or AgTech syndicate deals (which are securities), partner with an existing registered platform (Republic, Wefunder, or white-label) for investment facilitation. Altira Atlas provides data, research, and deal discovery; the partner handles compliance, KYC/AML, and money movement. Avoids broker-dealer registration burden.

**D-020: Parcel data — partner with Regrid.**
Building a nationwide parcel database from 3,100+ county assessor sites is a company unto itself. Regrid (formerly Loveland Technologies) has the most comprehensive open/affordable parcel dataset with reasonable API pricing. Layer our own analytics (soil quality, yield history, comps) on top of their boundary and ownership data. LightBox is the premium fallback if enterprise clients demand it.

**D-021: AI strategy — central differentiator, Claude API.**
Natural language querying over the ag data lake is the moat. Users type questions like "Show me all Iowa counties where corn yields grew >3% annually over the last decade and cash rents are below the state median" and get instant, data-backed answers with maps. Build the data lake first, then put a Claude-powered query layer on top. Already in the Anthropic ecosystem.

---

*This is a living document. The vision is enormous — the key is sequencing: nail the data foundation, prove value with the first 2-3 modules, then expand from a position of strength.*
