---
name: sackfinder-data
description: Manages SackFinder outage data, historical imports, scoring calculations, and database operations. Use when the user asks to import DPU data, check data freshness, recalculate scores, query historical outages, or manage the database.
user-invocable: true
argument-hint: "[action: import|score|status|query]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# SackFinder Data Management

You are managing the SackFinder outage intelligence database. Use $ARGUMENTS to determine what action to take.

## Database Connection

The database is PostgreSQL, accessed via Drizzle ORM. Connection string is in `DATABASE_URL` env var.

Schema is defined in `shared/schema.ts`. Storage methods are in `server/storage.ts`.

## Common Actions

### Check Data Status
```bash
# Hit the admin status endpoint
curl -s http://localhost:5000/api/admin/status | npx json
```

### Import Historical Data
Historical DPU outage data is imported via Excel file upload through the Admin page (`/admin`).
The parser is in `server/utils/excel-parser.ts` and handles `.xlsx`, `.xls`, `.csv` files.

To trigger import programmatically:
```bash
curl -X POST http://localhost:5000/api/admin/upload/historical \
  -F "file=@path/to/DPU_Outage_Report.xlsx"
```

### Query Historical Outages
```bash
# Search by town
curl -s "http://localhost:5000/api/historical?town=BOSTON&limit=10"

# Get summary for a town
curl -s "http://localhost:5000/api/historical/summary?town=BOSTON"

# Get overall stats
curl -s "http://localhost:5000/api/historical/stats"

# Get heatmap data
curl -s "http://localhost:5000/api/historical/heatmap"
```

### Recalculate Scores
```bash
# Trigger batch scoring
curl -X POST http://localhost:5000/api/admin/score/batch \
  -H "Content-Type: application/json" \
  -d '{"locations": [{"h3Cell": "cell_id", "lat": 42.3, "lon": -71.8, "town": "BOSTON", "provider": "Eversource"}]}'
```

### Trigger Scrapers
```bash
# All utility providers
curl -X POST http://localhost:5000/api/admin/scrape/providers

# All social sources
curl -X POST http://localhost:5000/api/admin/scrape/all-social
```

## Scoring Formula

```
Knock Score = (Outage Risk x 0.50) + (Social Signal x 0.30) + (Solar Potential x 0.20)
```

- **Outage Risk**: Historical incident frequency + SAIDI duration metric
- **Social Signal**: Urgency-weighted mentions (outage=0.10, intent=0.05, billing=0.02 per mention + avgUrgency x 0.30)
- **Solar Potential**: MA average = 0.65 (from NREL PVWatts)

## Key Files

- Schema: `shared/schema.ts`
- Storage: `server/storage.ts`
- Routes: `server/routes.ts`
- Scoring: `server/utils/scoring.ts`
- Excel parser: `server/utils/excel-parser.ts`
- Solar: `server/utils/solar.ts`
