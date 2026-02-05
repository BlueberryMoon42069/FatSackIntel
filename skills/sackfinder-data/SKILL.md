---
name: sackfinder-data
description: Manages SackFinder outage data, historical imports, and scoring calculations. Use when the user asks to import DPU data, update outage records, recalculate scores, or manage the solar lead database.
---

# SackFinder Data Management

## Database Schema

The SackFinder platform uses PostgreSQL with these tables:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `historical_outages` | DPU filing records (3,158+ records) | town, street, utility, year, customersOut, durationHours, cause |
| `outages` | Active/live outage geometries | provider, geometry (GeoJSON), customersAffected, status |
| `location_scores` | Computed knock scores per H3 cell | outageScore, socialScore, solarScore, finalScore |
| `reliability_metrics` | SAIDI/SAIFI/CAIDI by provider/year | provider, year, saidi, saifi, caidi |
| `social_signals` | Twitter/social mentions | town, text, category, urgency |
| `solar_data` | NREL solar potential per location | lat, lon, kwhPerKw, solarScore |

## Common Data Tasks

### Import Historical Outages from DPU Excel
1. User uploads Excel file via Admin page (`/admin`)
2. Backend parses columns: City/Town, Date and Time Out, Original Number Customers Affected, Duration
3. Records stored in `historical_outages` table

### Recalculate Town Scores
```sql
-- Count historical incidents per town
SELECT town, COUNT(*) as incident_count, 
       SUM(customers_out) as total_customers,
       AVG(duration_hours) as avg_duration
FROM historical_outages 
GROUP BY town 
ORDER BY incident_count DESC;
```

### Check Data Freshness
```sql
SELECT 'historical_outages' as table_name, MAX(created_at) as latest 
FROM historical_outages
UNION ALL
SELECT 'outages', MAX(reported_at) FROM outages
UNION ALL
SELECT 'social_signals', MAX(timestamp) FROM social_signals;
```

## Key API Endpoints

- `GET /api/historical/summary?town=BOSTON` - Summary stats for a town
- `GET /api/historical?town=&street=&limit=100` - Search historical records
- `GET /api/rankings` - Ranked towns by knock score
- `POST /api/admin/upload-historical` - Upload DPU Excel file

## Scoring Algorithm (Knock Score)

```
finalScore = (outageScore * 0.50) + (socialScore * 0.30) + (solarScore * 0.20)
```

- **Outage Score**: Based on incident frequency and duration from historical_outages
- **Social Score**: From urgency-weighted social media mentions (requires TWITTER_BEARER_TOKEN)
- **Solar Score**: From NREL PVWatts data (MA average ~0.65)

## File Locations

- Schema: `shared/schema.ts`
- Storage layer: `server/storage.ts`
- Excel parser: `server/utils/excel-parser.ts`
- Scoring engine: `server/utils/scoring.ts`
