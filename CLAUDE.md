# SackFinder — Project Memory

## What This Is

SackFinder is a Massachusetts power outage intelligence platform for solar sales targeting. It aggregates real-time outage data from utility providers, historical DPU filings, social media signals, and NREL solar potential data to produce "Knock Now" scores ranking the best towns and streets for solar sales outreach.

## Tech Stack

- **Frontend**: React 19 + TypeScript, Wouter router, TanStack React Query, Tailwind CSS v4 + shadcn/ui, Leaflet maps
- **Backend**: Node.js + Express 5, TypeScript via tsx
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Build**: Vite 7 (client → `dist/public`), esbuild (server → `dist/index.cjs`)
- **Port**: 5000

## Key Commands

```bash
npm run dev          # Start dev server (Express + Vite on port 5000)
npm run build        # Production build
npm run check        # TypeScript type checking
npm run db:push      # Apply Drizzle schema migrations
```

## Project Structure

```
shared/schema.ts         # Drizzle table definitions (source of truth for types)
server/routes.ts         # All API endpoints (~1250 lines)
server/storage.ts        # Database layer (Drizzle ORM queries)
server/scrapers/         # Data scrapers (national-grid, eversource, unitil, mema, social, nextdoor, facebook)
server/utils/scoring.ts  # Knock Score calculation engine
server/utils/solar.ts    # NREL PVWatts integration
server/utils/excel-parser.ts  # DPU Excel file parser
client/src/pages/        # 8 page components (live-map, rankings, calculator, historical, social, admin, layers, lookup)
client/src/components/   # AppShell (nav), OutageDetailDrawer, 60+ shadcn/ui components
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `historical_outages` | DPU filing records (3,158+ records, street-level) |
| `outages` | Live outage geometries from Kubra API |
| `location_scores` | Computed knock scores per H3 cell |
| `reliability_metrics` | SAIDI/SAIFI/CAIDI by provider/year |
| `social_signals` | Twitter/social mentions with urgency scores |
| `solar_data` | NREL solar potential per location |

## Scoring Algorithm

```
Knock Score = (Outage Risk × 0.50) + (Social Signal × 0.30) + (Solar Potential × 0.20)
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TWITTER_BEARER_TOKEN` | No | Twitter API v2 for social signals |
| `NREL_API_KEY` | No | Solar potential (falls back to DEMO_KEY) |

## Coding Conventions

- All town names are UPPERCASE in the database and in `townCentroids`
- Schema types are exported from `shared/schema.ts` — always import from `@shared/schema`
- Use `apiFetch()` from `client/src/lib/api.ts` for frontend API calls
- API routes follow REST conventions under `/api/*`
- No mock data — all data comes from real sources (DPU filings, Kubra API, Twitter)
- All files use TypeScript (`.ts` / `.tsx`)

## Important Rules

- Never add mock/simulated data. The platform only displays real data.
- Always run `npm run check` before committing to verify types.
- The `historical_outages` table uses ILIKE-based search — always filter with WHERE before LIMIT.
- Town centroids in `routes.ts` must be UPPERCASE keys to match DPU data.
- shadcn/ui components are in `client/src/components/ui/` — don't create new wrapper components unless necessary.

@.claude/rules/api-conventions.md
@.claude/rules/data-model.md
