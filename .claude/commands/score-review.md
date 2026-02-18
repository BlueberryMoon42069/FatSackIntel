# /score-review

Audit SackFinder's Knock Score algorithm for bugs, weight imbalances, or normalization issues.

**Usage:** `/score-review`

## Steps

1. Read `server/utils/scoring.ts` for the severity score logic
2. Read `server/routes.ts` lines 416-804 (the `/api/rankings` endpoint) for the Knock Score calculation
3. Verify:
   - All weights in each scoring formula sum to 1.0
   - Normalization denominators are never zero (check `maxIncidents` guard)
   - `Math.min(1.0, ...)` caps are present where needed
   - Division by zero guards on average calculations
4. Trace through a hypothetical town with 50 incidents, 4.5hr avg duration, 3 social signals (2 outage, 1 intent), urgency 0.6
5. Calculate expected Knock Score manually and compare to algorithm output
6. Check for any `source: "sample"` or hardcoded data in the rankings response
7. Review whether the socialScore formula correctly weights outage category vs intent

Report: formula verification, sample calculation walkthrough, any bugs found with fix recommendations.
