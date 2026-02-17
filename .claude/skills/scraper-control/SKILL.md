---
name: scraper-control
description: Manage and debug data scrapers for utility outages, social media, and external APIs. Use when the user asks about scraper status, wants to trigger scrapes, debug scraper issues, or add new data sources.
user-invocable: true
argument-hint: "[provider: all|national-grid|eversource|twitter|nextdoor|facebook]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Scraper Control

You are managing the SackFinder data scraper system. Use $ARGUMENTS to determine which scraper to work with.

## Architecture

All scrapers live in `server/scrapers/`:

| File | Provider | API | Auth Required |
|------|----------|-----|---------------|
| `national-grid.ts` | National Grid | Kubra tile API | No |
| `eversource.ts` | Eversource | Kubra tile API | No |
| `unitil.ts` | Unitil | Direct API | No |
| `mema.ts` | MEMA | Emergency feed | No |
| `social.ts` | Twitter | Twitter API v2 | `TWITTER_BEARER_TOKEN` |
| `nextdoor.ts` | Nextdoor | Public outage map | No |
| `facebook.ts` | Facebook | Public page scrape | No |
| `index.ts` | ProviderManager | Orchestration | - |

## Provider Scrapers

Utility providers extend `BaseProvider` from `server/scrapers/base.ts`:

```typescript
abstract class BaseProvider {
  abstract scrape(): Promise<ScrapeResult>;
  // ScrapeResult = { outages: InsertOutage[], metadata: { totalCustomersAffected, ... } }
}
```

### Trigger Scrapes

```bash
# All utility providers (National Grid, Eversource, Unitil)
curl -X POST http://localhost:5000/api/admin/scrape/providers

# Twitter only
curl -X POST http://localhost:5000/api/admin/scrape/social

# Nextdoor only
curl -X POST http://localhost:5000/api/admin/scrape/nextdoor

# Facebook only
curl -X POST http://localhost:5000/api/admin/scrape/facebook

# All social (Twitter + Nextdoor + Facebook in parallel)
curl -X POST http://localhost:5000/api/admin/scrape/all-social
```

## Social Signal Processing

The `SocialScraper` in `social.ts` classifies posts by keyword matching:

- **outage** (urgency 4): "power out", "no power", "blackout", etc.
- **billing** (urgency 2): "electric bill", "rate increase", etc.
- **solar** (urgency 3): "solar panel", "solar installer", etc.
- **battery** (urgency 3): "powerwall", "backup power", etc.

Solar/battery categories are normalized to "intent" when stored.

## Auto-Scraping

The `ProviderManager.startAutoScraping()` runs on server startup:
- Initial scrape of all providers immediately
- Interval scrapes based on each provider's `config.updateInterval`
- Social scraper runs on startup (30s delay) and every 30 minutes

## Kubra Tile System

National Grid and Eversource use Kubra's QuadKey tile API:
- Utility: `server/utils/quadkey.ts`
- Converts lat/lng to Microsoft Bing Maps tile coordinates
- Fetches GeoJSON polygons from tile endpoints

## Adding a New Scraper

1. Create `server/scrapers/new-provider.ts` extending `BaseProvider`
2. Register in `server/scrapers/index.ts` ProviderManager constructor
3. Add admin trigger route in `server/routes.ts`
4. Add button in `client/src/pages/admin.tsx`
