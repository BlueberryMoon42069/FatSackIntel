# SackFinder

## Overview

SackFinder is a Massachusetts-focused power outage intelligence platform that aggregates real-time outage data from multiple utility providers, combines it with historical reliability metrics, social media signals, and solar potential data to help identify areas with poor grid reliability. The application provides a live outage map, location rankings ("Knock Now" scores for solar sales targeting), social sentiment monitoring, and historical document search.

The platform scrapes data from utility providers (National Grid, MEMA, Eversource, Unitil), calculates composite reliability scores using SAIDI/SAIFI/CAIDI metrics, and integrates with NREL's PVWatts API for solar potential calculations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with shadcn/ui component library (New York style)
- **Maps**: Leaflet with react-leaflet for interactive mapping
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx
- **API Pattern**: RESTful endpoints under `/api/*`
- **Data Scraping**: Provider-based scraper system with base class pattern
  - Each utility provider (National Grid, MEMA) extends `BaseProvider`
  - Scrapers fetch GeoJSON outage polygons and customer counts
  - Uses Kubra tile system (QuadKey) for National Grid data

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Design**: 
  - `outages` - Active/historical outage geometries (GeoJSON)
  - `reliability_metrics` - SAIDI/SAIFI/CAIDI by provider/year
  - `social_signals` - Parsed social media mentions with urgency scores
  - `solar_data` - H3-indexed solar potential calculations
  - `location_scores` - Composite "knock scores" for lead prioritization

### Key Algorithms
- **Scoring Engine**: Weighted composite of outage risk (50%), social signals (30%), and solar potential (20%)
- **QuadKey System**: Converts lat/lng to Microsoft Bing Maps tile coordinates for Kubra API
- **Social Analysis**: Keyword categorization (outage/billing/intent) with urgency weighting

### Build System
- Client: Vite builds to `dist/public`
- Server: esbuild bundles to `dist/index.cjs` with selective dependency bundling for cold start optimization

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connected via `DATABASE_URL` environment variable
- **Drizzle Kit**: Schema migrations via `npm run db:push`

### External APIs
- **NREL PVWatts API**: Solar potential calculations (requires `NREL_API_KEY`, falls back to `DEMO_KEY`)
- **Kubra/National Grid**: Outage map tile data (public endpoints)
- **MEMA**: Massachusetts emergency management outage feeds

### Third-Party Services
- **connect-pg-simple**: PostgreSQL session storage (if sessions are enabled)
- **Leaflet**: Map tiles from OpenStreetMap

### Key NPM Dependencies
- `drizzle-orm` / `drizzle-zod`: Database ORM with Zod validation
- `@tanstack/react-query`: Async state management
- `react-leaflet`: React bindings for Leaflet maps
- `h3-js`: Uber's H3 hexagonal grid system (implied by H3 cell references)
- `wouter`: Lightweight React router
- Full shadcn/ui component set via Radix primitives

## Recent Changes (Feb 2026)

### Real DPU Historical Data Integration (Feb 4)
- **Critical**: ALL mock/simulated data removed from system. Only real data is displayed.
- Imported 3,158 real Eversource 2023 outage records from DPU Outage_Accident_Report filings
- Updated `/api/rankings` to use historical incident counts for outage risk scoring
- Added "DPU" badges to indicate real data sources in UI
- Rankings now show 146 towns with actual incident data

### Historical Data UI
- **Historical Search Page** (`/historical`): Search historical outages by town, street, utility, year with sortable results and pagination
- **Heatmap Page** (`/heatmap`): Town-level incident density visualization with colored circle markers
- **Excel Parser**: Parses real DPU Outage_Accident_Report format (column names: "City/Town", "Date and Time Out", "Original Number Customers Affected", etc.)

### Data Sources (No Mock Data)
- **Historical Outages**: Uploaded via Admin page Excel parser (DPU filings only)
- **Live Outages**: Kubra API for National Grid and Eversource (real utility data)
- **Social Signals**: Requires TWITTER_BEARER_TOKEN for real social data
- **MEMA**: Returns empty if no active emergencies (no mock fallback)

### Town Centroids
- Expanded to 90+ MA towns including Boston Metro, Western MA, Cape Cod, North Shore, Worcester County regions
- Includes Webster, Dudley, Oxford, Douglas, Uxbridge, Northbridge, Sutton, Millbury, Grafton, Shrewsbury
- All in uppercase format to match DPU filing data

