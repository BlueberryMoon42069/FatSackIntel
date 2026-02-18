# Implementation Plan: API Review, Repair & Development

## Task Type
- [x] Fullstack (Backend primary, minimal frontend impact)

---

## Executive Summary

A comprehensive audit of SackFinder's backend revealed **34 API endpoints** across 7 domains. The codebase has a solid foundation but has several production-blocking bugs, security gaps, and incomplete implementations. This plan organizes work into 4 phases ordered by severity.

---

## Phase 1: Critical Bug Fixes (Production Blockers)

### 1.1 Fix Type Errors in `/api/rankings` (`server/routes.ts`)

**Problem:** `Array.from(Map)` in 3 places returns `[key, value]` tuples but code treats entries as values only. Will crash with real data.

```
// Routes.ts ~line 569, 599, 628 — current broken pattern:
Array.from(townHistorical)  // returns [key, value] tuples
Array.from(territoryScores)
Array.from(townSocial)

// Fix: iterate Map directly or destructure tuples:
for (const [town, data] of townHistorical) { ... }
// or: Array.from(townHistorical.values())
// or: Array.from(townHistorical.entries()).map(([k, v]) => ...)
```

**Files:** `server/routes.ts:569`, `server/routes.ts:599`, `server/routes.ts:628`

### 1.2 Fix Division-by-Zero Risk (`server/routes.ts:~1046`)

**Problem:** `avgDurationMinutes = totalDuration / outages.length` — crashes if outages filtered to empty.

```
// Fix: guard with length check
avgDurationMinutes: outages.length > 0 ? totalDuration / outages.length : 0
```

**File:** `server/routes.ts`

### 1.3 Fix `Math.max()` on Empty Array (`server/routes.ts:~657`)

**Problem:** `Math.max(...[])` returns `-Infinity`, poisoning all normalized scores.

```
// Fix: guard with fallback
const maxIncidents = incidents.length > 0 ? Math.max(...incidents) : 1
```

**File:** `server/routes.ts`

### 1.4 Fix Severity Score Exceeding 1.0 (`server/routes.ts:~176-183`)

**Problem:** Base factor (0.10) plus weighted components can sum to > 1.0 before the outer `Math.min(1.0, ...)` clamp — clamp is applied AFTER multiplication, not on sum.

```
// Verify formula and ensure:
const rawScore = baseScore + customerFactor * 0.40 + timeFactor * 0.30 + peakFactor * 0.20
const severity = Math.min(1.0, rawScore)   // correct placement
```

**File:** `server/routes.ts`

### 1.5 Fix Case Sensitivity in Town Lookups (`server/routes.ts:~671, 713, 723`)

**Problem:** DPU data stored UPPERCASE (`CLINTON`) but ranking lookups use title-case (`Clinton`) — lookups silently fail.

```
// Fix: normalize before lookup
const normalizedTown = town.toUpperCase()
const histData = townHistorical.get(normalizedTown)
```

Also ensure consistent casing strategy in `/api/historical/summary` and all other town-keyed maps.

**File:** `server/routes.ts`, `server/storage.ts`

---

## Phase 2: Security Fixes

### 2.1 Add Authentication Middleware to Admin Endpoints

**Problem:** All `/api/admin/*` endpoints lack auth checks. Any unauthenticated user can trigger expensive scrapes or delete data.

**Endpoints to protect:**
- `POST /api/admin/scrape/providers`
- `POST /api/admin/scrape/social`
- `POST /api/admin/scrape/nextdoor`
- `POST /api/admin/scrape/facebook`
- `POST /api/admin/scrape/all-social`
- `POST /api/admin/score/batch`
- `POST /api/admin/upload/historical`
- `DELETE /api/admin/historical/:utility/:year`

```
// Add isAuthenticated() middleware (already exists in replit_integrations/auth/)
app.post("/api/admin/scrape/providers", isAuthenticated, async (req, res) => { ... })
```

**File:** `server/routes.ts` (all admin route definitions)

### 2.2 Fix SQL Injection Risk in LIKE Filters (`server/storage.ts:~205, 208`)

**Problem:** String interpolation in LIKE filters allows injection attacks.

```
// UNSAFE (current):
sql`LOWER(${schema.historicalOutages.town}) LIKE LOWER(${'%' + filters.town + '%'})`

// SAFE (fix using Drizzle's ilike):
ilike(schema.historicalOutages.town, `%${filters.town}%`)
// Drizzle escapes the value properly via ilike()
```

**File:** `server/storage.ts`

### 2.3 Add Input Validation on Query Parameters

**Problem:** No bounds checking on lat/lon, no schema validation on POST bodies.

Key endpoints needing validation:
- `GET /api/solar/location?lat=&lng=` — validate lat in [-90,90], lng in [-180,180]
- `POST /api/solar/analyze` — validate request body schema
- `GET /api/historical?town=&year=` — validate year is 4-digit integer
- `GET /api/rankings` — no user-supplied params, lower risk

```
// Use Zod (already a project dependency via shared/schema.ts):
const latLngSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})
const { lat, lng } = latLngSchema.parse(req.query)
```

