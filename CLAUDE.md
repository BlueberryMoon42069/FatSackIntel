# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SackFinder** is a Massachusetts-focused power outage intelligence platform for solar sales professionals. It aggregates real-time utility outage data, historical DPU filings, and social media signals to generate "Knock Score" rankings — composite reliability scores indicating which towns are best prospects for solar sales.

**Critical constraint:** No mock or simulated data is displayed anywhere. All data must come from real sources (DPU filings, live utility APIs, real social data). If a data source is unavailable, the UI shows empty results, not fabricated data.

## Model Selection Rules

| Task Type | Model | Notes |
|-----------|-------|-------|
| File exploration, reading logs, simple lookups | **Haiku** | Use for `/scrape-debug`, `/db-status`, quick grep searches |
| Scraper debugging, simple fixes, docs | **Haiku** | Low-stakes, well-scoped tasks |
| Multi-file features, new API endpoints | **Sonnet** | Default model for most development work |
| Schema changes, Drizzle migrations | **Sonnet** | Use `db-reviewer` agent |
| Frontend components, UI changes | **Sonnet** | Default |
| Architectural decisions, security analysis | **Opus** | High-stakes only |
| Knock Score formula changes | **Opus** | Always use `scoring-reviewer` agent |

### Sub-Agent Routing
| Need | Agent |
|------|-------|
| Scraper returning 0 records | `scraper-debugger` |
| Audit for mock data violations | `data-validator` |
| Schema/query review | `db-reviewer` |
| Scoring algorithm change | `scoring-reviewer` |

## Commands

```bash
# Development
npm run dev          # Full-stack dev server (tsx watching, port 5000)

# Production build
npm run build        # Two-stage: Vite (client → dist/public) + esbuild (server → dist/index.cjs)
npm start            # Run production build

# Type checking
npm run check        # TypeScript type checking (no emit)

# Database
npm run db:push      # Apply Drizzle schema changes to PostgreSQL
```

There is no test suite. TypeScript checking (`npm run check`) is the primary validation tool.

## Architecture

### Monorepo Structure
- `client/` — React + Vite frontend (TypeScript)
- `server/` — Express 5 backend (TypeScript, compiled with tsx)
- `shared/` — Drizzle ORM schema and Zod types shared by both
- `script/build.ts` — Production build using esbuild + Vite

### Routing & Entry Points
- **Frontend entry:** `client/src/main.tsx` → `client/src/App.tsx` (Wouter router)
- **Backend entry:** `server/index.ts` → Express app on port 5000
- **API routes:** All defined in `server/routes.ts` under `/api/*`
- **Path aliases:** `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`

### Pages (Wouter routes)
| Route | File | Purpose |
|---|---|---|
| `/` | `live-map.tsx` | Real-time outage map with severity indicators |
| `/rankings` | `rankings.tsx` | Town Knock Score leaderboard |
| `/social` | `social.tsx` | Social sentiment by town |
| `/lookup` | `lookup.tsx` | Location-specific outage history |
| `/layers` | `layers.tsx` | Gas coverage + electric heat share maps |
| `/historical` | `historical.tsx` | Search DPU historical outage records |
| `/calculator` | `calculator.tsx` | Solar savings comparison tool |
| `/admin` | `admin.tsx` | Data pipeline management + Excel upload |

### Database Schema (`shared/schema.ts`)
Eight Drizzle ORM tables in PostgreSQL:
- `outages` — Active/historical outage GeoJSON geometries
- `reliability_metrics` — SAIDI/SAIFI/CAIDI by provider/year (seeded from real DPU reports on startup)
- `social_signals` — Social media mentions with urgency scores
- `solar_data` — H3-indexed solar potential calculations
- `location_scores` — Composite Knock Scores per town (auto-calculated from historical data on startup)
- `historical_outages` — 3,158+ real DPU filing records (town, date, customers, duration, cause)
- `scraper_logs` — One row per scraper execution (status, duration, records fetched, errors)
- `town_boundaries` — MA town boundary GeoJSON metadata (populated when boundary data available)