### Scoring Algorithm (Knock Score)
- Outage Risk: 50% weight (based on historical incident frequency + duration)
- Social Signals: 30% weight (from real Twitter data only)
- Solar Potential: 20% weight (MA average 0.65)

### Severity Score (Live Outages) — Feb 16
- Time Factor: 30% weight (log2 scale, maxes ~64hrs)
- Customer Factor: 40% weight (log10 scale, maxes ~10,000)
- Peak Hour Factor: 20% weight (evening peak=1.0, morning=0.7, off-peak=0.3)
- Base: 10% for any active outage
- Labels: Critical (>=0.7), High (>=0.5), Medium (>=0.3), Low (<0.3)

### Key API Endpoints
- `GET /api/rankings` - Unified rankings with historical data source indicators
- `GET /api/outages` - GeoJSON active outages with town, severity, hoursOut, knockScore
- `GET /api/historical` - Search historical outages with filters
- `GET /api/historical/stats` - Summary stats (3,158 records, utilities, years)
- `GET /api/historical/heatmap` - Town-level aggregations for map visualization
- `GET /api/historical/summary` - Location-specific historical summary (town/street aggregations)
- `GET /api/layers/gas` - Gas coverage GeoJSON polygons for MA municipalities
- `GET /api/layers/heating` - Electric heat share GeoJSON for Cape Cod/Islands towns
- `POST /api/admin/upload-historical` - Upload DPU Excel files
- `GET /api/admin/status` - Data pipeline status counts

### Solar Calculator (Feb 5)
- **Calculator Page** (`/calculator`): Solar savings comparison tool matching ComparisonCalc spreadsheet exactly
  - **Inputs Tab**:
    - Customer name and property address with search button
    - Current bill with kWh usage to auto-calculate effective rate
    - **Preset Dropdowns**: Utility rate (Customer, New England, MA, National Grid, Eversource, Unitil), Utility increase (Customer, MA 5yr/10yr/25yr, NE 5yr, National 5yr), CPI inflation (National 10yr/5yr, Custom)
    - **Solar Terms**: Monthly payment ($/mo), escalator (%/yr), % offset, term (years), rebates ($/yr)
    - **12-Month Usage Table**: Jan-Dec kWh inputs with auto-calculated yearly total, average, and estimated monthly bills
    - **Address Search**: Fetches historical outage data (total outages, customers affected, avg duration) inline
  - **Dashboard Tab**: Option A (utility) vs Option B (solar) comparison with monthly advantage and total savings
  - **Model Tab**: Year-by-year pricing breakdown table showing utility, solar, savings, and cumulative totals
  - **Calculation Model**: Uses solar monthly payment + escalator, % offset for remaining utility, annual rebates
  - **PDF Export**: Print Report button generates printable one-page summary
  - Supports query params: `?address=...&name=...` to pre-fill from outage detail

### Social Scrapers & Social Page Fix (Feb 12)
- **Fixed `/api/social` endpoint** — new aggregation endpoint that returns town-level social scores, trends, dominant topic, and top keywords
- **Fixed Social Page** — replaced all hardcoded stat cards (Clinton/Westborough, +12%, Billing) with real computed values from API
- **Nextdoor Scraper** (`server/scrapers/nextdoor.ts`): Hits Nextdoor's public outage map API for 10 MA towns
- **Facebook Scraper** (`server/scrapers/facebook.ts`): Fetch-based public page scraper (no Playwright) for community groups — classifies posts as outage/billing/intent
- **Admin Scraper Buttons**: Scrape Nextdoor, Scrape Facebook, Run All Social buttons on admin page
- **Auto-scheduler**: Twitter + Nextdoor scrapers run on startup (30s delay) and every 30 minutes
- **New Admin API Endpoints**:
  - `POST /api/admin/scrape/nextdoor` — trigger Nextdoor scrape
  - `POST /api/admin/scrape/facebook` — trigger Facebook scrape
  - `POST /api/admin/scrape/all-social` — run Twitter, Nextdoor, Facebook simultaneously

### Outage Detail Drawer (Feb 5)
- Click any outage on map or in list to open detail drawer
- Shows Knock Score, Outage Risk, Social Signal, Solar Potential breakdown
- Fetches historical data summary from `/api/historical/summary` with town/street parsing
- Displays total incidents, customers affected, avg duration, common causes, recent incidents
- Links to Calculator page with address pre-filled and to full Historical search