**File:** `server/routes.ts` (add validation at affected endpoints)

---

## Phase 3: API Cleanup & Layer Fixes

### 3.1 Remove Fake Layer Data or Replace with Real Sources

**Problem:** `/api/layers/gas` and `/api/layers/heating` return hardcoded sample coordinates — directly violates the "no mock data" policy.

**Options (in order of preference):**
1. **Best:** Fetch real gas service territory GeoJSON from National Grid / Eversource public resources or MA GIS (massgis.gov)
2. **Acceptable:** Return `{ type: "FeatureCollection", features: [] }` with a `dataUnavailable: true` flag so the frontend knows data is absent (not fake)
3. **Avoid:** Keep current hardcoded fake polygons

**Implementation:**
- Check `client/src/pages/layers.tsx` to understand how the frontend uses these endpoints
- If real data is not obtainable, update both endpoints to return empty FeatureCollections with metadata indicating data unavailability
- Update `LayersPage` to display a "Data not currently available" message instead of rendering fake polygons

**Files:** `server/routes.ts:1158-1244`, `client/src/pages/layers.tsx`

### 3.2 Normalize All Town Name Handling

**Problem:** Multiple places use different casing conventions for town names, causing silent lookup failures across rankings, historical, and social endpoints.

**Fix:** Create a single utility function:
```typescript
// server/utils/towns.ts (new small file)
export const normalizeTownName = (town: string): string => town.toUpperCase().trim()
export const displayTownName = (town: string): string =>
  town.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())  // Title Case
```

Apply `normalizeTownName()` consistently:
- Before all database lookups
- Before Map key insertions
- In storage.ts filter functions

**Files:** Create `server/utils/towns.ts`, update `server/routes.ts`, `server/storage.ts`

### 3.3 Fix `Promise.allSettled()` Response in `/api/admin/scrape/all-social`

**Problem:** Returns mixed fulfilled/rejected response; client can't easily determine what succeeded.

```
// Fix: restructure response
const results = await Promise.allSettled([twitter(), nextdoor(), facebook()])
const report = {
  twitter: results[0].status === 'fulfilled' ? 'success' : results[0].reason?.message,
  nextdoor: results[1].status === 'fulfilled' ? 'success' : results[1].reason?.message,
  facebook: results[2].status === 'fulfilled' ? 'success' : results[2].reason?.message,
}
res.json({ success: true, results: report })
```

**File:** `server/routes.ts:~850-870`

### 3.4 Fix Deprecated Endpoint Response Code

**Problem:** `/api/admin/import/historical` returns 400 instead of appropriate redirect.

```
// Change to 301 permanent redirect or 410 Gone with explanation
app.post("/api/admin/import/historical", (req, res) => {
  res.status(410).json({ error: "Endpoint removed. Use POST /api/admin/upload/historical" })
})
```

**File:** `server/routes.ts:~873-878`

### 3.5 Document and Stub Unitil/MEMA as Explicitly Unavailable

**Problem:** Both scrapers silently return empty data, indistinguishable from "no active outages".

**Fix:** Add a status flag to scraper results and surface in `/api/admin/status`:
```typescript
// In unitil.ts / mema.ts:
return {
  ...this.emptyResult(),
  configured: false,
  message: "Unitil Kubra API IDs not configured"
}
```

Update `/api/admin/status` to surface scraper configuration status, so the Admin page can show which providers are active vs. unconfigured.

**Files:** `server/scrapers/unitil.ts`, `server/scrapers/mema.ts`, `server/routes.ts:~895`

---

## Phase 4: Code Organization & New API Development

### 4.1 Extract Ranking Logic from routes.ts

**Problem:** `/api/rankings` handler is 283 lines inline — too large and untestable.

**Fix:** Create `server/utils/rankings.ts`:
```typescript
// New file: server/utils/rankings.ts
export async function buildTownRankings(db: Storage, options?: RankingOptions): Promise<TownRanking[]>
export function normalizeRankingScore(score: number, max: number): number
export function buildTownHistoricalMap(outages: HistoricalOutage[]): Map<string, TownHistory>
```

Route handler becomes ~20 lines calling these functions.

**Files:** Create `server/utils/rankings.ts`, shrink `server/routes.ts`

### 4.2 Consolidate Severity Scoring

**Problem:** Severity calculation appears in-line in routes.ts instead of reusing `server/utils/scoring.ts`.

**Fix:** Verify `scoring.ts` covers all severity needs, then remove duplicate inline logic from routes.ts.

**Files:** `server/utils/scoring.ts`, `server/routes.ts`

### 4.3 New API: `GET /api/admin/providers/status`

**Problem:** No endpoint exposes per-scraper health (configured/not configured, last run, last result count).

**New endpoint:**
```
GET /api/admin/providers/status
Response:
{
  providers: [
    { name: "national-grid", configured: true, lastRun: "...", outageCount: 12 },
    { name: "eversource", configured: true, lastRun: "...", outageCount: 3 },
    { name: "unitil", configured: false, reason: "Missing KUBRA IDs" },
    { name: "mema", configured: false, reason: "API not implemented" },
  ],
  socialScrapers: [
    { name: "twitter", configured: true },
    { name: "nextdoor", configured: true },
    { name: "facebook", configured: true },
  ]
}
```

