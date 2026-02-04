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

### Unified Rankings System
- Built `/api/rankings` endpoint that aggregates all data sources into unified town/territory rankings
- Combines reliability metrics (SAIDI/SAIFI/CAIDI), social signals (outage/billing/intent keywords), and solar potential into composite "Knock Score"
- Supports filtering by town, minimum score, and sorting by any score component

### Admin Data Pipeline
- Added `/admin` page for data pipeline control and testing
- Import historical reliability data from embedded 2014-2023 MA DPU filings
- Trigger social signal scraping for Worcester County towns
- Monitor system status (outages, reliability records, social signals, solar data)

### Live Outage Map
- Fixed `/api/outages` to return proper GeoJSON FeatureCollection
- Map displays active outages from MEMA and National Grid providers with provider toggles

### Key API Endpoints
- `GET /api/rankings` - Unified rankings (town, minScore, sortBy, limit params)
- `GET /api/outages` - GeoJSON active outages for map display
- `GET /api/admin/status` - Data pipeline status counts
- `POST /api/admin/import-historical` - Import reliability data
- `POST /api/admin/scrape-social` - Trigger social scraper