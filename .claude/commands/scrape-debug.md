# /scrape-debug

Debug a SackFinder scraper that is returning 0 records or erroring.

**Usage:** `/scrape-debug [scraper-name]`

**Scrapers:** national-grid, eversource, unitil, mema, nextdoor, facebook, social

## Steps

1. Read `server/scrapers/$ARGUMENTS.ts` to find the target URL and parser
2. Test the URL with curl including the headers the scraper uses:
   ```bash
   curl -s -I "URL" -H "User-Agent: Mozilla/5.0"
   ```
3. Fetch the actual response body:
   ```bash
   curl -s "URL" -H "User-Agent: Mozilla/5.0" | head -200
   ```
4. Compare the actual response shape to what the parser expects
5. Check `scraper_logs` for recent error messages:
   ```bash
   curl -s http://localhost:5000/api/health | jq '.scrapers'
   ```
6. Identify the mismatch and propose a targeted fix to the scraper file

Report findings in this format:
- **Scraper**: name
- **URL tested**: full URL
- **HTTP Status**: status code
- **Response shape**: actual JSON structure
- **Expected shape**: what the parser assumes
- **Issue**: specific mismatch description
- **Fix**: code change needed