### Data Scrapers (`server/scrapers/`)
All scrapers extend `BaseProvider` from `server/scrapers/base.ts`:
- `national-grid.ts` / `eversource.ts` / `unitil.ts` — Kubra tile API (QuadKey system in `server/utils/quadkey.ts`)
- `mema.ts` — Massachusetts Emergency Management Agency
- `nextdoor.ts` — Nextdoor public outage map API
- `facebook.ts` — Public Facebook group scraper (no Playwright, fetch-based)
- `social.ts` — Twitter/X integration (requires `TWITTER_BEARER_TOKEN`)

Auto-scheduler runs Twitter + Nextdoor on startup (30s delay) and every 30 minutes.

### Scoring Algorithms (`server/utils/scoring.ts`)
**Knock Score** (town ranking):
- Outage Risk: 50% — historical incident frequency + duration
- Social Signals: 30% — real Twitter/Nextdoor/Facebook data
- Solar Potential: 20% — MA average 0.65

**Severity Score** (live outage display):
- Customer Factor: 40% (log10 scale, maxes ~10,000 customers)
- Time Factor: 30% (log2 scale, maxes ~64 hours)
- Peak Hour Factor: 20% (evening=1.0, morning=0.7, off-peak=0.3)
- Base: 10% for any active outage
- Labels: Critical (≥0.7), High (≥0.5), Medium (≥0.3), Low (<0.3)

### Build System
Production build (`script/build.ts`) runs two stages:
1. Vite builds client → `dist/public/`
2. esbuild bundles server → `dist/index.cjs` with 32 whitelisted external dependencies for cold-start optimization

### Authentication
Replit Auth integration in `server/replit_integrations/auth/`. Session stored in PostgreSQL via `connect-pg-simple`. Protected endpoints use `isAuthenticated()` middleware.

## Key API Endpoints

```
GET  /api/outages                    GeoJSON active outages with town, severity, hoursOut, knockScore
GET  /api/outages/heatmap            Live outage count + customers aggregated per town
GET  /api/rankings                   Town Knock Scores with historical data source indicators
GET  /api/social                     Town-level social scores, trends, dominant topic, top keywords
GET  /api/historical                 Search historical outages (filters: town, street, utility, year)
GET  /api/historical/stats           Summary stats (record count, utilities, years)
GET  /api/historical/heatmap         Town-level incident density aggregations
GET  /api/historical/summary         Location-specific historical summary (town/street)
GET  /api/layers/gas                 Returns empty + dataUnavailable flag (no real boundary data yet)
GET  /api/layers/heating             Returns empty + dataUnavailable flag (no real ACS data yet)
GET  /api/towns                      All MA towns with coordinates from DPU data
GET  /api/towns/:town/summary        Knock Score + historical stats + social for one town
GET  /api/towns/:town/timeline       Monthly outage counts over years
GET  /api/reliability/:provider      SAIDI/SAIFI/CAIDI by year with YoY trends
GET  /api/solar/estimate             Annual kWh + savings for lat/lon (NREL PVWatts)
GET  /api/health                     Scraper status, DB counts, last run times
POST /api/admin/upload-historical    Upload DPU Excel files
GET  /api/admin/status               Data pipeline status counts
POST /api/admin/scrape/nextdoor      Trigger Nextdoor scrape
POST /api/admin/scrape/facebook      Trigger Facebook scrape
POST /api/admin/scrape/all-social    Run all social scrapers simultaneously
```

## Environment Variables

```
DATABASE_URL          PostgreSQL connection string (required)
PORT                  Server port (defaults to 5000; other ports firewalled on Replit)
NODE_ENV              development | production
NREL_API_KEY          Solar calculations (falls back to DEMO_KEY if absent)
TWITTER_BEARER_TOKEN  Real social data (social scraper skipped if absent)
```

## Solar Calculator Notes
The `/calculator` page matches the ComparisonCalc spreadsheet model exactly. It accepts `?address=...&name=...` query params to pre-fill from outage detail links. The calculation model uses: monthly solar payment + escalator % per year, % offset for remaining utility bill, annual rebates applied to solar side. PDF export uses browser print.

## Historical Data Format
The Excel parser (`server/utils/excel-parser.ts`) expects DPU Outage_Accident_Report format with specific column names: `"City/Town"`, `"Date and Time Out"`, `"Original Number Customers Affected"`, etc. Town names in the database are stored uppercase to match DPU filing format. Upload via Admin page.