**Files:** `server/scrapers/index.ts` (add status method), `server/routes.ts` (new route)

### 4.4 New API: `GET /api/towns`

**Problem:** Town names are scattered across hardcoded arrays in routes.ts, nextdoor.ts, and social.ts. No single authoritative town list.

**New endpoint:**
```
GET /api/towns
Response: { towns: ["ABINGTON", "ACTON", ...] }  // all MA towns from DPU data
```

**Implementation:** Query `DISTINCT town FROM historical_outages ORDER BY town` — real data from DPU filings.

**Files:** `server/storage.ts` (add `getDistinctTowns()`), `server/routes.ts` (new route)

### 4.5 Add Rate Limiting to Public Endpoints

**Problem:** No rate limiting on any public API — susceptible to scraping/abuse.

**Implementation:** Use `express-rate-limit` (add as dependency):
```typescript
import rateLimit from 'express-rate-limit'
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/api/', apiLimiter)
// Stricter limit for expensive endpoints:
const rankingsLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 })
app.get('/api/rankings', rankingsLimiter, ...)
```

**Files:** `server/routes.ts` or `server/index.ts`, `package.json` (add express-rate-limit)

---

## Implementation Steps (Ordered)

| # | Step | File(s) | Phase | Risk |
|---|------|---------|-------|------|
| 1 | Fix Array.from(Map) type errors in /api/rankings | routes.ts:569,599,628 | 1 | Medium |
| 2 | Fix division-by-zero in /api/historical | routes.ts:~1046 | 1 | Low |
| 3 | Fix Math.max() on empty array | routes.ts:~657 | 1 | Low |
| 4 | Fix severity score normalization | routes.ts:~176-183 | 1 | Low |
| 5 | Fix town name case sensitivity | routes.ts, storage.ts | 1 | Medium |
| 6 | Add isAuthenticated to all /api/admin/* routes | routes.ts | 2 | Low |
| 7 | Fix SQL injection in LIKE filters | storage.ts:205,208 | 2 | Low |
| 8 | Add Zod validation for lat/lng and year inputs | routes.ts | 2 | Low |
| 9 | Check layers.tsx; replace fake layer data with empty FeatureCollections + flag | routes.ts, layers.tsx | 3 | Medium |
| 10 | Create server/utils/towns.ts normalization utility | towns.ts (new) | 3 | Low |
| 11 | Fix allSettled response format | routes.ts:~850-870 | 3 | Low |
| 12 | Fix deprecated endpoint status code | routes.ts:~873 | 3 | Low |
| 13 | Add configured/unavailable flag to Unitil/MEMA scrapers | unitil.ts, mema.ts | 3 | Low |
| 14 | Expose scraper config status in /api/admin/status | routes.ts:~895 | 3 | Low |
| 15 | Extract rankings logic to server/utils/rankings.ts | rankings.ts (new) | 4 | High |
| 16 | Consolidate severity scoring via scoring.ts | routes.ts, scoring.ts | 4 | Medium |
| 17 | New endpoint: GET /api/admin/providers/status | routes.ts, scrapers/index.ts | 4 | Low |
| 18 | New endpoint: GET /api/towns | routes.ts, storage.ts | 4 | Low |
| 19 | Add express-rate-limit to public endpoints | routes.ts or index.ts | 4 | Low |

---

## Key Files

| File | Operations | Description |
|------|------------|-------------|
| `server/routes.ts` | Modify | Bug fixes, auth guards, input validation, cleanup |
| `server/storage.ts` | Modify | Fix LIKE injection, add getDistinctTowns() |
| `server/scrapers/unitil.ts` | Modify | Add configured flag |
| `server/scrapers/mema.ts` | Modify | Add configured flag |
| `server/scrapers/index.ts` | Modify | Add provider status method |
| `server/utils/towns.ts` | Create | Town name normalization utility |
| `server/utils/rankings.ts` | Create | Extract ranking logic from routes |
| `server/utils/scoring.ts` | Modify | Consolidate severity scoring |
| `client/src/pages/layers.tsx` | Read + possibly modify | Understand/update layer data handling |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Renaming/restructuring rankings logic breaks live data | Keep existing route signature; only move internal logic |
| Town case normalization breaks existing data lookups | Audit all town-keyed lookups before applying; run TypeScript check |
| Auth middleware blocks admin user who was previously unblocked | Test with valid Replit session; admin page already uses auth guard |
| Rate limiting blocks legitimate high-frequency clients | Start with generous limits (100 req/15min); monitor before tightening |
| Layer page breaks if we return empty FeatureCollections | Read layers.tsx first; add graceful "unavailable" state to UI |

---

## Out of Scope (Future Work)

- Unitil Kubra API ID discovery (requires browser DevTools inspection of Unitil outage map)
- MEMA live API integration (requires researching mema.mass.gov API)
- Facebook Graph API integration (requires app approval)
- Real gas/heating layer GeoJSON (requires MA GIS data research)
- WebSocket real-time push notifications
- Full test suite
