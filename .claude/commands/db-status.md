# /db-status

Check SackFinder database population status and scraper health.

**Usage:** `/db-status`

## Steps

1. Check overall health endpoint:
   ```bash
   curl -s http://localhost:5000/api/health | jq '.'
   ```

2. Check historical stats:
   ```bash
   curl -s http://localhost:5000/api/historical/stats | jq '.'
   ```

3. Interpret results:
   - `historicalOutages: 0` → DPU Excel files not uploaded yet → Direct to `/admin` page
   - `activeOutages: 0` → Live scrapers returning no data → Run `/scrape-debug`
   - `socialSignals24h: 0` → Twitter token missing or Nextdoor blocked
   - `reliabilityMetrics: 0` → Seed didn't run → Check `autoPopulateOnStartup` logs
   - Scraper `status: "error"` → Read `errorMessage` and run `/scrape-debug [name]`

4. Report table-by-table status with recommended actions for any empty tables.

## Empty Table Actions
| Empty Table | Action |
|-------------|--------|
| historical_outages | Upload DPU Excel files at `/admin` |
| outages | Check live scraper logs, run `/scrape-debug` |
| reliability_metrics | Restart server (seeds on startup) |
| social_signals | Add TWITTER_BEARER_TOKEN env var |
| location_scores | Will auto-calculate after historical data uploaded |
